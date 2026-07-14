import { useEffect, useMemo, useState } from "react";
import { ensureSkills, useCache } from "../../store";
import { BarChart } from "../../components/BarChart";
import { Drawer } from "../../components/Drawer";
import { Skeleton, Tag } from "../../components/UI";
import { formatDate } from "../../utils";
import type { SkillInfo } from "../../types";

const SOURCE_TABS: { id: "all" | "global" | "package" | "history"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "global", label: "全局" },
  { id: "package", label: "扩展包" },
  { id: "history", label: "历史" },
];

function sourceKind(source: string): "global" | "package" | "history" {
  if (source.startsWith("package:")) return "package";
  if (source === "session-history") return "history";
  return "global";
}

export function Skills() {
  const cache = useCache();
  const data = cache.skills;
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "global" | "package" | "history">("all");
  const [sort, setSort] = useState<"usage" | "name" | "recent">("usage");
  const [detail, setDetail] = useState<SkillInfo | null>(null);

  useEffect(() => {
    ensureSkills();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.skills;
    if (source !== "all") list = list.filter((s) => sourceKind(s.source) === source);
    const ql = q.trim().toLowerCase();
    if (ql)
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(ql) ||
          s.description.toLowerCase().includes(ql) ||
          s.source.toLowerCase().includes(ql),
      );
    if (sort === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "recent")
      list = [...list].sort((a, b) => {
        const ax = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const bx = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return bx - ax;
      });
    else list = [...list].sort((a, b) => b.usageCount - a.usageCount);
    return list;
  }, [data, q, source, sort]);

  if (!data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>技能 <span className="en">Skills</span></h1>
            <p className="muted page-kicker">扫描中…</p>
          </div>
        </header>
        <div className="grid-2">
          <section className="panel">
            <div className="panel-header">
              <h2>使用排行</h2>
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
              <h2>工具调用</h2>
            </div>
            <div style={{ padding: 16 }}>
              <Skeleton width="100%" height={14} />
              <div style={{ height: 6 }} />
              <Skeleton width="80%" height={14} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  const counts = {
    all: data.skills.length,
    global: data.skills.filter((s) => sourceKind(s.source) === "global").length,
    package: data.skills.filter((s) => sourceKind(s.source) === "package").length,
    history: data.skills.filter((s) => sourceKind(s.source) === "history").length,
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            技能 <span className="en">Skills</span>
          </h1>
          <p className="muted page-kicker">
            已发现 {data.skills.length} 个技能（{counts.global} 全局 · {counts.package} 扩展包 · {counts.history} 历史）
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn sm"
            onClick={() => ensureSkills(true)}
          >
            刷新
          </button>
        </div>
      </header>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <h2>
              使用排行 <span className="en">Usage</span>
            </h2>
          </div>
          <BarChart
            items={data.skillUsage.map((s) => ({ label: s.name, value: s.count }))}
            emptyText="尚未在会话中检测到技能调用"
          />
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>
              工具调用 <span className="en">Tools</span>
            </h2>
          </div>
          <BarChart
            items={data.toolUsage.slice(0, 12).map((t) => ({
              label: t.name,
              value: t.count,
              secondary: String(t.count),
            }))}
            emptyText="无工具记录"
          />
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>技能清单</h2>
          <div className="row-gap">
            <input
              className="input sm"
              placeholder="搜索…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="input sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
            >
              <option value="usage">按使用次数</option>
              <option value="name">按名字</option>
              <option value="recent">按最近使用</option>
            </select>
          </div>
        </div>
        <div className="source-tabs">
          {SOURCE_TABS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`source-tab ${source === s.id ? "active" : ""}`}
              onClick={() => setSource(s.id)}
            >
              {s.label}
              <span className="source-count">{counts[s.id]}</span>
            </button>
          ))}
        </div>
        <div className="card-grid">
          {filtered.map((s) => (
            <article
              className="skill-card"
              key={`${s.source}:${s.path || s.name}`}
              onClick={() => setDetail(s)}
            >
              <div className="skill-card-top">
                <h3>{s.name}</h3>
                {s.usageCount > 0 ? (
                  <Tag tone="ok">{s.usageCount}×</Tag>
                ) : (
                  <Tag>未用</Tag>
                )}
              </div>
              <p className="skill-desc">{s.description || "无描述"}</p>
              <div className="skill-meta">
                <Tag tone={sourceKind(s.source) === "package" ? "info" : "default"}>
                  {sourceKind(s.source) === "package"
                    ? "扩展包"
                    : sourceKind(s.source) === "history"
                      ? "历史"
                      : "全局"}
                </Tag>
                {s.lastUsed ? (
                  <span className="muted small">最近：{formatDate(s.lastUsed)}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="empty-inline">没有匹配的技能</div>
        ) : null}
      </section>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
      >
        {detail ? (
          <div className="skill-detail">
            <div className="kv">
              <tbody>
                <tr>
                  <td>来源</td>
                  <td>
                    <code>{detail.source}</code>
                  </td>
                </tr>
                <tr>
                  <td>使用次数</td>
                  <td>
                    <strong>{detail.usageCount}</strong>
                  </td>
                </tr>
                <tr>
                  <td>最近使用</td>
                  <td>{formatDate(detail.lastUsed)}</td>
                </tr>
                <tr>
                  <td>路径</td>
                  <td>
                    <code className="path-line" style={{ wordBreak: "break-all" }}>
                      {detail.path || "—"}
                    </code>
                  </td>
                </tr>
              </tbody>
            </div>
            <h3 style={{ marginTop: 16 }}>描述</h3>
            <p>{detail.description || "(无描述)"}</p>
            {detail.path ? (
              <div className="row-gap" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => window.piSwitchDesktop?.openPath?.(detail.path)}
                >
                  打开文件
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    window.piSwitchDesktop?.showItemInFolder?.(detail.path)
                  }
                >
                  文件管理器
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
