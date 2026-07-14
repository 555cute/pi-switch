import { useEffect, useMemo, useState } from "react";
import { ensureUsage, useCache } from "../store";
import { BarChart } from "../components/BarChart";
import { StatCard } from "../components/StatCard";
import { Skeleton, Tag } from "../components/UI";
import { toast } from "../components/Toast";
import { formatCost, formatDate, formatTokens } from "../utils";

type Range = "7" | "30" | "all";

export function Usage() {
  const cache = useCache();
  const data = cache.usage;
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [sort, setSort] = useState<"tokens" | "cost" | "msgs">("tokens");

  useEffect(() => {
    ensureUsage();
  }, []);

  if (!data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>用量 <span className="en">Usage</span></h1>
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

  const sessions = useMemo(() => {
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
  }, [data.sessions, q]);

  const sortedProviders = useMemo(() => {
    const list = [...data.byProviderModel];
    if (sort === "cost") list.sort((a, b) => b.totals.cost - a.totals.cost);
    else if (sort === "msgs")
      list.sort((a, b) => b.totals.messages - a.totals.messages);
    else list.sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
    return list;
  }, [data.byProviderModel, sort]);

  const exportCsv = () => {
    const rows = [
      ["date", "tokens", "cost", "messages", "errors"],
      ...days.map((d) => [
        d.date,
        d.totals.totalTokens,
        d.totals.cost,
        d.totals.messages,
        d.totals.errors,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pi-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出 CSV", "ok");
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
          <button type="button" className="btn sm" onClick={exportCsv}>
            导出 CSV
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
          hint={`${rangedTotals.errors} errors`}
        />
        <StatCard
          label="缓存命中"
          value={cacheRate > 0 ? `${cacheRate.toFixed(1)}%` : "—"}
          hint={`${formatTokens(data.totals.cacheRead)} read · ${formatTokens(data.totals.cacheWrite)} write`}
        />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h2>By day</h2>
            <Tag tone="info">{days.length} 天</Tag>
          </div>
          <BarChart
            items={days.map((d) => ({
              label: d.date.slice(5),
              value: d.totals.totalTokens,
              secondary: formatTokens(d.totals.totalTokens),
            }))}
            maxBars={21}
            emptyText="No usage days found"
          />
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>By provider / model</h2>
            <select
              className="input sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
            >
              <option value="tokens">按 tokens</option>
              <option value="cost">按 cost</option>
              <option value="msgs">按 messages</option>
            </select>
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
          <input
            className="input sm"
            placeholder="Filter cwd / model / id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
