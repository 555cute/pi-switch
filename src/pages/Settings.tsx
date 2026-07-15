import { useEffect, useMemo, useState } from "react";
import { Preferences, type PrefSection } from "./settings/Preferences";
import { Backups } from "./settings/Backups";
import { Control } from "./settings/Control";
import { Tag } from "../components/UI";
import { toast } from "../components/Toast";
import { useCache } from "../store";

export type SettingsLeaf =
  | PrefSection
  | "backups"
  | "control"
  | "events"
  | "diagnostics"
  | "updates"
  | "licenses";

type NavItem = {
  id: SettingsLeaf;
  label: string;
  en: string;
  keywords: string;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "look",
    label: "外观",
    items: [
      { id: "theme", label: "主题", en: "Theme", keywords: "theme light dark auto 主题 浅色 深色" },
      { id: "typography", label: "字体与排版", en: "Typography", keywords: "font size radius 字体 字号 圆角" },
      { id: "motion", label: "动效", en: "Motion", keywords: "animation motion 动画 动效" },
    ],
  },
  {
    id: "window",
    label: "窗口",
    items: [
      { id: "startup", label: "启动与关闭", en: "Startup", keywords: "launch tray minimize 启动 托盘 关闭" },
      { id: "layout", label: "尺寸与布局", en: "Layout", keywords: "width height size 尺寸 宽度 高度" },
    ],
  },
  {
    id: "data",
    label: "数据",
    items: [
      { id: "agent", label: "Agent 路径", en: "Agent Path", keywords: "agent home path 路径" },
      { id: "network", label: "网络连接", en: "Network", keywords: "api port network 端口 连接" },
      { id: "cache", label: "缓存与刷新", en: "Cache", keywords: "cache ttl refresh 缓存 刷新" },
    ],
  },
  {
    id: "behavior",
    label: "行为",
    items: [
      { id: "general", label: "通用", en: "General", keywords: "default tab onboarding 默认 引导" },
      { id: "privacy", label: "隐私与确认", en: "Privacy", keywords: "confirm destructive privacy 确认 危险" },
      { id: "notifications", label: "通知", en: "Notifications", keywords: "toast notify 通知 提示" },
    ],
  },
  {
    id: "ops",
    label: "运维",
    items: [
      { id: "backups", label: "备份与恢复", en: "Backups", keywords: "backup restore 备份 恢复" },
      { id: "control", label: "进程控制", en: "Processes", keywords: "process kill 进程" },
      { id: "events", label: "事件日志", en: "Events", keywords: "event log runtime 事件 日志" },
      { id: "diagnostics", label: "诊断", en: "Diagnostics", keywords: "health diagnose 诊断 健康" },
    ],
  },
  {
    id: "advanced",
    label: "高级",
    items: [
      { id: "shortcuts", label: "快捷键", en: "Shortcuts", keywords: "hotkey shortcut 快捷键" },
      { id: "prompt", label: "系统提示", en: "Prompt", keywords: "prompt system 提示词" },
      { id: "developer", label: "开发者", en: "Developer", keywords: "developer debug 开发者" },
    ],
  },
  {
    id: "meta",
    label: "关于",
    items: [
      { id: "about", label: "关于", en: "About", keywords: "version platform 版本" },
      { id: "updates", label: "更新", en: "Updates", keywords: "update check 更新" },
      { id: "licenses", label: "开源许可", en: "Licenses", keywords: "license open source 许可" },
    ],
  },
];

const PREF_LEAVES: SettingsLeaf[] = [
  "theme",
  "typography",
  "motion",
  "startup",
  "layout",
  "agent",
  "network",
  "cache",
  "general",
  "privacy",
  "notifications",
  "shortcuts",
  "prompt",
  "developer",
  "about",
];

export function Settings({
  initial = "theme",
}: {
  initial?: SettingsLeaf;
} = {}) {
  const [leaf, setLeaf] = useState<SettingsLeaf>(initial);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    look: true,
    window: true,
    data: true,
    behavior: true,
    ops: true,
    advanced: true,
    meta: true,
  });

  const filtered = useMemo(() => {
    const ql = search.trim().toLowerCase();
    if (!ql) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.label.toLowerCase().includes(ql) ||
          i.en.toLowerCase().includes(ql) ||
          i.keywords.toLowerCase().includes(ql),
      ),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  const isGroupOpen = (id: string) => !!search.trim() || openGroups[id];

  const currentMeta = useMemo(() => {
    for (const g of NAV_GROUPS) {
      const hit = g.items.find((i) => i.id === leaf);
      if (hit) return hit;
    }
    return NAV_GROUPS[0].items[0];
  }, [leaf]);

  return (
    <div className="settings-shell">
      <nav className="settings-nav settings-nav-tree">
        <div className="settings-nav-brand">
          <div className="settings-nav-brand-title">设置</div>
          <div className="settings-nav-brand-sub">Settings</div>
        </div>

        <input
          className="settings-nav-search"
          placeholder="搜索设置…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="settings-nav-scroll">
          {filtered.map((group) => {
            const open = isGroupOpen(group.id);
            return (
              <div className="settings-nav-group" key={group.id}>
                <button
                  type="button"
                  className="settings-nav-group-head"
                  onClick={() =>
                    setOpenGroups((s) => ({ ...s, [group.id]: !s[group.id] }))
                  }
                >
                  <span className={`settings-nav-chevron ${open ? "open" : ""}`}>›</span>
                  <span>{group.label}</span>
                  <span className="settings-nav-count">{group.items.length}</span>
                </button>
                {open ? (
                  <div className="settings-nav-children">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`settings-nav-item ${leaf === item.id ? "active" : ""}`}
                        onClick={() => setLeaf(item.id)}
                      >
                        <span className="settings-nav-text">
                          <span className="settings-nav-label">{item.label}</span>
                          <span className="settings-nav-en">{item.en}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {filtered.length === 0 ? (
            <div className="empty-inline" style={{ padding: 12 }}>
              没找到匹配项
            </div>
          ) : null}
        </div>

        <div className="settings-nav-footer">
          <div className="settings-nav-footer-meta">
            <span className="muted small">当前</span>
            <strong>{currentMeta.label}</strong>
          </div>
          <Tag tone="default">v0.1.0</Tag>
        </div>
      </nav>

      <div className="settings-main">
        {PREF_LEAVES.includes(leaf) ? (
          <Preferences section={leaf as PrefSection} />
        ) : null}
        {leaf === "backups" ? <Backups /> : null}
        {leaf === "control" || leaf === "events" ? (
          <Control focus={leaf === "events" ? "events" : "processes"} />
        ) : null}
        {leaf === "diagnostics" ? <DiagnosticsPanel /> : null}
        {leaf === "updates" ? <UpdatesPanel /> : null}
        {leaf === "licenses" ? <LicensesPanel /> : null}
      </div>
    </div>
  );
}

function DiagnosticsPanel() {
  const cache = useCache();
  const port = cache.appSettings?.apiPort || 8787;
  const base = import.meta.env.VITE_API_BASE || `http://127.0.0.1:${port}`;
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "err">("checking");
  const [apiDetail, setApiDetail] = useState("探测中…");
  const [latency, setLatency] = useState<number | null>(null);
  const [version, setVersion] = useState<string>("—");

  const runCheck = async () => {
    setApiStatus("checking");
    setApiDetail("探测中…");
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/health`, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setApiStatus("ok");
      setApiDetail(typeof data?.ok === "boolean" ? `ok=${data.ok}` : "reachable");
    } catch (e) {
      setApiStatus("err");
      setApiDetail(String(e));
      setLatency(null);
    }
    try {
      const v = await window.piSwitchDesktop?.getVersion?.();
      if (v) setVersion(String(v));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void runCheck();
  }, [base]);

  return (
    <div className="settings-pane">
      <header className="page-header">
        <div>
          <h1>
            诊断 <span className="en">Diagnostics</span>
          </h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn sm" onClick={() => void runCheck()}>
            重新检测
          </button>
        </div>
      </header>
      <div className="settings-stack">
        <section className="setting-card">
          <div className="setting-card-title">健康检查</div>
          <div className="setting-card-body">
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">API 服务</div>
                <div className="setting-row-desc">{base}/api/health</div>
              </div>
              <div className="setting-row-control">
                {apiStatus === "checking" ? (
                  <Tag tone="warn">checking</Tag>
                ) : apiStatus === "ok" ? (
                  <Tag tone="ok">online{latency != null ? ` · ${latency}ms` : ""}</Tag>
                ) : (
                  <Tag tone="danger">offline</Tag>
                )}
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">探测详情</div>
                <div className="setting-row-desc">{apiDetail}</div>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">运行环境</div>
                <div className="setting-row-desc">
                  {window.piSwitchDesktop?.isDesktop ? "Electron 桌面" : "浏览器"} · v{version}
                </div>
              </div>
              <div className="setting-row-control">
                <Tag tone="info">{import.meta.env.DEV ? "dev" : "prod"}</Tag>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">Agent home</div>
                <div className="setting-row-desc">{cache.agentHome || "未加载"}</div>
              </div>
              <div className="setting-row-control">
                <button
                  type="button"
                  className="btn sm"
                  disabled={!cache.agentHome}
                  onClick={() =>
                    cache.agentHome && window.piSwitchDesktop?.openPath?.(cache.agentHome)
                  }
                >
                  打开
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="setting-card">
          <div className="setting-card-title">建议</div>
          <div className="setting-card-body">
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">刷新应用</div>
              </div>
              <div className="setting-row-control">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    toast("正在刷新…", "info");
                    window.location.reload();
                  }}
                >
                  刷新
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function UpdatesPanel() {
  return (
    <div className="settings-pane">
      <header className="page-header">
        <div>
          <h1>
            更新 <span className="en">Updates</span>
          </h1>
        </div>
      </header>
      <div className="settings-stack">
        <section className="setting-card">
          <div className="setting-card-title">版本</div>
          <div className="setting-card-body">
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">已安装版本</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="default">v0.1.0</Tag>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">自动检查更新</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="warn">未接入</Tag>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LicensesPanel() {
  const deps = [
    { name: "React", license: "MIT" },
    { name: "Vite", license: "MIT" },
    { name: "Electron", license: "MIT" },
    { name: "Inter Font", license: "OFL" },
    { name: "JetBrains Mono", license: "OFL" },
  ];
  return (
    <div className="settings-pane">
      <header className="page-header">
        <div>
          <h1>
            开源许可 <span className="en">Licenses</span>
          </h1>
        </div>
      </header>
      <div className="settings-stack">
        <section className="setting-card">
          <div className="setting-card-title">第三方组件</div>
          <div className="setting-card-body">
            {deps.map((d) => (
              <div className="setting-row" key={d.name}>
                <div className="setting-row-text">
                  <div className="setting-row-label">{d.name}</div>
                </div>
                <div className="setting-row-control">
                  <Tag tone="info">{d.license}</Tag>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
