import { useMemo, useState } from "react";
import { Preferences, type PrefSection } from "./settings/Preferences";
import { Backups } from "./settings/Backups";
import { Control } from "./settings/Control";
import { Tag } from "../components/UI";

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
  icon: string;
  color: string;
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
      { id: "theme", label: "主题", en: "Theme", icon: "◐", color: "#0a84ff", keywords: "theme light dark auto 主题 浅色 深色" },
      { id: "typography", label: "字体与排版", en: "Typography", icon: "Aa", color: "#5e5ce6", keywords: "font size radius 字体 字号 圆角" },
      { id: "motion", label: "动效", en: "Motion", icon: "✦", color: "#bf5af2", keywords: "animation motion 动画 动效" },
    ],
  },
  {
    id: "window",
    label: "窗口",
    items: [
      { id: "startup", label: "启动与关闭", en: "Startup", icon: "▷", color: "#ff9f0a", keywords: "launch tray minimize 启动 托盘 关闭" },
      { id: "layout", label: "尺寸与布局", en: "Layout", icon: "▢", color: "#ff9f0a", keywords: "width height size 尺寸 宽度 高度" },
    ],
  },
  {
    id: "data",
    label: "数据",
    items: [
      { id: "agent", label: "Agent 路径", en: "Agent Path", icon: "◈", color: "#30d158", keywords: "agent home path 路径" },
      { id: "network", label: "网络连接", en: "Network", icon: "☁", color: "#64d2ff", keywords: "api port network 端口 连接" },
      { id: "cache", label: "缓存与刷新", en: "Cache", icon: "⟳", color: "#34c759", keywords: "cache ttl refresh 缓存 刷新" },
    ],
  },
  {
    id: "behavior",
    label: "行为",
    items: [
      { id: "general", label: "通用", en: "General", icon: "◉", color: "#bf5af2", keywords: "default tab onboarding 默认 引导" },
      { id: "privacy", label: "隐私与确认", en: "Privacy", icon: "◎", color: "#ff453a", keywords: "confirm destructive privacy 确认 危险" },
      { id: "notifications", label: "通知", en: "Notifications", icon: "◉", color: "#ff9f0a", keywords: "toast notify 通知 提示" },
    ],
  },
  {
    id: "ops",
    label: "运维",
    items: [
      { id: "backups", label: "备份与恢复", en: "Backups", icon: "◉", color: "#34c759", keywords: "backup restore 备份 恢复" },
      { id: "control", label: "进程控制", en: "Processes", icon: "▷", color: "#5e5ce6", keywords: "process kill 进程" },
      { id: "events", label: "事件日志", en: "Events", icon: "▮", color: "#0a84ff", keywords: "event log runtime 事件 日志" },
      { id: "diagnostics", label: "诊断", en: "Diagnostics", icon: "⊘", color: "#ff453a", keywords: "health diagnose 诊断 健康" },
    ],
  },
  {
    id: "advanced",
    label: "高级",
    items: [
      { id: "shortcuts", label: "快捷键", en: "Shortcuts", icon: "⌘", color: "#ff453a", keywords: "hotkey shortcut 快捷键" },
      { id: "prompt", label: "系统提示", en: "Prompt", icon: "✎", color: "#64d2ff", keywords: "prompt system 提示词" },
      { id: "developer", label: "开发者", en: "Developer", icon: "</>", color: "#8e8e93", keywords: "developer debug 开发者" },
    ],
  },
  {
    id: "meta",
    label: "关于",
    items: [
      { id: "about", label: "关于", en: "About", icon: "ⓘ", color: "#8e8e93", keywords: "version platform 版本" },
      { id: "updates", label: "更新", en: "Updates", icon: "↑", color: "#0a84ff", keywords: "update check 更新" },
      { id: "licenses", label: "开源许可", en: "Licenses", icon: "§", color: "#8e8e93", keywords: "license open source 许可" },
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
                        <span
                          className="settings-nav-icon"
                          style={{
                            background: `${item.color}1A`,
                            color: item.color,
                          }}
                        >
                          {item.icon}
                        </span>
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
  return (
    <div className="settings-pane">
      <header className="page-header">
        <div>
          <h1>
            诊断 <span className="en">Diagnostics</span>
          </h1>
          <p className="muted page-kicker">检查本地服务、路径与运行状态</p>
        </div>
      </header>
      <div className="settings-stack">
        <section className="setting-card">
          <div className="setting-card-title">健康检查</div>
          <div className="setting-card-body">
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">API 服务</div>
                <div className="setting-row-desc">http://127.0.0.1:8787/api/health</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="ok">online</Tag>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">Vite 开发服务</div>
                <div className="setting-row-desc">前端 HMR 与静态资源</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="info">dev</Tag>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">配置目录</div>
                <div className="setting-row-desc">%APPDATA%\\pi-switch 或 ~/.config/pi-switch</div>
              </div>
              <div className="setting-row-control">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    // best-effort open
                    window.piSwitchDesktop?.openPath?.(
                      (window as any).process?.env?.APPDATA
                        ? `${(window as any).process.env.APPDATA}\\pi-switch`
                        : "",
                    );
                  }}
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
                <div className="setting-row-label">刷新缓存</div>
                <div className="setting-row-desc">如果页面数据过旧，可强制刷新全部接口</div>
              </div>
              <div className="setting-row-control">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => window.location.reload()}
                >
                  刷新应用
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
          <p className="muted page-kicker">当前版本与更新策略</p>
        </div>
      </header>
      <div className="settings-stack">
        <section className="setting-card">
          <div className="setting-card-title">版本</div>
          <div className="setting-card-body">
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">已安装版本</div>
                <div className="setting-row-desc">pi-switch desktop</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="default">v0.1.0</Tag>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-row-text">
                <div className="setting-row-label">自动检查更新</div>
                <div className="setting-row-desc">后续版本会接入 GitHub Releases 检查</div>
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
          <p className="muted page-kicker">本应用依赖的主要开源组件</p>
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
