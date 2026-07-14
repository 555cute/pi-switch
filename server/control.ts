// 增强对 pi 的控制能力：
// 1. 进程检测（找 pi 进程、内存/CPU/PID）
// 2. 包内 extension/skill 清单
// 3. 启/停（写入 settings.json packages[] + 创建 overrides.json）
// 4. 配置文件备份/恢复
// 5. 提示词管理（PiSystemPrompt 文件）
// 6. 实时事件流（SSE tail JSONL）
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readJson, walkFiles, writeJsonAtomic } from "./fsutil";
import * as paths from "./paths";
import {
  piSwitchBackupsDir,
  piSwitchConfigDir,
  piSwitchLogsDir,
} from "./appSettings";

const execAsync = promisify(exec);

/* ========== 进程管理 ========== */

export interface PiProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  cmd: string;
  cpu: number;
  memMB: number;
  startedAt: string | null;
}

export async function findPiProcesses(): Promise<PiProcessInfo[]> {
  // 检测可能的 pi 进程：node 进程且命令行含 "pi" / "@earendil-works/pi-coding-agent"
  // 也支持直接叫 pi 的可执行
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(
        `wmic process where "name='node.exe' or name='pi.exe' or name='pi.cmd'" get ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize /FORMAT:CSV`,
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      );
      const out: PiProcessInfo[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const cols = line.split(",");
        if (cols.length < 5) continue;
        const cmd = (cols[cols.length - 1] || "").toLowerCase();
        const isPi =
          cmd.includes("pi-coding-agent") ||
          cmd.includes("pi-mono") ||
          cmd.includes("earendil-works") ||
          cmd.endsWith("pi ") ||
          cmd.endsWith("pi.cmd") ||
          /[\\/]pi(\.cmd)?["']?$/.test(cmd.trim());
        if (!isPi) continue;
        const name = cols[0] || "";
        const ppid = Number(cols[1]) || null;
        const pid = Number(cols[2]) || 0;
        const memKB = Number(cols[4]) || 0;
        if (!pid) continue;
        out.push({
          pid,
          ppid,
          name,
          cmd: cols[cols.length - 1] || "",
          cpu: 0,
          memMB: Math.round(memKB / 1024),
          startedAt: null,
        });
      }
      return out;
    } catch (err) {
      return [];
    }
  }
  // unix: use ps
  try {
    const { stdout } = await execAsync(
      `ps -eo pid,ppid,comm,args,%cpu,rss --no-headers`,
    );
    const out: PiProcessInfo[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*?)\s+(\S+)\s+(\d+)$/);
      if (!m) continue;
      const [, pid, ppid, comm, args, cpu, rss] = m;
      const lower = (args || "").toLowerCase();
      const isPi =
        lower.includes("pi-coding-agent") ||
        lower.includes("pi-mono") ||
        lower.includes("earendil-works/pi") ||
        comm === "pi";
      if (!isPi) continue;
      out.push({
        pid: Number(pid),
        ppid: Number(ppid),
        name: comm,
        cmd: args,
        cpu: Number(cpu) || 0,
        memMB: Math.round(Number(rss) / 1024),
        startedAt: null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function killPiProcess(pid: number): Promise<{ ok: boolean; error?: string }> {
  try {
    if (process.platform === "win32") {
      await execAsync(`taskkill /pid ${pid} /f /t`, { windowsHide: true });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* ========== 包内扩展/技能清单 ========== */

export interface PackageDetail {
  spec: string;
  name: string;
  version: string | null;
  installedPath: string;
  description: string | null;
  extensions: Array<{ name: string; path: string; enabled: boolean }>;
  skills: Array<{ name: string; path: string; enabled: boolean }>;
  commands: Array<{ name: string; path: string; enabled: boolean }>;
  hasOverrides: boolean;
}

function listFilesInDir(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const full of walkFiles(dir, (p) => p.toLowerCase().endsWith(ext))) {
    out.push(full);
  }
  return out;
}

function overridesPath(): string {
  return path.join(piSwitchConfigDir(), "package-overrides.json");
}

export function loadOverrides(): Record<string, { extensions?: string[]; skills?: string[]; commands?: string[]; disabled?: boolean }> {
  const f = overridesPath();
  if (!fs.existsSync(f)) return {};
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function saveOverrides(o: any) {
  fs.mkdirSync(piSwitchConfigDir(), { recursive: true });
  writeJsonAtomic(overridesPath(), o);
}

export function loadPackageDetail(spec: string): PackageDetail | null {
  const settings = readJson(paths.settingsJson()) as any;
  const packages: string[] = settings?.packages || [];
  if (!packages.includes(spec)) return null;
  const bare = spec.startsWith("npm:") ? spec.slice(4) : spec;
  const installedPath = path.join(paths.npmDir(), "node_modules", bare);
  if (!fs.existsSync(installedPath)) {
    return {
      spec,
      name: bare,
      version: null,
      installedPath,
      description: null,
      extensions: [],
      skills: [],
      commands: [],
      hasOverrides: false,
    };
  }
  const pkgJson = path.join(installedPath, "package.json");
  let name = bare;
  let version: string | null = null;
  let description: string | null = null;
  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
      name = pkg.name || bare;
      version = pkg.version || null;
      description = pkg.description || null;
    } catch { /* ignore */ }
  }
  const overrides = loadOverrides();
  const ov = overrides[spec] || {};
  const exts = listFilesInDir(path.join(installedPath, "extensions"), ".ts")
    .concat(listFilesInDir(path.join(installedPath, "extensions"), ".js"))
    .concat(listFilesInDir(path.join(installedPath, "dist"), ".js"));
  const skillFiles = listFilesInDir(path.join(installedPath, "skills"), ".md");
  const cmdFiles = listFilesInDir(path.join(installedPath, "commands"), ".md")
    .concat(listFilesInDir(path.join(installedPath, "commands"), ".ts"));
  return {
    spec,
    name,
    version,
    installedPath,
    description,
    extensions: exts.map((p) => ({
      name: path.basename(p).replace(/\.(ts|js)$/, ""),
      path: p,
      enabled: !ov.extensions || ov.extensions.includes(path.basename(p).replace(/\.(ts|js)$/, "")),
    })),
    skills: skillFiles.map((p) => ({
      name: path.basename(p).replace(/\.md$/, ""),
      path: p,
      enabled: !ov.skills || ov.skills.includes(path.basename(p).replace(/\.md$/, "")),
    })),
    commands: cmdFiles.map((p) => ({
      name: path.basename(p).replace(/\.(md|ts)$/, ""),
      path: p,
      enabled: !ov.commands || ov.commands.includes(path.basename(p).replace(/\.(md|ts)$/, "")),
    })),
    hasOverrides: !!ov.disabled || !!(ov.extensions?.length || ov.skills?.length || ov.commands?.length),
  };
}

export function setPackageOverrides(
  spec: string,
  patch: { disabled?: boolean; extensions?: string[]; skills?: string[]; commands?: string[] },
): Record<string, any> {
  const overrides = loadOverrides();
  overrides[spec] = { ...overrides[spec], ...patch };
  saveOverrides(overrides);
  return overrides;
}

export function clearPackageOverrides(spec: string) {
  const overrides = loadOverrides();
  delete overrides[spec];
  saveOverrides(overrides);
  return overrides;
}

export function listAllPackagesDetail(): PackageDetail[] {
  const settings = readJson(paths.settingsJson()) as any;
  const packages: string[] = settings?.packages || [];
  return packages.map(loadPackageDetail).filter(Boolean) as PackageDetail[];
}

/* ========== 配置备份/恢复 ========== */

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  files: string[];
}

export function createBackup(label?: string): BackupFile {
  fs.mkdirSync(piSwitchBackupsDir(), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = (label || "manual").replace(/[^a-z0-9_-]/gi, "_");
  const dir = path.join(piSwitchBackupsDir(), `${ts}_${safeLabel}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = ["models.json", "auth.json", "settings.json", "trust.json"];
  const copied: string[] = [];
  for (const f of files) {
    const src = path.join(paths.piAgentHome(), f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, f));
      copied.push(f);
    }
  }
  return {
    name: path.basename(dir),
    path: dir,
    size: copied.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0),
    createdAt: new Date().toISOString(),
    files: copied,
  };
}

export function listBackups(): BackupFile[] {
  if (!fs.existsSync(piSwitchBackupsDir())) return [];
  const out: BackupFile[] = [];
  for (const ent of fs.readdirSync(piSwitchBackupsDir(), { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(piSwitchBackupsDir(), ent.name);
    const stat = fs.statSync(dir);
    const files: string[] = [];
    let size = 0;
    for (const c of fs.readdirSync(dir)) {
      files.push(c);
      size += fs.statSync(path.join(dir, c)).size;
    }
    out.push({
      name: ent.name,
      path: dir,
      size,
      createdAt: stat.mtime.toISOString(),
      files,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreBackup(name: string): { restored: string[] } {
  const dir = path.join(piSwitchBackupsDir(), name);
  if (!fs.existsSync(dir)) throw new Error("backup not found");
  const restored: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const src = path.join(dir, f);
    const dst = path.join(paths.piAgentHome(), f);
    fs.copyFileSync(src, dst);
    restored.push(f);
  }
  return { restored };
}

export function deleteBackup(name: string) {
  const dir = path.join(piSwitchBackupsDir(), name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/* ========== 提示词管理 ========== */

export function promptPath(): string {
  return path.join(piSwitchConfigDir(), "system-prompt.md");
}

export function loadPrompt(): { content: string; exists: boolean } {
  const p = promptPath();
  if (!fs.existsSync(p)) return { content: "", exists: false };
  return { content: fs.readFileSync(p, "utf8"), exists: true };
}

export function savePrompt(content: string): { content: string; exists: boolean } {
  fs.mkdirSync(piSwitchConfigDir(), { recursive: true });
  fs.writeFileSync(promptPath(), content, "utf8");
  return { content, exists: true };
}

/* ========== 实时事件流（SSE tail） ========== */

export interface RuntimeEvent {
  ts: string;
  type: string;
  data: any;
}

let lastEvent: RuntimeEvent | null = null;
const eventListeners = new Set<(e: RuntimeEvent) => void>();

export function pushEvent(e: RuntimeEvent) {
  lastEvent = e;
  for (const cb of eventListeners) {
    try {
      cb(e);
    } catch { /* ignore */ }
  }
}

export function getLastEvent() {
  return lastEvent;
}

export function onEvent(cb: (e: RuntimeEvent) => void) {
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

export function runtimeEventsPath(): string {
  fs.mkdirSync(piSwitchLogsDir(), { recursive: true });
  return path.join(piSwitchLogsDir(), "runtime.jsonl");
}

/* ========== 一次性初始化 ========== */

export function ensurePiSwitchDirs() {
  for (const d of [piSwitchConfigDir(), piSwitchBackupsDir(), piSwitchLogsDir()]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
