import { useEffect, useMemo, useState } from "react";
import { ensureUsage, useCache } from "../store";
import { BarChart } from "../components/BarChart";
import { StatCard } from "../components/StatCard";
import { Skeleton, Tag } from "../components/UI";
import { toast } from "../components/Toast";
import { formatCost, formatDate, formatTokens } from "../utils";
import type { SessionSummary, TokenTotals } from "../types";

type Range = "7" | "30" | "all";
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

export function Usage() {
  const cache = useCache();
  const data = cache.usage;
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [sort, setSort] = useState<"tokens" | "cost" | "msgs">("tokens");
  const [exportKind, setExportKind] = useState<ExportKind>("sessions");

  useEffect(() => {
    ensureUsage();
  }, []);

  const sessions = useMemo(() => {
    if (!data) return [] as SessionSummary[];
    const ql = q.trim().toLowerCase();
    let list = data.sessions;
    if (ql)
      list = list.filter(
        (s) =>
          (s.cwd ?? "").toLowerCase().includes(ql) ||
          (s.provider ?? "").toLowerCase().includes(ql) ||
          (s.model ?? "").toLowerCase().includes(ql) ||
          s.id.toLowerCase().includes(ql),
      );
    return list;
  }, [data, q]);

  const sortedProviders = useMemo(() => {
    if (!data) return [];
    const list = [...data.byProviderModel];
    if (sort === "cost") list.sort((a, b) => b.totals.cost - a.totals.cost);
    else if (sort === "msgs")
      list.sort((a, b) => b.totals.messages - a.totals.messages);
    else list.sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
    return list;
  }, [data, sort]);

  if (!data) {
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

  const dayLimit = range === "7" ? 7 : range === "30" ? 30 : data.byDay.length;
  const days = data.byDay.slice(-dayLimit);

  const rangedTotals = days.reduce(
    (acc, d) => ({
      tokens: acc.tokens + d.totals.totalTokens,
      cost: acc.cost + d.totals.cost,
      msgs: acc.msgs + d.totals.messages,
      errors: acc.errors + d.totals.errors,
    }),
    { tokens: 0, cost: 0, msgs: 0, errors: 0 },
  );

  const cacheRate =
    data.totals.totalTokens > 0
      ? (data.totals.cacheRead / data.totals.totalTokens) * 100
      : 0;

  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = (kind: ExportKind = exportKind) => {
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
          "id",
          "started_at",
          "cwd",
          "provider",
          "model",
          "message_count",
          "tool_calls",
          "path",
          ...TOTAL_HEADERS,
        ],
        ...sessions.map((s: SessionSummary) => [
          s.id,
          s.startedAt ?? "",
          s.cwd ?? "",
          s.provider ?? "",
          s.model ?? "",
          s.messageCount,
          s.toolCalls,
          s.path,
          ...totalsCols(s.totals),
        ]),
      ];
      name = `pi-usage-sessions-${stamp}.csv`;
    } else if (kind === "models") {
      rows = [
        ["provider", "model", ...TOTAL_HEADERS],
        ...sortedProviders.map((p) => [
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            用量 <span className="en">Usage</span>
          </h1>
          <p className="muted page-kicker">
            已扫描 {data.sessionFiles} sessions · {data.scannedLines.toLocaleString()} 行
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

      <div className="seg" style={{ marginBottom: 12 }}>
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

      <div className="stat-grid">
        <StatCard
          label={`Tokens (${range === "all" ? "全部" : `近 ${range} 天`})`}
          value={formatTokens(rangedTotals.tokens)}
          hint={`${formatTokens(data.totals.totalTokens)} 累计`}
        />
        <StatCard
          label="费用"
          value={formatCost(rangedTotals.cost)}
          hint={`${formatCost(data.totals.cost)} 累计`}
        />
        <StatCard
          label="消息"
          value={String(rangedTotals.msgs)}
          hint={`${data.totals.messages} 累计`}
        />
        <StatCard
          label="Cache 命中"
          value={`${cacheRate.toFixed(1)}%`}
          hint={`${formatTokens(data.totals.cacheRead)} cache read`}
        />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h2>按日</h2>
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => exportCsv("days")}
            >
              CSV
            </button>
          </div>
          <BarChart
            items={days.map((d) => ({
              label: d.date.slice(5),
              value: d.totals.totalTokens,
              secondary: `${formatTokens(d.totals.totalTokens)} · ${formatCost(d.totals.cost)}`,
            }))}
            maxBars={Math.min(days.length, 30)}
            emptyText="No daily usage"
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>按模型</h2>
            <div className="row-gap">
              <select
                className="input sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
              >
                <option value="tokens">按 tokens</option>
                <option value="cost">按 cost</option>
                <option value="msgs">按 messages</option>
              </select>
              <button
                type="button"
                className="btn xs ghost"
                onClick={() => exportCsv("models")}
              >
                CSV
              </button>
            </div>
          </div>
          <BarChart
            items={sortedProviders.slice(0, 12).map((p) => ({
              label: `${p.provider}/${p.model}`,
              value: p.totals.totalTokens,
              secondary: `${formatTokens(p.totals.totalTokens)} · ${formatCost(p.totals.cost)}`,
            }))}
            maxBars={12}
            emptyText="No model usage found"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h2>Tools</h2>
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => exportCsv("tools")}
            >
              CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Calls</th>
                  <th>Errors</th>
                  <th>错误率</th>
                </tr>
              </thead>
              <tbody>
                {data.tools.slice(0, 20).map((t) => {
                  const errRate = t.count > 0 ? (t.errors / t.count) * 100 : 0;
                  return (
                    <tr key={t.name}>
                      <td>
                        <code>{t.name}</code>
                      </td>
                      <td>{t.count}</td>
                      <td className={t.errors ? "text-rose" : ""}>{t.errors}</td>
                      <td>
                        {errRate > 0 ? (
                          <Tag tone={errRate > 10 ? "danger" : "warn"}>
                            {errRate.toFixed(1)}%
                          </Tag>
                        ) : (
                          <Tag tone="ok">0%</Tag>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.tools.length === 0 ? (
              <div className="empty-inline">No tool calls recorded</div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Skills (history)</h2>
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => exportCsv("skills")}
            >
              CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Count</th>
                  <th>Last used</th>
                </tr>
              </thead>
              <tbody>
                {data.skills.slice(0, 20).map((s) => (
                  <tr key={s.name}>
                    <td>
                      <code>{s.name}</code>
                    </td>
                    <td>{s.count}</td>
                    <td>{formatDate(s.lastUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.skills.length === 0 ? (
              <div className="empty-inline">No skill invocations detected</div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent sessions ({sessions.length})</h2>
          <div className="row-gap">
            <input
              className="input sm"
              placeholder="Filter cwd / model / id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>CWD</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Msgs</th>
                <th>Tools</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 50).map((s) => (
                <tr key={s.path}>
                  <td>{formatDate(s.startedAt)}</td>
                  <td className="truncate" title={s.cwd ?? ""}>
                    {s.cwd ?? "—"}
                  </td>
                  <td>
                    <code>
                      {s.provider ?? "—"}/{s.model ?? "—"}
                    </code>
                  </td>
                  <td>{formatTokens(s.totals.totalTokens)}</td>
                  <td>{formatCost(s.totals.cost)}</td>
                  <td>{s.messageCount}</td>
                  <td>{s.toolCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sessions.length === 0 ? (
            <div className="empty-inline">No sessions match</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
