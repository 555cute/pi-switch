import { useEffect, useMemo, useRef, useState } from "react";
import { ensureUsage, syncPricingNow, useCache } from "../store";
import { LineChart } from "../components/LineChart";
import { Skeleton, Tag } from "../components/UI";
import { toast } from "../components/Toast";
import { formatCost, formatDate, formatTokens } from "../utils";
import { api } from "../api";
import type {
  HourlyUsage,
  SessionSummary,
  TokenTotals,
} from "../types";

type Range = "7" | "30" | "all";
type TrendWindow = "24h" | "7d" | "30d";
type ExportKind = "days" | "sessions" | "models" | "tools" | "skills";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function totalsCols(t: TokenTotals) {
  return [
    t.input,
    t.output,
    t.cacheRead,
    t.cacheWrite,
    t.totalTokens,
    t.cost,
    t.messages,
    t.errors,
  ];
}

const TOTAL_HEADERS = [
  "input",
  "output",
  "cache_read",
  "cache_write",
  "total_tokens",
  "cost",
  "messages",
  "errors",
];

/* ---- helpers ---- */

const SOURCE_ICONS: Record<string, string> = {
  pi: "π",
  extension: "◇",
  cli: "▣",
};

const PROVIDER_ICON: Record<string, string> = {
  anthropic: "A",
  openai: "O",
  google: "G",
  openrouter: "◆",
  mistral: "M",
  groq: "Q",
  ollama: "●",
};

function providerShortName(p: string): string {
  return p.replace(/-claude$|^@cf\//, "").replace(/^provider:/, "");
}

function providerIcon(p: string): { glyph: string; tone: string } {
  const key = p.toLowerCase();
  for (const k of Object.keys(PROVIDER_ICON)) {
    if (key.includes(k)) return { glyph: PROVIDER_ICON[k], tone: k };
  }
  const g = p.trim().slice(0, 1).toUpperCase() || "?";
  return { glyph: g, tone: "neutral" };
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem.toString().padStart(2, "0")}s`;
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function hourlyToPoints(
  hours: HourlyUsage[],
  window: TrendWindow,
): { label: string; value: number; secondary: number }[] {
  if (window === "24h") {
    // last 24 hourly buckets ending now
    const now = new Date();
    const buckets: { hour: string; label: string; value: number; secondary: number }[] = [];
    const byKey = new Map(hours.map((h) => [h.hour, h]));
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600_000);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}`;
      const h = byKey.get(key);
      buckets.push({
        hour: key,
        label: `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:00`,
        value: h?.totals.totalTokens ?? 0,
        secondary: h?.totals.cost ?? 0,
      });
    }
    return buckets;
  }
  // aggregate hours into days
  const byDay = new Map<
    string,
    { value: number; secondary: number }
  >();
  for (const h of hours) {
    const day = h.hour.slice(0, 10);
    const cell = byDay.get(day) ?? { value: 0, secondary: 0 };
    cell.value += h.totals.totalTokens;
    cell.secondary += h.totals.cost;
    byDay.set(day, cell);
  }
  const list = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const slice =
    window === "7d" ? list.slice(-7) : list.slice(-30);
  return slice.map(([day, v]) => ({
    hour: day,
    label: day.slice(5).replace("-", "/"),
    value: v.value,
    secondary: v.secondary,
  }));
}

/* ---------- pricing row type ---------- */

interface PricingRow {
  provider: string;
  model: string;
  inputPer1k: number | null;
  outputPer1k: number | null;
  cacheReadPer1k: number | null;
  cacheWritePer1k: number | null;
  source: "models.json" | "synced" | "unknown";
  matchedAs?: string;
}

interface PricingResponse {
  freshness: {
    loaded: boolean;
    fetchedAt?: string;
    count?: number;
    ageMs?: number;
    source?: string;
  };
  rows: PricingRow[];
}

function priceAgeLabel(ms?: number): string {
  if (ms == null) return "未同步";
  const m = Math.round(ms / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

function priceCell(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "免费";
  if (v < 0.0001) return v.toExponential(2);
  return v.toFixed(4);
}

/**
 * Lightweight client-side normalizer matching server/pricing.ts.
 * Lets us resolve model names across provider aliases on the fly.
 */
function normalizeId(raw: string): string {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  s = s.replace(/^[a-z0-9-]+[/\\]/, "");
  s = s.replace(/^@cf\//, "");
  s = s.replace(/[<>()[\]{}]/g, "");
  s = s.replace(/[\s._]+/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/-(preview|exp|beta|alpha|latest|free)$/g, "");
  s = s.replace(/-\d{4}-\d{2}-\d{2}$/g, "");
  s = s.replace(/-\d{8}$/g, "");
  return s;
}

function versionVariants(s: string): string[] {
  const out = new Set<string>([s]);
  out.add(s.replace(/(\d+)-(\d+)/g, "$1.$2"));
  out.add(s.replace(/(\d+)\.(\d+)/g, "$1-$2"));
  return Array.from(out);
}

/**
 * Find a pricing row for (provider, model) using the same multi-strategy
 * approach as the server: exact -> normalized -> version variants ->
 * model-only across all providers.
 */
function findPricingRow(
  provider: string,
  model: string,
  rows: PricingRow[],
): { row: PricingRow; matchedAs: string } | null {
  const p = (provider ?? "").toLowerCase();
  const m = (model ?? "").toLowerCase();
  if (!m) return null;

  // 1) exact "provider/model"
  for (const r of rows) {
    if (r.provider.toLowerCase() === p && r.model.toLowerCase() === m) {
      return { row: r, matchedAs: "exact" };
    }
  }
  // 2) normalized
  const nm = normalizeId(model);
  for (const r of rows) {
    if (normalizeId(r.provider) === normalizeId(provider) && normalizeId(r.model) === nm) {
      return { row: r, matchedAs: "normalized" };
    }
  }
  // 3) version variants
  for (const v of versionVariants(nm)) {
    for (const r of rows) {
      if (normalizeId(r.model) === v) {
        return { row: r, matchedAs: "version-variant" };
      }
    }
  }
  // 4) model-only anywhere
  for (const r of rows) {
    if (r.model.toLowerCase() === m) {
      return { row: r, matchedAs: "model-only" };
    }
  }
  return null;
}

/**
 * Compute a session's cost from synced pricing, falling back to the
 * stored cost if no price can be resolved.
 */
function computeSessionCost(
  s: SessionSummary,
  pricing: PricingResponse | null | undefined,
): { cost: number; source: "synced" | "stored" | "unknown"; matchedAs?: string; row?: PricingRow } {
  const stored = s.totals?.cost ?? 0;
  if (!pricing || !pricing.rows?.length) {
    return { cost: stored, source: stored > 0 ? "stored" : "unknown" };
  }
  const found = findPricingRow(s.provider ?? "", s.model ?? "", pricing.rows);
  if (!found) {
    return { cost: stored, source: stored > 0 ? "stored" : "unknown" };
  }
  const t = s.totals;
  const inP = found.row.inputPer1k ?? 0;
  const outP = found.row.outputPer1k ?? 0;
  const crP = found.row.cacheReadPer1k ?? 0;
  const cwP = found.row.cacheWritePer1k ?? 0;
  const cost =
    (inP * (t.input ?? 0)) / 1000 +
    (outP * (t.output ?? 0)) / 1000 +
    (crP * (t.cacheRead ?? 0)) / 1000 +
    (cwP * (t.cacheWrite ?? 0)) / 1000;
  if (cost > 0) return { cost, source: "synced", matchedAs: found.matchedAs, row: found.row };
  return { cost: stored, source: stored > 0 ? "stored" : "unknown" };
}

export function Usage() {
  const cache = useCache();
  const data = cache.usage;
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [trend, setTrend] = useState<TrendWindow>("24h");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [exportKind, setExportKind] = useState<ExportKind>("sessions");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const pageSize = 12;
  const tableRef = useRef<HTMLDivElement | null>(null);
  // Pricing comes from the shared cache (preloaded on app start).
  // Local state is only kept as a safety net in case the cache is empty.
  const [_localPricing, setPricing] = useState<PricingResponse | null>(null);

  useEffect(() => {
    ensureUsage();
  }, []);

  useEffect(() => {
    api
      .getPricing()
      .then(setPricing)
      .catch(() => {});
  }, []);

  // Use shared cache when available, fall back to local safety-net fetch
  const effectivePricing = cache.pricing ?? _localPricing;

  /* filtered sessions */
  const filteredSessions = useMemo(() => {
    if (!data) return [] as SessionSummary[];
    const ql = q.trim().toLowerCase();
    return data.sessions.filter((s) => {
      if (sourceFilter !== "all") {
        const isExt = s.path?.includes?.("extensions/") ?? false;
        const isCli = s.path?.includes?.("cli/") ?? false;
        if (sourceFilter === "extension" && !isExt) return false;
        if (sourceFilter === "cli" && !isCli) return false;
        if (sourceFilter === "pi" && (isExt || isCli)) return false;
      }
      if (modelFilter !== "all" && s.model !== modelFilter) return false;
      if (!ql) return true;
      return (
        (s.cwd ?? "").toLowerCase().includes(ql) ||
        (s.provider ?? "").toLowerCase().includes(ql) ||
        (s.model ?? "").toLowerCase().includes(ql) ||
        s.id.toLowerCase().includes(ql)
      );
    });
  }, [data, q, sourceFilter, modelFilter]);

  /* range stats */
  const dayLimit = range === "7" ? 7 : range === "30" ? 30 : data?.byDay.length ?? 0;
  const days = (data?.byDay ?? []).slice(-dayLimit);
  const rangedTotals = days.reduce(
    (acc, d) => ({
      tokens: acc.tokens + d.totals.totalTokens,
      cost: acc.cost + d.totals.cost,
      msgs: acc.msgs + d.totals.messages,
      errors: acc.errors + d.totals.errors,
      newInput: acc.newInput + d.totals.input + d.totals.cacheWrite,
      output: acc.output + d.totals.output,
      created: acc.created + d.totals.messages,
      hits: acc.hits + d.totals.cacheRead,
    }),
    {
      tokens: 0,
      cost: 0,
      msgs: 0,
      errors: 0,
      newInput: 0,
      output: 0,
      created: 0,
      hits: 0,
    },
  );

  const allTotals = data?.totals;
  const cacheRate =
    allTotals && allTotals.totalTokens > 0
      ? (allTotals.cacheRead / allTotals.totalTokens) * 100
      : 0;

  /* model list for filter */
  const allModels = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(
      new Set(data.sessions.map((s) => s.model ?? "").filter(Boolean)),
    );
  }, [data]);

  /* pagination */
  const total = filteredSessions.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedSessions = filteredSessions.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);
  useEffect(() => setPageInput(String(page)), [page]);

  /* attach computed cost to each row */
  const pagedWithCost = useMemo(() => {
    return pagedSessions.map((s) => {
      try {
        return { session: s, ...computeSessionCost(s, effectivePricing) };
      } catch (e) {
        return {
          session: s,
          cost: s.totals?.cost ?? 0,
          source: "stored" as const,
        };
      }
    });
  }, [pagedSessions, effectivePricing]);

  /* export */
  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = (kind: ExportKind = exportKind) => {
    if (!data) return;
    let rows: unknown[][] = [];
    let name = `pi-usage-${kind}-${stamp}.csv`;
    if (kind === "days") {
      rows = [
        ["date", ...TOTAL_HEADERS],
        ...days.map((d) => [d.date, ...totalsCols(d.totals)]),
      ];
      name = `pi-usage-days-${range}-${stamp}.csv`;
    } else if (kind === "sessions") {
      rows = [
        [
          "started_at",
          "cwd",
          "provider",
          "model",
          "input",
          "output",
          "cache_read",
          "cache_write",
          "total_tokens",
          "cost",
          "messages",
          "tool_calls",
          "duration_ms",
          "ttft_ms",
          "status",
        ],
        ...filteredSessions.map((s) => [
          s.startedAt ?? "",
          s.cwd ?? "",
          s.provider ?? "",
          s.model ?? "",
          s.totals.input,
          s.totals.output,
          s.totals.cacheRead,
          s.totals.cacheWrite,
          s.totals.totalTokens,
          s.totals.cost,
          s.messageCount,
          s.toolCalls,
          s.timing?.durationMs ?? "",
          s.timing?.ttftMs ?? "",
          s.status,
        ]),
      ];
      name = `pi-usage-sessions-${stamp}.csv`;
    } else if (kind === "models") {
      rows = [
        ["provider", "model", ...TOTAL_HEADERS],
        ...data.byProviderModel.map((p) => [
          p.provider,
          p.model,
          ...totalsCols(p.totals),
        ]),
      ];
      name = `pi-usage-models-${stamp}.csv`;
    } else if (kind === "tools") {
      rows = [
        ["tool", "calls", "errors", "error_rate_pct"],
        ...data.tools.map((t) => [
          t.name,
          t.count,
          t.errors,
          t.count > 0 ? ((t.errors / t.count) * 100).toFixed(2) : "0",
        ]),
      ];
      name = `pi-usage-tools-${stamp}.csv`;
    } else {
      rows = [
        ["skill", "count", "last_used"],
        ...data.skills.map((s) => [s.name, s.count, s.lastUsed ?? ""]),
      ];
      name = `pi-usage-skills-${stamp}.csv`;
    }
    downloadCsv(name, rows);
    toast(`已导出 ${name}`, "ok");
  };

  const exportAll = () => {
    (["days", "sessions", "models", "tools", "skills"] as ExportKind[]).forEach(
      (k) => exportCsv(k),
    );
  };

  /* derived: trend points */
  const trendPoints = useMemo(() => {
    if (!data) return [] as { label: string; value: number; secondary: number }[];
    return hourlyToPoints(data.byHour, trend);
  }, [data, trend]);

  /* workspace-level cost: aggregate every session using synced pricing.
     Falls back to stored totals.cost when pricing is missing. */
  const { totalComputedCost, costSource, costMatched, costSessions } =
    useMemo(() => {
      if (!data) {
        return {
          totalComputedCost: 0,
          costSource: "unknown" as const,
          costMatched: 0,
          costSessions: 0,
        };
      }
      let sum = 0;
      let matched = 0;
      let src: "synced" | "stored" | "unknown" = "unknown";
      for (const s of data.sessions) {
        const c = computeSessionCost(s, effectivePricing);
        sum += c.cost;
        if (c.source === "synced") {
          matched += 1;
          src = "synced";
        } else if (c.source === "stored" && c.cost > 0) {
          src = src === "synced" ? "synced" : "stored";
        }
      }
      return {
        totalComputedCost: sum,
        costSource: src,
        costMatched: matched,
        costSessions: data.sessions.length,
      };
    }, [data, effectivePricing]);

  if (!data || !allTotals) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>
              用量 <span className="en">Usage</span>
            </h1>
            <p className="muted page-kicker">扫描中…</p>
          </div>
        </header>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card" key={i}>
              <Skeleton width="50%" height={10} />
              <div style={{ height: 8 }} />
              <Skeleton width="70%" height={20} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* hero "真实消耗 Tokens": cumulative (sum of input+output+cache) without cache write */
  const realTokens = allTotals.input + allTotals.output + allTotals.cacheRead;
  const totalRequests = allTotals.messages;

  return (
    <div className="page usage-page">
      <header className="page-header">
        <div>
          <h1>
            用量 <span className="en">Usage</span>
          </h1>
          <p className="muted page-kicker">
            {data.sessionFiles} 个会话 · {data.scannedLines.toLocaleString()} 行记录
          </p>
        </div>
        <div className="header-actions">
          <select
            className="input sm"
            value={exportKind}
            onChange={(e) => setExportKind(e.target.value as ExportKind)}
            title="导出类型"
          >
            <option value="sessions">导出会话</option>
            <option value="days">导出按日</option>
            <option value="models">导出模型</option>
            <option value="tools">导出工具</option>
            <option value="skills">导出技能</option>
          </select>
          <button type="button" className="btn sm" onClick={() => exportCsv()}>
            导出 CSV
          </button>
          <button type="button" className="btn sm ghost" onClick={exportAll}>
            全部导出
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => ensureUsage(true)}
          >
            刷新
          </button>
        </div>
      </header>

      {/* Top toolbar: source icon filters + dropdowns + refresh time */}
      <div className="usage-toolbar panel">
        <div className="usage-toolbar-left">
          <div className="source-pills">
            {(["all", "pi", "extension", "cli"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`source-pill ${sourceFilter === s ? "active" : ""}`}
                onClick={() => setSourceFilter(s)}
                title={
                  s === "all"
                    ? "全部来源"
                    : s === "pi"
                      ? "pi 编码代理"
                      : s === "extension"
                        ? "扩展"
                        : "CLI"
                }
              >
                <span className="source-pill-glyph">
                  {s === "all" ? "⊞" : SOURCE_ICONS[s] ?? "?"}
                </span>
              </button>
            ))}
          </div>

          <div className="usage-select-group">
            <select
              className="input sm"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="all">全部模型</option>
              {allModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="usage-toolbar-right">
          <div className="seg">
            {(
              [
                { v: "7", label: "近 7 天" },
                { v: "30", label: "近 30 天" },
                { v: "all", label: "全部" },
              ] as { v: Range; label: string }[]
            ).map((r) => (
              <button
                key={r.v}
                type="button"
                className={`seg-btn ${range === r.v ? "active" : ""}`}
                onClick={() => setRange(r.v)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero card: real tokens consumed */}
      <section className="panel usage-hero">
        <div className="usage-hero-main">
          <div className="usage-hero-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="usage-hero-text">
            <div className="usage-hero-label">真实消耗 Tokens</div>
            <div className="usage-hero-row">
              <span className="usage-hero-value">
                {realTokens.toLocaleString()}
              </span>
              <span className="usage-hero-aside">
                <span className="usage-hero-approx">≈</span>
                <span className="usage-hero-sub">
                  {formatTokens(allTotals.totalTokens)}
                </span>
              </span>
            </div>
            <div className="usage-hero-hint">
              含缓存读取 · 累计 {formatTokens(allTotals.totalTokens)} tokens
            </div>
          </div>
        </div>

        <div className="usage-hero-side">
          <div className="usage-hero-stat">
            <div className="usage-hero-stat-label">总请求数</div>
            <div className="usage-hero-stat-value">
              <span className="usage-hero-stat-ico">📈</span>
              {totalRequests.toLocaleString()}
            </div>
          </div>
          <div className="usage-hero-stat">
            <div className="usage-hero-stat-label">总成本</div>
            <div
              className="usage-hero-stat-value"
              title={
                costSource === "synced"
                  ? `按联网定价计算（${costMatched}/${costSessions} 个会话）`
                  : costSource === "stored"
                    ? "来自会话记录中的 cost 字段"
                    : "未找到定价"
              }
            >
              <span className="usage-hero-stat-ico green">$</span>
              {formatCost(totalComputedCost)}
            </div>
          </div>
        </div>
      </section>

      {/* 2x2 sub-cards */}
      <div className="usage-grid-2x2">
        <div className="panel usage-tile">
          <div className="usage-tile-head">
            <span className="usage-tile-ico blue">↓</span>
            <span>新增输入</span>
          </div>
          <div className="usage-tile-value">{rangedTotals.newInput.toLocaleString()}</div>
          <div className="usage-tile-hint">
            累计 {formatTokens(allTotals.input + allTotals.cacheWrite)}
          </div>
        </div>
        <div className="panel usage-tile">
          <div className="usage-tile-head">
            <span className="usage-tile-ico violet">↑</span>
            <span>Output</span>
          </div>
          <div className="usage-tile-value">{rangedTotals.output.toLocaleString()}</div>
          <div className="usage-tile-hint">
            累计 {formatTokens(allTotals.output)}
          </div>
        </div>
        <div className="panel usage-tile">
          <div className="usage-tile-head">
            <span className="usage-tile-ico teal">💬</span>
            <span>创建</span>
          </div>
          <div className="usage-tile-value">{rangedTotals.created.toLocaleString()}</div>
          <div className="usage-tile-hint">
            消息 · 累计 {allTotals.messages}
          </div>
        </div>
        <div className="panel usage-tile">
          <div className="usage-tile-head">
            <span className="usage-tile-ico orange">⚡</span>
            <span>命中</span>
          </div>
          <div className="usage-tile-value">{rangedTotals.hits.toLocaleString()}</div>
          <div className="usage-tile-hint">
            cache_read · 累计 {formatTokens(allTotals.cacheRead)}
          </div>
        </div>
      </div>

      {/* Cache hit rate */}
      <section className="panel usage-cache">
        <div className="usage-cache-head">
          <span>缓存命中率</span>
          <span className="usage-cache-value green">{cacheRate.toFixed(1)}%</span>
        </div>
        <div className="usage-cache-track">
          <div
            className="usage-cache-fill"
            style={{ width: `${Math.min(100, cacheRate)}%` }}
          />
        </div>
        <div className="usage-cache-legend">
          <span>read {formatTokens(allTotals.cacheRead)}</span>
          <span>write {formatTokens(allTotals.cacheWrite)}</span>
          <span>total {formatTokens(allTotals.totalTokens)}</span>
        </div>
      </section>

      {/* Trend chart */}
      <section className="panel usage-trend">
        <div className="panel-header">
          <h2>
            使用趋势 <span className="en">Trend</span>
          </h2>
          <div className="row-gap">
            <div className="seg">
              {(
                [
                  { v: "24h", label: "当天" },
                  { v: "7d", label: "7 天" },
                  { v: "30d", label: "30 天" },
                ] as { v: TrendWindow; label: string }[]
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  className={`seg-btn ${trend === t.v ? "active" : ""}`}
                  onClick={() => setTrend(t.v)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <LineChart
          points={trendPoints}
          secondary
          height={300}
          emptyText={
            trend === "24h"
              ? "当天暂无活动"
              : `${trend === "7d" ? "近 7" : "近 30"} 天暂无活动`
          }
        />
      </section>

      {/* Sessions table (ccswitch layout) */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            会话记录 <span className="en">Sessions</span>
          </h2>
          <div className="row-gap">
            <input
              className="input sm"
              placeholder="搜索 cwd / 模型 / id…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              style={{ width: 200 }}
            />
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => exportCsv("sessions")}
            >
              CSV
            </button>
          </div>
        </div>
        <div className="table-wrap" ref={tableRef}>
          <table className="table-cc">
            <thead>
              <tr>
                <th>时间</th>
                <th>供应商</th>
                <th>计费模型</th>
                <th className="num">输入</th>
                <th className="num">输出</th>
                <th className="num">总成本</th>
                <th>用时 / 首字</th>
                <th>状态</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              {pagedSessions.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-inline">暂无数据</div>
                  </td>
                </tr>
              ) : (
                pagedWithCost.map(({ session: s, cost, source }) => {
                  const src = s.path?.includes("extensions/")
                    ? "extension"
                    : s.path?.includes("cli/")
                      ? "cli"
                      : "pi";
                  const { glyph, tone } = providerIcon(s.provider ?? "");
                  return (
                    <tr key={s.path}>
                      <td>{formatDate(s.startedAt)}</td>
                      <td>
                        <span className={`provider-chip tone-${tone}`}>
                          {glyph}
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          {providerShortName(s.provider ?? "—")}
                        </span>
                      </td>
                      <td>
                        <code className="model-code">{s.model ?? "—"}</code>
                      </td>
                      <td className="num">
                        {formatTokens(s.totals.input + s.totals.cacheWrite)}
                      </td>
                      <td className="num">
                        {formatTokens(s.totals.output)}
                      </td>
                      <td
                        className="num"
                        title={
                          source === "synced"
                            ? "按联网定价计算"
                            : source === "stored"
                              ? "来自会话记录"
                              : "未找到定价"
                        }
                      >
                        {formatCost(cost)}
                      </td>
                      <td>
                        <span className="muted">
                          {s.timing
                            ? `${formatMs(s.timing.durationMs)} · ${formatMs(s.timing.ttftMs ?? 0)}`
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill status-${s.status}`}
                        >
                          {s.status === "ok"
                            ? "完成"
                            : s.status === "error"
                              ? "失败"
                              : "进行中"}
                        </span>
                      </td>
                      <td>
                        <span className={`src-pill src-${src}`}>
                          {SOURCE_ICONS[src]} {src}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-footer">
          <span>共 {total} 条记录</span>
          <div className="row-gap">
            <button
              type="button"
              className="btn xs ghost icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="上一页"
            >
              ‹
            </button>
            <button
              type="button"
              className="btn xs ghost icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="下一页"
            >
              ›
            </button>
            <span className="muted small">页码</span>
            <input
              className="input xs"
              style={{ width: 56, height: 26, padding: "0 6px" }}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(pageInput);
                  if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                    setPage(n);
                  } else {
                    setPageInput(String(page));
                  }
                }
              }}
            />
            <button
              type="button"
              className="btn xs"
              onClick={() => {
                const n = Number(pageInput);
                if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                  setPage(n);
                }
              }}
            >
              跳转
            </button>
          </div>
        </div>
      </section>

      {/* Pricing accordion */}
      <PricingSection />
    </div>
  );
}

/* ---------- pricing accordion (self-contained, fetches /api/pricing) ---------- */

function PricingSection() {
  const cache = useCache();
  const [open, setOpen] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("");
  // Use the shared cache so we don't double-fetch on every mount.
  const data = cache.pricing;

  const onSync = async (force: boolean) => {
    setSyncing(true);
    try {
      const r = await syncPricingNow(force);
      if (r.ok) {
        toast(`已同步 ${r.count ?? 0} 个模型定价`, "ok");
      } else {
        toast(`同步失败：${r.error ?? "未知错误"}`, "err");
      }
    } finally {
      setSyncing(false);
    }
  };

  const rows = data?.rows ?? [];
  const freshness = data?.freshness;
  const ql = filter.trim().toLowerCase();
  const filtered = ql
    ? rows.filter(
        (r) =>
          r.provider.toLowerCase().includes(ql) ||
          r.model.toLowerCase().includes(ql),
      )
    : rows;

  // group by provider
  const byProvider = new Map<string, PricingRow[]>();
  for (const r of filtered) {
    const list = byProvider.get(r.provider) ?? [];
    list.push(r);
    byProvider.set(r.provider, list);
  }
  const groups = Array.from(byProvider.entries())
    .map(([provider, list]) => ({ provider, list }))
    .sort((a, b) => a.provider.localeCompare(b.provider));

  // counts by source
  const local = rows.filter((r) => r.source === "models.json").length;
  const unknown = rows.filter((r) => r.source === "unknown").length;

  return (
    <section className="panel pricing-section">
      <div
        className="pricing-head"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className="pricing-ico">$</span>
        <span className="pricing-titles">
          <span className="pricing-title">成本定价</span>
          <span className="pricing-sub">
            本地{" "}
            <strong className="pricing-sub-strong">{local}</strong> ·
            联网同步{" "}
            <strong className="pricing-sub-strong">
              {freshness?.count ?? 0}
            </strong>{" "}
            个模型 · 未匹配{" "}
            <strong className="pricing-sub-strong">{unknown}</strong>
          </span>
        </span>
        <span
          className={`pricing-meta ${freshness?.loaded ? "ok" : "warn"}`}
        >
          {freshness?.loaded ? priceAgeLabel(freshness.ageMs) : "未同步"}
        </span>
        <button
          type="button"
          className="btn xs"
          disabled={syncing}
          onClick={(e) => {
            e.stopPropagation();
            onSync(false);
          }}
          title="从 OpenRouter 拉取最新定价"
        >
          {syncing ? "同步中…" : "同步"}
        </button>
        <span className={`pricing-chevron ${open ? "open" : ""}`}>›</span>
      </div>

      {open ? (
        <div className="pricing-body">
          <div className="pricing-toolbar">
            <input
              className="input sm"
              placeholder="按供应商 / 模型搜索…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="row-gap">
              <span className="muted small">
                命中 <strong>{filtered.length}</strong> / {rows.length}
              </span>
              {!freshness?.loaded ? (
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={syncing}
                  onClick={() => onSync(true)}
                >
                  {syncing ? "同步中…" : "立即同步"}
                </button>
              ) : null}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="empty-inline">
              {freshness?.loaded
                ? "没有匹配的模型"
                : "未发现定价数据，请点击「同步」拉取"}
            </div>
          ) : (
            groups.map((g, i) => (
              <PricingProviderGroup
                key={g.provider}
                group={g}
                defaultOpen={i < 3}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function PricingProviderGroup({
  group,
  defaultOpen = false,
}: {
  group: { provider: string; list: PricingRow[] };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pricing-provider">
      <div
        className="pricing-provider-head"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className={`pricing-chevron ${open ? "open" : ""}`}>›</span>
        <span>{group.provider}</span>
        <span className="muted small">{group.list.length} 个模型</span>
      </div>
      {open ? (
        <div className="pricing-table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th className="num">输入 $/1k</th>
                <th className="num">输出 $/1k</th>
                <th className="num">缓存读 $/1k</th>
                <th className="num">缓存写 $/1k</th>
                <th>来源</th>
                <th>匹配</th>
              </tr>
            </thead>
            <tbody>
              {group.list.map((r) => (
                <tr key={`${r.provider}-${r.model}`}>
                  <td>
                    <code>{r.model}</code>
                  </td>
                  <td className="num">{priceCell(r.inputPer1k)}</td>
                  <td className="num">{priceCell(r.outputPer1k)}</td>
                  <td className="num">{priceCell(r.cacheReadPer1k)}</td>
                  <td className="num">{priceCell(r.cacheWritePer1k)}</td>
                  <td>
                    <Tag
                      tone={
                        r.source === "models.json"
                          ? "ok"
                          : r.source === "synced"
                            ? "info"
                            : "warn"
                      }
                    >
                      {r.source === "models.json"
                        ? "本地"
                        : r.source === "synced"
                          ? "联网"
                          : "未匹配"}
                    </Tag>
                  </td>
                  <td>
                    <span className="muted small" title={r.matchedAs ?? ""}>
                      {r.matchedAs ? shortMatch(r.matchedAs) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function shortMatch(s: string): string {
  // "exact" / "normalized" / "alias" / "model-exact" / "fuzzy:1" / "exact → openai/gpt-5"
  const arrow = s.indexOf("→");
  const head = arrow >= 0 ? s.slice(0, arrow).trim() : s;
  const tail = arrow >= 0 ? s.slice(arrow + 1).trim() : "";
  const map: Record<string, string> = {
    exact: "精确",
    "model-exact": "模型",
    normalized: "归一",
    "provider+normalized": "供应商+归一",
    alias: "别名",
    fuzzy: "模糊",
  };
  const label = map[head] ?? head;
  return tail ? `${label} · ${tail}` : label;
}
