import fs from "node:fs";
import path from "node:path";
import type {
  DashboardStats,
  PackageInfo,
  PackagesOverview,
  SkillInfo,
  SkillsOverview,
} from "../src/types";
import { readJson, walkFiles } from "./fsutil";
import { loadProvidersOverview, loadSettings } from "./models";
import * as paths from "./paths";
import { loadUsageOverview } from "./usage";

function parseFrontmatter(content: string): { name: string; description: string } {
  let name = "";
  let description = "";
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end > 0) {
      const fm = content.slice(3, end);
      for (const line of fm.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith("name:")) name = t.slice(5).trim().replace(/^["']|["']$/g, "");
        if (t.startsWith("description:"))
          description = t.slice(12).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  if (!name) {
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().startsWith("# ")) {
        name = line.trim().slice(2).trim();
        break;
      }
    }
  }
  return { name, description };
}

function skillNameFromPath(file: string): string {
  const base = path.basename(file);
  if (base.toLowerCase() === "skill.md") {
    return path.basename(path.dirname(file));
  }
  return path.basename(file, path.extname(file));
}

function collectSkillsFromDir(dir: string, source: string, out: SkillInfo[]) {
  if (!fs.existsSync(dir)) return;

  // root md files
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        const full = path.join(dir, ent.name);
        const content = fs.readFileSync(full, "utf8");
        const fm = parseFrontmatter(content);
        out.push({
          name: fm.name || skillNameFromPath(full),
          description: fm.description,
          path: full,
          source,
          usageCount: 0,
          lastUsed: null,
        });
      }
    }
  } catch {
    /* ignore */
  }

  // nested SKILL.md
  for (const full of walkFiles(dir, (p) => path.basename(p).toLowerCase() === "skill.md")) {
    if (path.dirname(full) === dir) continue;
    if (out.some((s) => s.path === full)) continue;
    const content = fs.readFileSync(full, "utf8");
    const fm = parseFrontmatter(content);
    out.push({
      name: fm.name || skillNameFromPath(full),
      description: fm.description,
      path: full,
      source,
      usageCount: 0,
      lastUsed: null,
    });
  }
}

function collectPackageSkills(npmRoot: string, out: SkillInfo[]) {
  const nm = path.join(npmRoot, "node_modules");
  if (!fs.existsSync(nm)) return;
  // shallow walk for skills dirs
  const stack: string[] = [nm];
  let depthGuard = 0;
  while (stack.length && depthGuard < 5000) {
    depthGuard += 1;
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const full = path.join(dir, ent.name);
      if (ent.name === "skills") {
        collectSkillsFromDir(full, `package:${path.dirname(full)}`, out);
      } else if (!ent.name.startsWith(".") && ent.name !== "node_modules") {
        // limit depth roughly: only top-level + scoped
        const rel = path.relative(nm, full).split(path.sep);
        if (rel.length <= 3) stack.push(full);
      }
    }
  }
}

export async function loadSkillsOverview(): Promise<SkillsOverview> {
  const skills: SkillInfo[] = [];
  collectSkillsFromDir(paths.skillsDir(), "global:~/.pi/agent/skills", skills);
  collectSkillsFromDir(paths.agentsSkillsDir(), "global:~/.agents/skills", skills);
  collectPackageSkills(paths.npmDir(), skills);

  const usage = await loadUsageOverview();
  for (const skill of skills) {
    const u = usage.skills.find((x) => x.name === skill.name);
    if (u) {
      skill.usageCount = u.count;
      skill.lastUsed = u.lastUsed ?? null;
    }
  }
  for (const u of usage.skills) {
    if (!skills.some((s) => s.name === u.name)) {
      skills.push({
        name: u.name,
        description: "(seen in session history)",
        path: "",
        source: "session-history",
        usageCount: u.count,
        lastUsed: u.lastUsed ?? null,
      });
    }
  }
  skills.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
  return {
    skills,
    toolUsage: usage.tools,
    skillUsage: usage.skills,
  };
}

function resolveInstalledPackage(npmRoot: string, spec: string): PackageInfo {
  const bare = spec.startsWith("npm:") ? spec.slice(4) : spec;
  let name = bare;
  if (bare.startsWith("@")) {
    const idx = bare.lastIndexOf("@");
    name = idx > 0 ? bare.slice(0, idx) : bare;
  } else {
    name = bare.split("@")[0] ?? bare;
  }

  const installedPath = path.join(npmRoot, "node_modules", name);
  const info: PackageInfo = {
    spec,
    name,
    version: null,
    description: null,
    installedPath: fs.existsSync(installedPath) ? installedPath : null,
    hasSkills: fs.existsSync(path.join(installedPath, "skills")),
    hasExtensions:
      fs.existsSync(path.join(installedPath, "extensions")) ||
      fs.existsSync(path.join(installedPath, "dist", "index.js")),
    skillNames: [],
  };

  const pkgJson = path.join(installedPath, "package.json");
  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = readJson(pkgJson) as any;
      info.name = pkg.name ?? info.name;
      info.version = pkg.version ?? null;
      info.description = pkg.description ?? null;
      if (pkg.pi?.skills) info.hasSkills = true;
      if (pkg.pi?.extensions) info.hasExtensions = true;
    } catch {
      /* ignore */
    }
  }

  const skillsDir = path.join(installedPath, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const full of walkFiles(skillsDir, (p) => path.basename(p).toLowerCase() === "skill.md")) {
      info.skillNames.push(skillNameFromPath(full));
      info.hasSkills = true;
    }
  }
  return info;
}

export function loadPackagesOverview(): PackagesOverview {
  const settings = loadSettings();
  const npmRoot = paths.npmDir();
  return {
    packages: settings.packages.map((spec) => resolveInstalledPackage(npmRoot, spec)),
    settingsPackages: settings.packages,
    npmRoot,
  };
}

export async function loadDashboard(): Promise<DashboardStats> {
  const overview = loadProvidersOverview();
  const skills = await loadSkillsOverview();
  const usage = await loadUsageOverview();
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = usage.byDay.find((d) => d.date === todayStr)?.totals ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
    messages: 0,
    errors: 0,
  };

  return {
    agentHome: overview.agentHome,
    defaultProvider: overview.settings.defaultProvider,
    defaultModel: overview.settings.defaultModel,
    providerCount: overview.providers.length,
    packageCount: overview.settings.packages.length,
    skillCount: skills.skills.length,
    sessionFiles: usage.sessionFiles,
    totals: usage.totals,
    today,
    topTools: usage.tools.slice(0, 8),
    topSkills: usage.skills.slice(0, 8),
  };
}
