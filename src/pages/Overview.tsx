import { useEffect, useMemo } from "react";
import { ensureDashboard, ensureUsage, useCache } from "../store";
import type { NavRequest, UsageOverview } from "../types";
import { formatCost, formatDate, formatTokens } from "../utils";
import { Skeleton, Tag } from "../components/UI";
import { toast } from "../components/Toast";

function Sparkline({
  points,
  color = "currentColor",
  width = 72,
  height = 28,
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
  const coords = points.map((v, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area =
    `M${coords[0][0].toFixed(1)} ${height - 1} ` +
    coords.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
    ` L${coords[coords.length - 1][0].toFixed(1)} ${height - 1} Z`;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
    >
      <path d={area} fill={color} opacity="0.12" />
      <path
        d={line}
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

const QUICK_ACTIONS: Array<{
  title: string;
  sub: string;
  icon: string;
  tone: string;
  nav: NavRequest | string;
}> = [
  {
    title: "管理供应商",
    sub: "模型 · API Key · 探测",
    icon: "☁",
    tone: "blue",
    nav: { tab: "manage", manageSection: "providers" },
  },
  {
    title: "扩展包与技能",
    sub: "安装 · 更新 · 启用",
    icon: "⧉",
    tone: "orange",
    nav: { tab: "manage", manageSection: "packages" },
  },
  {
    title: "查看用量详情",
    sub: "趋势 · 成本 · 会话",
    icon: "▮",
    tone: "slate",
    nav: "usage",
  },
  {
    title: "进程与事件",
    sub: "运行中的 pi 进程",
    icon: "▷",
    tone: "violet",
    nav: { tab: "settings", settingsLeaf: "control" },
  },
  {
    title: "备份与恢复",
    sub: "配置快照管理",
    icon: "◉",
    tone: "teal",
    nav: { tab: "settings", settingsLeaf: "backups" },
  },
  {
    title: "外观设置",
    sub: "主题 · 字体 · 布局",
    icon: "◐",
    tone: "blue",
    nav: { tab: "settings", settingsLeaf: "theme" },
  },
];

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
      <div className="page ov-page">
        <header className="page-header">
          <div>
            <h1>
              概览 <span className="en">Dashboard</span>
            </h1>
          </div>
        </header>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card" key={i}>
              <Skeleton width="40%" height={10} />
              <div style={{ height: 10 }} />
              <Skeleton width="65%" height={24} />
              <div style={{ height: 10 }} />
              <Skeleton width="50%" height={10} />
            </div>
          ))}
        </div>
        <div className="dash-main">
          {[0, 1, 2].map((i) => (
            <section className="panel" key={i}>
              <div className="panel-header">
                <Skeleton width={80} height={14} />
              </div>
              <div style={{ padding: 16 }}>
                <Skeleton width="100%" height={14} />
                <div style={{ height: 10 }} />
                <Skeleton width="85%" height={14} />
                <div style={{ height: 10 }} />
                <Skeleton width="70%" height={14} />
              </div>
            </section>
          ))}
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
  const toolCalls = data.topTools.reduce((s, t) => s + t.count, 0);
  const skillUses = data.topSkills.reduce((s, t) => s + t.count, 0);
  const recentSessions = (usage?.sessions ?? []).slice(0, 6);

  return (
    <div className="page ov-page">
      <header className="page-header">
        <div>
          <h1>
            概览 <span className="en">Dashboard</span>
          </h1>
          <p className="page-kicker">
            {data.sessionFiles} 会话 · 今日 {formatTokens(data.today.totalTokens)} · 累计{" "}
            {formatTokens(data.totals.totalTokens)}
          </p>
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

      {/* KPI row */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">今日 Token</div>
          <div className="stat-value">
            {today.num}
            {today.unit ? <span className="stat-unit">{today.unit}</span> : null}
          </div>
          <div className="stat-hint">
            <span>
              {data.today.messages} 条 · {formatCost(data.today.cost)}
            </span>
            {data.today.totalTokens > 0 ? (
              <Tag tone="info">{todayPct}%</Tag>
            ) : null}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">累计 Token</div>
          <div className="stat-value">
            {allTime.num}
            {allTime.unit ? <span className="stat-unit">{allTime.unit}</span> : null}
          </div>
          <div className="stat-hint">{data.totals.messages} 条消息</div>
          <div className="stat-side">
            <Sparkline points={dayPoints} color="var(--accent)" />
          </div>
        </div>

        <div
          className="stat-card stat-card--clickable"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate({ tab: "manage", manageSection: "providers" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNavigate({ tab: "manage", manageSection: "providers" });
            }
          }}
        >
          <div className="stat-label">默认模型</div>
          <div className="stat-value stat-value--model" title={modelLabel}>
            {modelLabel}
          </div>
          <div className="stat-hint">
            <span className="tag">{data.defaultProvider ?? "—"}</span>
            <span className="online">● ready</span>
          </div>
          <div className="stat-side">
            <span className="stat-link">切换 ›</span>
          </div>
        </div>

        <div
          className="stat-card stat-card--clickable"
          role="button"
          tabIndex={0}
          onClick={() => onNavigate({ tab: "manage", manageSection: "skills" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNavigate({ tab: "manage", manageSection: "skills" });
            }
          }}
        >
          <div className="stat-label">资源</div>
          <div className="stat-value">{data.sessionFiles}</div>
          <div className="stat-hint ov-resource-hint">
            <span>
              <b>{data.providerCount}</b> 供应商
            </span>
            <span className="ov-dot">·</span>
            <span>
              <b>{data.skillCount}</b> 技能
            </span>
            <span className="ov-dot">·</span>
            <span>
              <b>{data.packageCount}</b> 扩展
            </span>
          </div>
        </div>
      </div>

      {/* 3-column main */}
      <div className="dash-main">
        <section className="panel panel-rank">
          <div className="panel-header">
            <h2>
              常用工具 <span className="en">Top Tools</span>
            </h2>
            <span className="panel-meta">{toolCalls.toLocaleString()} 次</span>
          </div>
          <div className="rank-list">
            {data.topTools.slice(0, 8).map((t, i) => {
              const pct = (t.count / toolTotal) * 100;
              return (
                <div className="rank-row" key={t.name}>
                  <span className="rank-idx">{i + 1}</span>
                  <div className="rank-body">
                    <div className="rank-name-row">
                      <span className="rank-name" title={t.name}>
                        {t.name}
                      </span>
                      <span className="rank-meta">
                        <span className="rank-pct">{pct.toFixed(1)}%</span>
                        <span className="rank-count">{t.count.toLocaleString()}</span>
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
        </section>

        <section className="panel panel-rank">
          <div className="panel-header">
            <h2>
              技能使用 <span className="en">Top Skills</span>
            </h2>
            <span className="panel-meta">{skillUses.toLocaleString()} 次</span>
          </div>
          {data.topSkills.length ? (
            <div className="rank-list">
              {data.topSkills.slice(0, 8).map((s, i) => {
                const pct = (s.count / skillTotal) * 100;
                return (
                  <div className="rank-row" key={s.name}>
                    <span className="rank-idx">{i + 1}</span>
                    <div className="rank-body">
                      <div className="rank-name-row">
                        <span className="rank-name" title={s.name}>
                          {s.name}
                        </span>
                        <span className="rank-meta">
                          <span className="rank-pct">{pct.toFixed(1)}%</span>
                          <span className="rank-count">{s.count.toLocaleString()}</span>
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
            </div>
          ) : (
            <div className="ov-empty">
              <div className="ov-empty-icon">◇</div>
              <div className="ov-empty-title">尚未检测到技能调用</div>
              <div className="ov-empty-desc">
                本地已发现 <b>{data.skillCount}</b> 个技能，调用后会出现在这里
              </div>
              <button
                type="button"
                className="btn sm"
                onClick={() => onNavigate({ tab: "manage", manageSection: "skills" })}
              >
                浏览技能
              </button>
            </div>
          )}
        </section>

        <section className="panel panel-sessions">
          <div className="panel-header">
            <h2>
              最近会话 <span className="en">Sessions</span>
            </h2>
            <button
              type="button"
              className="btn ghost xs"
              onClick={() => onNavigate("usage")}
            >
              全部 ›
            </button>
          </div>
          <div className="session-list">
            {recentSessions.map((s) => {
              const cwd = s.cwd?.replace(/\\/g, "/") ?? "";
              const parts = cwd.split("/").filter(Boolean);
              const short =
                parts.slice(-2).join("/") || s.id.slice(0, 8);
              return (
                <button
                  type="button"
                  className="session-item session-item--btn"
                  key={s.path}
                  onClick={() => onNavigate("usage")}
                  title={s.cwd ?? s.id}
                >
                  <div className="session-icon">π</div>
                  <div className="session-mid">
                    <div className="session-name">{short}</div>
                    <div className="session-sub">
                      {(s.provider ?? "—") + " / " + (s.model ?? "—")}
                    </div>
                  </div>
                  <div className="session-right">
                    <div className="session-tokens">
                      {formatTokens(s.totals.totalTokens)}
                    </div>
                    <div className="session-time">{formatDate(s.startedAt)}</div>
                  </div>
                </button>
              );
            })}
            {!recentSessions.length ? (
              <div className="empty-inline">暂无 session 记录</div>
            ) : null}
          </div>
          <div className="panel-footer">
            <span className="muted small">共 {data.sessionFiles} 条</span>
            <button
              type="button"
              className="btn ghost xs"
              onClick={() => onNavigate("usage")}
            >
              查看全部
            </button>
          </div>
        </section>
      </div>

      {/* Quick actions */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            快速入口 <span className="en">Quick Actions</span>
          </h2>
        </div>
        <div className="quick-grid">
          {QUICK_ACTIONS.map((a) => (
            <button
              type="button"
              className="quick-card"
              key={a.title}
              onClick={() => onNavigate(a.nav)}
            >
              <div className={`quick-icon ${a.tone}`}>{a.icon}</div>
              <div className="quick-text">
                <div className="quick-title">{a.title}</div>
                <div className="quick-desc">{a.sub}</div>
              </div>
              <div className="quick-arrow">›</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
