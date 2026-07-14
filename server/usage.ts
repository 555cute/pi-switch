import fs from "node:fs";
import readline from "node:readline";
import type {
  DailyUsage,
  ProviderUsage,
  SessionSummary,
  SkillUsage,
  TokenTotals,
  ToolUsage,
  UsageOverview,
} from "../src/types";
import { walkFiles } from "./fsutil";
import * as paths from "./paths";

function emptyTotals(): TokenTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
    messages: 0,
    errors: 0,
  };
}

function addUsage(t: TokenTotals, usage: any, isError = false) {
  t.input += Number(usage?.input ?? 0);
  t.output += Number(usage?.output ?? 0);
  t.cacheRead += Number(usage?.cacheRead ?? 0);
  t.cacheWrite += Number(usage?.cacheWrite ?? 0);
  t.totalTokens += Number(usage?.totalTokens ?? 0);
  t.cost += Number(usage?.cost?.total ?? 0);
  t.messages += 1;
  if (isError) t.errors += 1;
}

function parseDay(ts?: string | null): string | null {
  if (!ts) return null;
  if (ts.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(ts)) return ts.slice(0, 10);
  return null;
}

function sessionIdFromPath(file: string): string {
  const base = file.split(/[/\\]/).pop() ?? file;
  const stem = base.replace(/\.jsonl$/i, "");
  const parts = stem.split("_");
  return parts.length > 1 ? parts.slice(1).join("_") : stem;
}

function extractSkillName(text: string): string | null {
  if (text.startsWith("/skill:")) {
    const name = text.slice("/skill:".length).split(/\s+/)[0]?.trim();
    return name || null;
  }
  const m = text.match(/skill name="([^"]+)"/);
  return m?.[1] || null;
}

function messageText(message: any): string {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text ?? "")
      .join("\n");
  }
  return "";
}

async function scanSessionFile(
  file: string,
  acc: {
    totals: TokenTotals;
    byPm: Map<string, TokenTotals>;
    byDay: Map<string, TokenTotals>;
    tools: Map<string, { count: number; errors: number }>;
    skills: Map<string, { count: number; lastUsed?: string }>;
    sessions: SessionSummary[];
    sessionFiles: number;
    scannedLines: number;
  },
) {
  acc.sessionFiles += 1;
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let sessionId = sessionIdFromPath(file);
  let cwd: string | undefined;
  let startedAt: string | undefined;
  let currentProvider: string | undefined;
  let currentModel: string | undefined;
  const sessionTotals = emptyTotals();
  let messageCount = 0;
  let toolCalls = 0;

  for await (const lineRaw of rl) {
    const line = lineRaw.trim();
    if (!line) continue;
    acc.scannedLines += 1;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const etype = entry?.type;
    if (etype === "session") {
      if (entry.id) sessionId = String(entry.id);
      if (entry.cwd) cwd = String(entry.cwd);
      if (entry.timestamp) startedAt = String(entry.timestamp);
    } else if (etype === "model_change") {
      if (entry.provider) currentProvider = String(entry.provider);
      if (entry.modelId) currentModel = String(entry.modelId);
    } else if (etype === "message" && entry.message) {
      const message = entry.message;
      const ts = entry.timestamp ? String(entry.timestamp) : undefined;
      const day = parseDay(ts);
      const role = message.role;

      if (role === "assistant") {
        messageCount += 1;
        const provider = String(message.provider ?? currentProvider ?? "unknown");
        const model = String(message.model ?? currentModel ?? "unknown");
        currentProvider = provider;
        currentModel = model;
        const isError = message.stopReason === "error";
        if (message.usage) {
          addUsage(sessionTotals, message.usage, isError);
          addUsage(acc.totals, message.usage, isError);
          const key = `${provider}\u0000${model}`;
          const pm = acc.byPm.get(key) ?? emptyTotals();
          addUsage(pm, message.usage, isError);
          acc.byPm.set(key, pm);
          if (day) {
            const d = acc.byDay.get(day) ?? emptyTotals();
            addUsage(d, message.usage, isError);
            acc.byDay.set(day, d);
          }
        }
        if (Array.isArray(message.content)) {
          for (const p of message.content) {
            if (p?.type === "toolCall") {
              toolCalls += 1;
              const name = String(p.name ?? "unknown");
              const t = acc.tools.get(name) ?? { count: 0, errors: 0 };
              t.count += 1;
              acc.tools.set(name, t);
            }
          }
        }
      } else if (role === "toolResult") {
        const name = String(message.toolName ?? "unknown");
        const t = acc.tools.get(name) ?? { count: 0, errors: 0 };
        if (message.isError) t.errors += 1;
        acc.tools.set(name, t);
      } else if (role === "user") {
        messageCount += 1;
        const skill = extractSkillName(messageText(message));
        if (skill) {
          const s = acc.skills.get(skill) ?? { count: 0 };
          s.count += 1;
          if (ts) s.lastUsed = ts;
          acc.skills.set(skill, s);
        }
      }
    }
  }

  acc.sessions.push({
    id: sessionId,
    path: file,
    cwd: cwd ?? null,
    startedAt: startedAt ?? null,
    provider: currentProvider ?? null,
    model: currentModel ?? null,
    totals: sessionTotals,
    messageCount,
    toolCalls,
  });
}

function scanExtensionEvents(acc: {
  totals: TokenTotals;
  byPm: Map<string, TokenTotals>;
  byDay: Map<string, TokenTotals>;
  tools: Map<string, { count: number; errors: number }>;
  skills: Map<string, { count: number; lastUsed?: string }>;
  extensionEvents: number;
}) {
  const file = paths.usageLogPath();
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    acc.extensionEvents += 1;
    const day = parseDay(event.timestamp);
    if (event.type === "usage" && event.usage) {
      const provider = String(event.provider ?? "unknown");
      const model = String(event.model ?? "unknown");
      addUsage(acc.totals, event.usage);
      const key = `${provider}\u0000${model}`;
      const pm = acc.byPm.get(key) ?? emptyTotals();
      addUsage(pm, event.usage);
      acc.byPm.set(key, pm);
      if (day) {
        const d = acc.byDay.get(day) ?? emptyTotals();
        addUsage(d, event.usage);
        acc.byDay.set(day, d);
      }
    } else if (event.type === "skill" && event.name) {
      const s = acc.skills.get(String(event.name)) ?? { count: 0 };
      s.count += 1;
      if (event.timestamp) s.lastUsed = String(event.timestamp);
      acc.skills.set(String(event.name), s);
    } else if (event.type === "tool" && event.name) {
      const t = acc.tools.get(String(event.name)) ?? { count: 0, errors: 0 };
      t.count += 1;
      if (event.isError) t.errors += 1;
      acc.tools.set(String(event.name), t);
    }
  }
}

export async function loadUsageOverview(): Promise<UsageOverview> {
  const acc = {
    totals: emptyTotals(),
    byPm: new Map<string, TokenTotals>(),
    byDay: new Map<string, TokenTotals>(),
    tools: new Map<string, { count: number; errors: number }>(),
    skills: new Map<string, { count: number; lastUsed?: string }>(),
    sessions: [] as SessionSummary[],
    sessionFiles: 0,
    scannedLines: 0,
    extensionEvents: 0,
  };

  const files = walkFiles(paths.sessionsDir(), (p) => p.toLowerCase().endsWith(".jsonl"));
  for (const file of files) {
    await scanSessionFile(file, acc);
  }
  scanExtensionEvents(acc);

  const byProviderModel: ProviderUsage[] = Array.from(acc.byPm.entries())
    .map(([key, totals]) => {
      const [provider, model] = key.split("\u0000");
      return { provider, model, totals };
    })
    .sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);

  const byDay: DailyUsage[] = Array.from(acc.byDay.entries())
    .map(([date, totals]) => ({ date, totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const tools: ToolUsage[] = Array.from(acc.tools.entries())
    .map(([name, v]) => ({ name, count: v.count, errors: v.errors }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const skills: SkillUsage[] = Array.from(acc.skills.entries())
    .map(([name, v]) => ({ name, count: v.count, lastUsed: v.lastUsed ?? null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  acc.sessions.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  acc.sessions = acc.sessions.slice(0, 100);

  return {
    totals: acc.totals,
    byProviderModel,
    byDay,
    tools,
    skills,
    sessions: acc.sessions,
    sessionFiles: acc.sessionFiles,
    scannedLines: acc.scannedLines,
    extensionEvents: acc.extensionEvents,
  };
}
