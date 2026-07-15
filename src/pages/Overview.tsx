import { useEffect, useMemo } from "react";
import { ensureDashboard, ensureUsage, useCache } from "../store";
import type { NavRequest, UsageOverview } from "../types";
import { formatCost, formatDate, formatTokens } from "../utils";
import { Skeleton, Tag } from "../components/UI";
import { toast } from "../components/Toast";

function Sparkline({
  points,
  color = "currentColor",
  width = 60,
  height = 22,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!points.length) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const d = points
    .map((v, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function splitTokens(n: number): { num: string; unit: string } {
  if (n >= 1_000_000_000) return { num: (n / 1_000_000_000).toFixed(2), unit: "B" };
  if (n >= 1_000_000) return { num: (n / 1_000_000).toFixed(2), unit: "M" };
  if (n >= 1_000) return { num: (n / 1_000).toFixed(1), unit: "K" };
  return { num: String(n), unit: "" };
}

export function Overview({
  onNavigate,
}: {
  onNavigate: (target: NavRequest | string) => void;
}) {
  const cache = useCache();
  useEffect(() => {
    ensureDashboard();
    ensureUsage();
  }, []);

  const data = cache.dashboard;
  const usage: UsageOverview | undefined = cache.usage;

  const dayPoints = useMemo(
    () => (usage?.byDay ?? []).slice(-10).map((d) => d.totals.totalTokens),
    [usage],
  );

  const toolTotal = useMemo(
    () => (data?.topTools ?? []).reduce((s, t) => s + t.count, 0) || 1,
    [data],
  );
  const skillTotal = useMemo(
    () => (data?.topSkills ?? []).reduce((s, t) => s + t.count, 0) || 1,
    [data],
  );

  if (!data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>概览 <span className="en">Dashboard</span></h1>
          </div>
        </header>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card" key={i}>
              <Skeleton width="50%" height={10} />
              <div style={{ height: 8 }} />
              <Skeleton width="70%" height={20} />
              <div style={{ height: 6 }} />
              <Skeleton width="40%" height={10} />
            </div>
          ))}
        </div>
        <div className="dash-main">
          <section className="panel">
            <div className="panel-header">
              <h2>常用工具</h2>
            </div>
            <div style={{ padding: 16 }}>
              <Skeleton width="100%" height={14} />
              <div style={{ height: 6 }} />
              <Skeleton width="80%" height={14} />
              <div style={{ height: 6 }} />
              <Skeleton width="90%" height={14} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>技能使用</h2>
            </div>
            <div style={{ padding: 16 }}>
              <Skeleton width="100%" height={14} />
              <div style={{ height: 6 }} />
              <Skeleton width="80%" height={14} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>最近 Sessions</h2>
            </div>
            <div style={{ padding: 16 }}>
              <Skeleton width="100%" height={40} />
              <div style={{ height: 6 }} />
              <Skeleton width="100%" height={40} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  const modelLabel =
    data.defaultProvider && data.defaultModel ? data.defaultModel : "未设置";
  const today = splitTokens(data.today.totalTokens);
  const allTime = splitTokens(data.totals.totalTokens);
  const todayPct =
    data.totals.totalTokens > 0
      ? ((data.today.totalTokens / data.totals.totalTokens) * 100).toFixed(0)
      : "0";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            概览 <span className="en">Dashboard</span>
          </h1>
        </div>
        <div className="header-actions">
          <div className="status-chip">
            <span className="dot" />
            本地就绪
          </div>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              ensureDashboard(true);
              ensureUsage(true);
              toast("已刷新", "ok");
            }}
          >
            刷新
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">今日 Token</div>
          <div className="stat-value">
            {today.num}
            {today.unit && <span className="stat-unit">{today.unit}</span>}
          </div>
          <div className="stat-hint">
            {data.today.messages} 条 · {formatCost(data.today.cost)}
            {data.today.totalTokens > 0 ? (
              <Tag tone="info">{todayPct}%</Tag>
            ) : null}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">累计 Token</div>
          <div className="stat-value">
            {allTime.num}
            {allTime.unit && <span className="stat-unit">{allTime.unit}</span>}
          </div>
          <div className="stat-hint">{data.totals.messages} 条消息</div>
          <div className="stat-side">
            <Sparkline points={dayPoints} color="var(--accent)" width={56} height={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">默认模型</div>
          <div
            className="stat-value"
            style={{ fontSize: 15, marginTop: 2, letterSpacing: 0, lineHeight: 1.2 }}
          >
            {modelLabel}
          </div>
          <div className="stat-hint">
            <span className="tag">{data.defaultProvider ?? "—"}</span>
            <span className="online">● ready</span>
          </div>
          <div className="stat-side" style={{ top: 12, right: 12 }}>
            <button
              type="button"
              className="btn xs"
              onClick={() => onNavigate({ tab: "manage", manageSection: "providers" })}
            >
              切换
            </button>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">资源</div>
          <div className="stat-value">{data.sessionFiles}</div>
          <div className="stat-hint">
            {data.providerCount} 供 · {data.skillCount} 技 · {data.packageCount} 扩
          </div>
        </div>
      </div>

      <div className="dash-main">
        <section className="panel panel-rank">
          <div className="panel-accent teal" />
          <div className="panel-header">
            <h2>
              常用工具 <span className="en">Top Tools</span>
            </h2>
          </div>
          <div className="rank-list">
            {data.topTools.slice(0, 8).map((t, i) => {
              const pct = (t.count / toolTotal) * 100;
              return (
                <div className="rank-row" key={t.name}>
                  <span className="rank-idx">{i + 1}</span>
                  <div>
                    <div className="rank-name-row">
                      <span className="rank-name" title={t.name}>
                        {t.name}
                      </span>
                      <span className="rank-meta">
                        <span className="rank-pct">{pct.toFixed(1)}%</span>
                        {" · "}
                        {t.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="rank-track">
                      <div
                        className="rank-fill blue"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {!data.topTools.length ? (
              <div className="empty-inline">暂无工具调用记录</div>
            ) : null}
          </div>
          <div className="panel-footer">
            <span>总计 {data.topTools.reduce((s, t) => s + t.count, 0).toLocaleString()} 次调用</span>
          </div>
        </section>

        <section className="panel panel-rank">
          <div className="panel-accent violet" />
          <div className="panel-header">
            <h2>
              技能使用 <span className="en">Top Skills</span>
            </h2>
          </div>
          <div className="rank-list">
            {data.topSkills.slice(0, 8).map((s, i) => {
              const pct = (s.count / skillTotal) * 100;
              return (
                <div className="rank-row" key={s.name}>
                  <span className="rank-idx">{i + 1}</span>
                  <div>
                    <div className="rank-name-row">
                      <span className="rank-name" title={s.name}>
                        {s.name}
                      </span>
                      <span className="rank-meta">
                        <span className="rank-pct">{pct.toFixed(1)}%</span>
                        {" · "}
                        {s.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="rank-track">
                      <div
                        className="rank-fill violet"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {!data.topSkills.length ? (
              <div className="empty-inline">暂无技能调用记录</div>
            ) : null}
          </div>
          <div className="panel-footer">
            <span>总计 {data.topSkills.reduce((s, t) => s + t.count, 0).toLocaleString()} 次使用</span>
          </div>
        </section>

        <section className="panel panel-sessions">
          <div className="panel-accent slate" />
          <div className="panel-header">
            <h2>最近 Sessions</h2>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onNavigate("usage")}
            >
              全部
            </button>
          </div>
          <div className="session-list">
            {(usage?.sessions ?? []).slice(0, 5).map((s) => {
              const cwd = s.cwd?.replace(/\\/g, "/") ?? "";
              const short =
                cwd.split("/").filter(Boolean).slice(-2).join("/") ||
                s.id.slice(0, 8);
              return (
                <div className="session-item" key={s.path}>
                  <div className="session-icon">π</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="session-name" title={s.cwd ?? s.id}>
                      {short}
                    </div>
                    <div className="session-sub">
                      <span>
                        {s.provider ?? "—"}/{s.model ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="session-right">
                    <div className="session-tokens">
                      {formatTokens(s.totals.totalTokens)}
                    </div>
                    <div className="session-time">{formatDate(s.startedAt)}</div>
                  </div>
                </div>
              );
            })}
            {!usage?.sessions?.length ? (
              <div className="empty-inline">暂无 session</div>
            ) : null}
          </div>
          <div className="panel-footer">
            <span>共 {data.sessionFiles} 条</span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onNavigate("usage")}
            >
              查看全部
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>
            快速入口 <span className="en">Quick Actions</span>
          </h2>
        </div>
        <div className="quick-grid">
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate({ tab: "manage", manageSection: "providers" })}
          >
            <div className="quick-icon blue">☁</div>
            <div className="quick-text">
              <div className="quick-title">管理供应商</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate({ tab: "manage", manageSection: "packages" })}
          >
            <div className="quick-icon orange">⧉</div>
            <div className="quick-text">
              <div className="quick-title">扩展包与技能</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate("usage")}
          >
            <div className="quick-icon slate">▮</div>
            <div className="quick-text">
              <div className="quick-title">查看用量详情</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate({ tab: "settings", settingsLeaf: "control" })}
          >
            <div className="quick-icon violet">▷</div>
            <div className="quick-text">
              <div className="quick-title">进程与事件</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate({ tab: "settings", settingsLeaf: "backups" })}
          >
            <div className="quick-icon teal">◉</div>
            <div className="quick-text">
              <div className="quick-title">备份与恢复</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
          <button
            type="button"
            className="quick-card"
            onClick={() => onNavigate({ tab: "settings", settingsLeaf: "theme" })}
          >
            <div className="quick-icon blue">◐</div>
            <div className="quick-text">
              <div className="quick-title">外观设置</div>
            </div>
            <div className="quick-arrow">›</div>
          </button>
        </div>
      </section>
    </div>
  );
}
