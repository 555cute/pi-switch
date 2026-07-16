import { useEffect, useState } from "react";
import { Preferences, type PrefSection } from "./settings/Preferences";
import { Backups } from "./settings/Backups";
import { Control } from "./settings/Control";
import { saveAppSettings, useCache } from "../store";
import { toast } from "../components/Toast";

export type SettingsLeaf =
  | PrefSection
  | "backups"
  | "control"
  | "events"
  | "diagnostics";

type Tab = {
  id: SettingsLeaf;
  label: string;
  en: string;
};

const TABS: Tab[] = [
  { id: "general", label: "通用", en: "General" },
  { id: "theme", label: "外观", en: "Appearance" },
  { id: "agent", label: "数据", en: "Data" },
  { id: "backups", label: "备份", en: "Backups" },
  { id: "control", label: "运维", en: "Runtime" },
  { id: "about", label: "关于", en: "About" },
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

/** Sub-pills inside a top-level tab. e.g. "外观" tab → [主题, 字体, 动效, 启动, 布局] */
type SubLeaf = PrefSection | "control" | "events" | "diagnostics";
const SUB_LEAVES: Partial<Record<SettingsLeaf, SubLeaf[]>> = {
  general: ["general", "privacy", "notifications", "shortcuts"],
  theme: ["theme", "typography", "motion", "startup", "layout"],
  agent: ["agent", "network", "cache"],
  control: ["control", "events", "diagnostics", "prompt", "developer"],
};

const SUB_LABEL: Record<SubLeaf, { label: string; en: string }> = {
  general: { label: "通用", en: "General" },
  privacy: { label: "隐私", en: "Privacy" },
  notifications: { label: "通知", en: "Notifications" },
  shortcuts: { label: "快捷键", en: "Shortcuts" },
  theme: { label: "主题", en: "Theme" },
  typography: { label: "字体", en: "Typography" },
  motion: { label: "动效", en: "Motion" },
  startup: { label: "启动", en: "Startup" },
  layout: { label: "布局", en: "Layout" },
  agent: { label: "Agent", en: "Agent" },
  network: { label: "网络", en: "Network" },
  cache: { label: "缓存", en: "Cache" },
  control: { label: "进程", en: "Processes" },
  events: { label: "事件", en: "Events" },
  diagnostics: { label: "诊断", en: "Diagnostics" },
  prompt: { label: "系统提示", en: "Prompt" },
  developer: { label: "开发者", en: "Developer" },
  about: { label: "关于", en: "About" },
};

export function Settings({
  initial = "general",
}: {
  initial?: SettingsLeaf;
} = {}) {
  const [tab, setTab] = useState<SettingsLeaf>(initial);
  const [sub, setSub] = useState<SubLeaf>(
    PREF_LEAVES.includes(initial as PrefSection)
      ? (initial as PrefSection)
      : "general",
  );
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const cache = useCache();

  useEffect(() => {
    cache.agentHome;
  }, [cache.agentHome]);

  // Reset sub-leaf when tab changes
  useEffect(() => {
    if (tab === "backups") setSub("general");
    else if (tab === "about") setSub("about");
    else if (PREF_LEAVES.includes(tab as PrefSection)) setSub(tab as PrefSection);
  }, [tab]);

  const isPref = PREF_LEAVES.includes(sub);
  const canSave = isPref && cache.appSettings != null;

  const doExport = () => {
    if (!cache.appSettings) return;
    setExporting(true);
    try {
      const blob = new Blob([JSON.stringify(cache.appSettings, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pi-switch-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("已导出", "ok");
    } finally {
      setExporting(false);
    }
  };

  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(reader.result as string);
        await saveAppSettings({ ...cache.appSettings, ...obj });
        toast("已导入并保存", "ok");
      } catch (err) {
        toast("导入失败: " + err, "err");
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const doSave = async () => {
    if (!canSave) return;
    setSavingPrefs(true);
    try {
      await saveAppSettings(cache.appSettings!);
      toast("已保存", "ok");
    } catch (e) {
      toast("保存失败: " + e, "err");
    } finally {
      setSavingPrefs(false);
    }
  };

  const doReset = async () => {
    if (!cache.appSettingsDefaults) return;
    setSavingPrefs(true);
    try {
      await saveAppSettings(cache.appSettingsDefaults);
      toast("已恢复默认", "ok");
    } catch (e) {
      toast("重置失败: " + e, "err");
    } finally {
      setSavingPrefs(false);
    }
  };

  const subs = SUB_LEAVES[tab] ?? [];

  return (
    <div className="page settings-page">
      <header className="page-header">
        <h1>
          设置 <span className="en">Settings</span>
        </h1>
        <div className="row-gap">
          {isPref ? (
            <>
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                id="settings-import-input"
                onChange={doImport}
              />
              <button
                type="button"
                className="btn xs"
                disabled={importing}
                onClick={() =>
                  document.getElementById("settings-import-input")?.click()
                }
              >
                导入
              </button>
              <button
                type="button"
                className="btn xs"
                disabled={exporting}
                onClick={doExport}
              >
                导出
              </button>
              <button
                type="button"
                className="btn xs"
                disabled={savingPrefs}
                onClick={doReset}
              >
                恢复默认
              </button>
              <button
                type="button"
                className="btn primary xs"
                disabled={!canSave || savingPrefs}
                onClick={doSave}
              >
                {savingPrefs ? "保存中…" : "保存"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="settings-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`settings-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subs.length > 0 ? (
        <div className="settings-subtabs">
          {subs.map((s) => (
            <button
              key={s}
              type="button"
              className={`settings-subtab ${sub === s ? "active" : ""}`}
              onClick={() => setSub(s)}
            >
              {SUB_LABEL[s].label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="settings-body">
        {tab === "backups" ? <Backups /> : null}
        {tab === "control" ? (
          <Control focus={sub === "events" ? "events" : "processes"} />
        ) : null}
        {tab === "about" ? <AboutPage /> : null}
        {tab !== "backups" && tab !== "control" && tab !== "about" && (
          <Preferences section={sub as PrefSection} />
        )}
      </div>
    </div>
  );
}

function AboutPage() {
  const [version, setVersion] = useState("0.1.0");
  const [platform, setPlatform] = useState<string>("Web");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void window.piSwitchDesktop?.getVersion?.().then((v) => {
      if (v) setVersion(String(v));
    });
    void Promise.resolve(window.piSwitchDesktop?.platform?.()).then((p) => {
      if (p) setPlatform(String(p));
    });
  }, []);

  const deps = [
    { name: "React 19", license: "MIT" },
    { name: "Vite 7", license: "MIT" },
    { name: "TypeScript 5.8", license: "Apache-2.0" },
    { name: "Electron 37", license: "MIT" },
    { name: "Inter / Inter Tight", license: "OFL" },
    { name: "JetBrains Mono", license: "OFL" },
  ];

  const repoUrl = "https://github.com/555cute/pi-switch";
  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(repoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="settings-stack">
      <section className="cc-card about-hero-card">
        <div className="about-hero">
          <img src="/logo.png" alt="pi-switch" className="about-hero-logo" />
          <div className="about-hero-text">
            <div className="about-hero-name">pi-switch</div>
            <div className="about-hero-tag">
              v{version} · {platform}
            </div>
            <div className="about-hero-desc">
              pi 编码代理的桌面管理器 · 供应商 / 用量 / 技能 / 包
            </div>
          </div>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-card-title">仓库</div>
        <div className="cc-card-sub">开源项目，欢迎 Issue / PR</div>
        <div className="cc-card-body">
          <div className="cc-row">
            <span className="cc-row-label">GitHub</span>
            <a
              className="cc-row-value cc-link"
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
            >
              github.com/555cute/pi-switch
            </a>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">Issues</span>
            <a
              className="cc-row-value cc-link"
              href={repoUrl + "/issues"}
              target="_blank"
              rel="noreferrer"
            >
              报告问题 →
            </a>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">复制仓库地址</span>
            <span className="cc-row-value">
              <button type="button" className="btn xs" onClick={copyCmd}>
                {copied ? "已复制 ✓" : "复制"}
              </button>
            </span>
          </div>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-card-title">应用信息</div>
        <div className="cc-card-sub">版本 / 平台 / 许可</div>
        <div className="cc-card-body">
          <div className="cc-row">
            <span className="cc-row-label">名称</span>
            <span className="cc-row-value">pi-switch</span>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">版本</span>
            <span className="cc-row-value mono">v{version}</span>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">平台</span>
            <span className="cc-row-value">
              {platform} · {window.piSwitchDesktop?.isDesktop ? "桌面端" : "浏览器"}
            </span>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">许可</span>
            <span className="cc-row-value">MIT</span>
          </div>
          <div className="cc-row">
            <span className="cc-row-label">更新</span>
            <span className="cc-row-value">
              <span className="muted">v0.1.0 — 当前已是最新</span>
            </span>
          </div>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-card-title">第三方组件</div>
        <div className="cc-card-sub">本应用依赖的开源组件</div>
        <div className="cc-card-body">
          {deps.map((d) => (
            <div className="cc-row" key={d.name}>
              <span className="cc-row-label">{d.name}</span>
              <span className="cc-row-value">
                {d.license}
                <a
                  className="cc-link-small"
                  href={repoUrl + "/blob/main/THIRD-PARTY-NOTICES.md"}
                  target="_blank"
                  rel="noreferrer"
                >
                  许可全文
                </a>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
