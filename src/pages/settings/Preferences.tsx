import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import {
  ensureAppSettings,
  ensureSettings,
  useCache,
} from "../../store";
import type { AppSettings } from "../../types";
import { Skeleton, Tag } from "../../components/UI";
import { toast } from "../../components/Toast";
import {
  Segmented,
  SettingCard,
  SettingRow,
  ShortcutInput,
  Slider,
  Stepper,
  Toggle,
} from "../../components/Settings";

export type PrefSection =
  | "theme"
  | "typography"
  | "motion"
  | "startup"
  | "layout"
  | "agent"
  | "network"
  | "cache"
  | "general"
  | "privacy"
  | "notifications"
  | "shortcuts"
  | "prompt"
  | "developer"
  | "about";


const FONT_PREVIEWS = [
  { v: "inter", label: "Inter", stack: '"Inter","Inter Tight",sans-serif' },
  { v: "sf", label: "SF Pro", stack: '-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif' },
  { v: "system", label: "System", stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' },
  { v: "jetbrains", label: "JetBrains", stack: '"JetBrains Mono",ui-monospace,monospace' },
] as const;

export function Preferences({
  section = "theme",
}: {
  section?: PrefSection;
} = {}) {
  const cache = useCache();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [platform, setPlatform] = useState<string>("");

  useEffect(() => {
    ensureAppSettings();
    ensureSettings();
    Promise.resolve(window.piSwitchDesktop?.platform?.() as any)
      .then((p) => setPlatform(String(p)))
      .catch(() => setPlatform("unknown"));
  }, []);

  useEffect(() => {
    if (cache.appSettings) setDraft({ ...cache.appSettings });
  }, [cache.appSettings]);

  useEffect(() => {
    if (!draft) return;
    let resolved: "light" | "dark" = "light";
    if (draft.theme === "dark") resolved = "dark";
    else if (draft.theme === "auto")
      resolved = window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.setProperty("--radius", `${draft.radius}px`);
    document.documentElement.style.setProperty("--font-size", `${draft.fontSize}px`);
  }, [draft?.theme, draft?.radius, draft?.fontSize]);

  if (!draft) {
    return (
      <div className="settings-loading">
        <Skeleton width="40%" height={18} />
        <div style={{ height: 12 }} />
        <Skeleton width="60%" height={12} />
      </div>
    );
  }

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="settings-pane">
      <section className="settings-content">
        {section === "theme" ? <ThemeSection draft={draft} set={set} /> : null}
        {section === "typography" ? <TypographySection draft={draft} set={set} /> : null}
        {section === "motion" ? <MotionSection draft={draft} set={set} /> : null}
        {section === "startup" ? <StartupSection draft={draft} set={set} /> : null}
        {section === "layout" ? <LayoutSection draft={draft} set={set} /> : null}
        {section === "agent" ? <AgentSection draft={draft} set={set} agentHome={cache.agentHome} /> : null}
        {section === "network" ? <NetworkSection draft={draft} set={set} /> : null}
        {section === "cache" ? <CacheSection draft={draft} set={set} /> : null}
        {section === "general" ? <GeneralSection draft={draft} set={set} /> : null}
        {section === "privacy" ? <PrivacySection draft={draft} set={set} /> : null}
        {section === "notifications" ? <NotificationsSection draft={draft} set={set} /> : null}
        {section === "shortcuts" ? <ShortcutsSection draft={draft} set={set} /> : null}
        {section === "prompt" ? <PromptSection /> : null}
        {section === "developer" ? <DeveloperSection draft={draft} /> : null}
        {section === "about" ? <AboutSection draft={draft} platform={platform} agentHome={cache.agentHome} /> : null}
      </section>
    </div>
  );
}

/* ===================== Sub-sections ===================== */

function ThemeSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="主题">
        <div className="theme-hero">
          {(
            [
              { v: "light" as const, label: "浅色", sub: "Light", preview: { bg: "#ffffff", ink: "#1d1d1f" } },
              { v: "dark" as const, label: "深色", sub: "Dark", preview: { bg: "#1c1c1e", ink: "#f5f5f7" } },
              { v: "auto" as const, label: "跟随系统", sub: "Auto", preview: { split: true, ink: "#1d1d1f" } },
            ]
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              className={`theme-hero-tile ${draft.theme === o.v ? "active" : ""}`}
              onClick={() => set("theme", o.v)}
            >
              <div
                className={`theme-hero-swatch ${o.preview.split ? "split" : ""}`}
                style={
                  o.preview.split
                    ? undefined
                    : { background: o.preview.bg }
                }
              >
                <span
                  className="theme-hero-dot"
                  style={{ background: draft.theme === o.v ? "var(--accent)" : "transparent" }}
                >
                  {draft.theme === o.v ? "✓" : ""}
                </span>
                <span className="theme-hero-text-preview" style={{ color: o.preview.ink }}>
                  Aa
                </span>
              </div>
              <div className="theme-hero-meta">
                <div className="theme-hero-label">{o.label}</div>
                <div className="theme-hero-sub">{o.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </SettingCard>
      <SettingCard title="预览">
        <div className="appearance-preview">
          <button type="button" className="btn primary sm">主按钮</button>
          <button type="button" className="btn ghost sm">次按钮</button>
          <Tag tone="ok">成功</Tag>
          <Tag tone="warn">提示</Tag>
          <Tag tone="info">信息</Tag>
        </div>
      </SettingCard>
    </div>
  );
}

function TypographySection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="字体">
        <div className="font-hero">
          {FONT_PREVIEWS.map((f) => (
            <button
              key={f.v}
              type="button"
              className={`font-hero-tile ${draft.font === f.v ? "active" : ""}`}
              onClick={() => set("font", f.v)}
            >
              <div className="font-hero-sample" style={{ fontFamily: f.stack }}>
                The quick brown fox
              </div>
              <div className="font-hero-meta">
                <span className="font-hero-name">{f.label}</span>
                {draft.font === f.v ? <span className="font-hero-check">✓</span> : null}
              </div>
            </button>
          ))}
        </div>
      </SettingCard>
      <SettingCard title="字号与圆角">
        <SettingRow
          label="字号"
          description="影响整个应用的文字大小"
          control={<Slider value={draft.fontSize} onChange={(v) => set("fontSize", v)} min={11} max={16} suffix="px" />}
        />
        <SettingRow
          label="圆角"
          description="面板、按钮、卡片的圆角弧度"
          control={<Slider value={draft.radius} onChange={(v) => set("radius", v)} min={0} max={20} suffix="px" />}
        />
      </SettingCard>
    </div>
  );
}

function MotionSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="动画">
        <SettingRow
          label="动画速度"
          description="页面切换、菜单展开的速度"
          control={
            <Segmented
              value={draft.animation}
              onChange={(v) => set("animation", v)}
              options={[
                { v: "fast", label: "快" },
                { v: "normal", label: "正常" },
                { v: "off", label: "关" },
              ]}
            />
          }
        />
      </SettingCard>
    </div>
  );
}

function StartupSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="启动">
        <SettingRow
          label="开机自启"
          description="系统启动时自动运行 pi-switch"
          control={
            <Toggle
              checked={draft.autoLaunch}
              onChange={async (v) => {
                set("autoLaunch", v);
                try { await window.piSwitchDesktop?.setAutoLaunch?.(v); } catch { /* ignore */ }
              }}
            />
          }
        />
        <SettingRow
          label="启动时最小化"
          description="启动后不显示窗口，仅留在托盘"
          control={<Toggle checked={draft.startMinimized} onChange={(v) => set("startMinimized", v)} />}
        />
        <SettingRow
          label="记住窗口大小"
          description="下次打开恢复上次的尺寸和位置"
          control={<Toggle checked={draft.rememberSize} onChange={(v) => set("rememberSize", v)} />}
        />
      </SettingCard>
      <SettingCard title="关闭">
        <SettingRow
          label="关闭按钮最小化到托盘"
          description="不退出进程，仅隐藏窗口"
          control={<Toggle checked={draft.closeToTray} onChange={(v) => set("closeToTray", v)} />}
        />
      </SettingCard>
    </div>
  );
}

function LayoutSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="默认尺寸">
        <SettingRow
          label="宽度"
          description="新窗口的初始宽度（像素）"
          control={<Stepper value={draft.width} onChange={(v) => set("width", v)} min={800} max={2000} step={20} width={100} />}
        />
        <SettingRow
          label="高度"
          description="新窗口的初始高度（像素）"
          control={<Stepper value={draft.height} onChange={(v) => set("height", v)} min={500} max={1500} step={20} width={100} />}
        />
      </SettingCard>
    </div>
  );
}

function AgentSection({
  draft,
  set,
  agentHome,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
  agentHome?: string;
}) {
  const [info, setInfo] = useState<{
    path: string;
    exists: boolean;
    mtime: string | null;
    files: Array<{ name: string; size: number; mtime: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getAgentHomeInfo();
      setInfo(r);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="settings-stack">
      <SettingCard title="Agent home 路径">
        <SettingRow
          label="自定义路径"
          description="留空使用默认 ~/.pi/agent；修改后保存立即生效"
          control={
            <div className="path-control">
              <input
                className="input"
                placeholder={agentHome || "C:\\Users\\...\\.pi\\agent"}
                value={draft.customAgentHome || ""}
                onChange={(e) => set("customAgentHome", e.target.value || null)}
                style={{ width: 360 }}
              />
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  if (window.piSwitchDesktop?.openPath) {
                    void window.piSwitchDesktop.openPath(
                      draft.customAgentHome || agentHome || "",
                    );
                  }
                }}
              >
                打开目录
              </button>
              {draft.customAgentHome ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => set("customAgentHome", null)}
                >
                  清除
                </button>
              ) : null}
            </div>
          }
        />
        {agentHome ? (
          <SettingRow
            label="当前解析路径"
            description="保存到 settings.json 后下次启动生效"
            control={<code className="mono small">{agentHome}</code>}
          />
        ) : null}
      </SettingCard>

      <SettingCard
        title={`目录内容（${info?.files.length ?? "—"} 个文件 · 前 30 个最大的）`}
      >
        <div className="cc-card-body" style={{ padding: 0 }}>
          <div className="cc-row" style={{ padding: "10px 14px" }}>
            <span className="cc-row-label">状态</span>
            <span className="cc-row-value">
              {loading ? "检查中…" : info?.exists ? "存在" : "不存在"}
              <button
                type="button"
                className="btn xs ghost"
                style={{ marginLeft: 8 }}
                onClick={() => void load()}
              >
                刷新
              </button>
            </span>
          </div>
          {info?.mtime ? (
            <div className="cc-row" style={{ padding: "10px 14px" }}>
              <span className="cc-row-label">最后修改</span>
              <span className="cc-row-value mono small">{info.mtime.replace("T", " ").slice(0, 19)}</span>
            </div>
          ) : null}
          {info?.files && info.files.length > 0 ? (
            <div className="cc-row" style={{ padding: "10px 14px", alignItems: "flex-start", flexDirection: "column", gap: 4 }}>
              <span className="cc-row-label" style={{ width: "100%" }}>文件</span>
              <div style={{ width: "100%", display: "grid", gap: 2, fontSize: 12, color: "var(--muted)" }}>
                {info.files.map((f) => (
                  <div key={f.name} className="cc-file-row">
                    <code className="mono small">{f.name}</code>
                    <span className="muted small">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SettingCard>
    </div>
  );
}

function NetworkSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="连接">
        <SettingRow
          label="API 端口"
          description="本地 HTTP 服务的监听端口。修改后需重启 pi-switch"
          control={<Stepper value={draft.apiPort} onChange={(v) => set("apiPort", v)} min={1024} max={65535} step={1} width={100} />}
        />
      </SettingCard>
    </div>
  );
}

function CacheSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="缓存与刷新">
        <SettingRow
          label="缓存 TTL"
          description="相同接口在此时间内复用缓存，不重新拉取（毫秒）"
          control={<Stepper value={draft.cacheTtlMs} onChange={(v) => set("cacheTtlMs", v)} min={0} max={60000} step={500} width={100} />}
        />
        <SettingRow
          label="启动时强制刷新"
          description="绕过缓存，立刻拉取最新数据"
          control={<Toggle checked={draft.refreshOnStartup} onChange={(v) => set("refreshOnStartup", v)} />}
        />
        <SettingRow
          label="切回窗口时刷新"
          description="从其他窗口切回 pi-switch 时自动刷新"
          control={<Toggle checked={draft.refreshOnFocus} onChange={(v) => set("refreshOnFocus", v)} />}
        />
      </SettingCard>
    </div>
  );
}

function GeneralSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="默认行为">
        <SettingRow
          label="启动后默认 tab"
          description="打开 pi-switch 时进入的页面"
          control={
            <select className="input" value={draft.defaultTab} onChange={(e) => set("defaultTab", e.target.value as any)}>
              <option value="dashboard">概览</option>
              <option value="manage">管理</option>
              <option value="usage">用量</option>
              <option value="settings">设置</option>
            </select>
          }
        />
        <SettingRow
          label="显示引导页"
          description="首次启动时展示使用引导"
          control={<Toggle checked={draft.showOnboarding} onChange={(v) => set("showOnboarding", v)} />}
        />
        <SettingRow
          label="聚焦时刷新"
          description="窗口重新获得焦点时自动重新拉取数据"
          control={<Toggle checked={draft.refreshOnFocus} onChange={(v) => set("refreshOnFocus", v)} />}
        />
        <SettingRow
          label="启动时刷新"
          description="应用启动后立即刷新所有数据"
          control={<Toggle checked={draft.refreshOnStartup} onChange={(v) => set("refreshOnStartup", v)} />}
        />
      </SettingCard>
      <SettingCard title="危险操作">
        <SettingRow
          label="删除前确认"
          description="删除供应商、包、备份时弹出确认对话框"
          control={<Toggle checked={draft.confirmDestructive} onChange={(v) => set("confirmDestructive", v)} />}
        />
      </SettingCard>
    </div>
  );
}

function PrivacySection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="确认与安全">
        <SettingRow
          label="危险操作需确认"
          description="删除 provider、清除 auth 等操作前弹窗确认"
          control={<Toggle checked={draft.confirmDestructive} onChange={(v) => set("confirmDestructive", v)} />}
        />
      </SettingCard>
    </div>
  );
}

function NotificationsSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  return (
    <div className="settings-stack">
      <SettingCard title="通知">
        <SettingRow
          label="操作结果 Toast"
          description="保存、删除、刷新成功后右下角提示"
          control={
            <Toggle
              checked={draft.toastNotifications !== false}
              onChange={(v) => set("toastNotifications", v)}
            />
          }
        />
        <SettingRow
          label="错误提示"
          description="接口失败时显示错误 toast"
          control={
            <Toggle
              checked={draft.errorToasts !== false}
              onChange={(v) => set("errorToasts", v)}
            />
          }
        />
      </SettingCard>
      <p className="muted small">修改后立即生效；保存设置后会写入配置文件。</p>
    </div>
  );
}

function DeveloperSection({ draft }: { draft: AppSettings }) {
  return (
    <div className="settings-stack">
      <SettingCard title="开发者信息">
        <SettingRow label="API 基址" control={<code>http://127.0.0.1:{draft.apiPort}</code>} />
        <SettingRow label="缓存 TTL" control={<code>{draft.cacheTtlMs} ms</code>} />
        <SettingRow label="默认 Tab" control={<code>{draft.defaultTab}</code>} />
        <SettingRow
          label="强制刷新页面"
          description="重新加载前端资源"
          control={
            <button type="button" className="btn sm" onClick={() => window.location.reload()}>
              Reload
            </button>
          }
        />
      </SettingCard>
    </div>
  );
}

const SHORTCUT_LABELS: Record<string, string> = {
  "tab.dashboard": "概览",
  "tab.manage": "管理",
  "tab.usage": "用量",
  "tab.settings": "设置",
  "window.close": "关闭窗口",
  "window.minimize": "最小化",
  "window.refresh": "刷新",
};

function ShortcutsSection({
  draft,
  set,
}: {
  draft: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "标签页",
      items: Object.entries(draft.shortcuts).filter(([k]) => k.startsWith("tab.")),
    },
    {
      title: "窗口",
      items: Object.entries(draft.shortcuts).filter(([k]) => k.startsWith("window.")),
    },
  ];

  return (
    <div className="settings-stack">
      {groups.map((g) => (
        <SettingCard key={g.title} title={g.title}>
          {g.items.map(([action, accel]) => (
            <SettingRow
              key={action}
              label={SHORTCUT_LABELS[action] || action}
              description={action}
              control={
                <ShortcutInput
                  value={accel}
                  onChange={(v) =>
                    set("shortcuts", { ...draft.shortcuts, [action]: v })
                  }
                />
              }
            />
          ))}
        </SettingCard>
      ))}
      <p className="muted small">
        点击右侧输入框，按下要设置的组合键（支持 Ctrl / Alt / Shift + 任意键）。
        留空 = 不绑定。标签页快捷键在应用内即时生效；全局窗口快捷键需重启。
      </p>
    </div>
  );
}

function PromptSection() {
  const [content, setContent] = useState("");
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getPrompt()
      .then((r) => {
        setContent(r.content);
        setExists(r.exists);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.savePrompt(content);
      setExists(r.exists);
      toast("已保存提示词", "ok");
    } catch (e) {
      toast("保存失败: " + e, "err");
    } finally {
      setSaving(false);
    }
  };

  const loadTemplate = (kind: "minimal" | "code" | "research") => {
    const templates: Record<string, string> = {
      minimal: "You are a helpful assistant.",
      code: "You are an expert software engineer.\n- Prefer small, focused diffs.\n- Read existing code before editing.\n- Add tests for behavior changes.",
      research:
        "You are a research analyst.\n- Cite sources.\n- Compare alternatives.\n- Highlight trade-offs.",
    };
    setContent(templates[kind]);
  };

  if (loading) {
    return (
      <div className="settings-stack">
        <Skeleton width="100%" height={280} />
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <SettingCard
        title="系统提示词"
        footer={
          <div className="row-gap">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => loadTemplate("minimal")}
            >
              极简
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => loadTemplate("code")}
            >
              编程
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => loadTemplate("research")}
            >
              研究
            </button>
            <span className="muted small" style={{ marginLeft: "auto" }}>
              {exists ? "已存在" : "尚未创建"} · {content.length} 字符
            </span>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        }
      >
        <p className="muted small" style={{ marginBottom: 8 }}>
          存放在 <code>~/.pi-switch/system-prompt.md</code>。pi-switch 不会自动注入到 pi — 你可以自己用 pi 扩展或 <code>@file</code> 引用。
        </p>
        <textarea
          className="prompt-area"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="(空)"
          spellCheck={false}
        />
      </SettingCard>
    </div>
  );
}

function AboutSection({
  draft,
  platform,
  agentHome,
}: {
  draft: AppSettings;
  platform: string;
  agentHome?: string;
}) {
  const rows: { label: string; value: string; copyable?: string }[] = [
    { label: "版本", value: "v0.1.0" },
    { label: "平台", value: platform || "browser" },
    {
      label: "运行在 Electron",
      value: window.piSwitchDesktop?.isDesktop ? "是" : "否",
    },
    { label: "Agent home", value: agentHome || "—", copyable: agentHome },
    { label: "API", value: `http://127.0.0.1:${draft.apiPort}`, copyable: `http://127.0.0.1:${draft.apiPort}` },
  ];

  return (
    <div className="about-hero">
      <div className="about-logo">π</div>
      <h2 className="about-name">pi-switch</h2>
      <div className="about-version">
        <Tag tone="default">v0.1.0</Tag>
        <span className="muted small">为 pi coding agent 而生</span>
      </div>
      <table className="kv about-kv">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>
                <code>{r.value}</code>
                {r.copyable ? (
                  <button
                    type="button"
                    className="btn xs ghost"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      navigator.clipboard?.writeText(r.copyable!);
                      toast("已复制", "ok");
                    }}
                  >
                    复制
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
