import { useEffect, useMemo, useState } from "react";
import { Preferences, type PrefSection } from "./settings/Preferences";
import { Backups } from "./settings/Backups";
import { Control } from "./settings/Control";
import { Diagnostics } from "./settings/Diagnostics";
import { saveAppSettings, useCache } from "../store";
import { toast } from "../components/Toast";

export type SettingsLeaf =
  | PrefSection
  | "backups"
  | "control"
  | "events"
  | "diagnostics";

type NavItem = {
  id: SettingsLeaf;
  label: string;
  en: string;
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
      { id: "theme", label: "主题", en: "Theme" },
      { id: "typography", label: "字体与排版", en: "Typography" },
      { id: "motion", label: "动效", en: "Motion" },
    ],
  },
  {
    id: "window",
    label: "窗口",
    items: [
      { id: "startup", label: "启动与关闭", en: "Startup" },
      { id: "layout", label: "尺寸与布局", en: "Layout" },
    ],
  },
  {
    id: "behavior",
    label: "行为",
    items: [
      { id: "general", label: "通用", en: "General" },
      { id: "privacy", label: "隐私", en: "Privacy" },
      { id: "notifications", label: "通知", en: "Notifications" },
      { id: "shortcuts", label: "快捷键", en: "Shortcuts" },
    ],
  },
  {
    id: "data",
    label: "数据",
    items: [
      { id: "agent", label: "Agent 路径", en: "Agent" },
      { id: "network", label: "网络", en: "Network" },
      { id: "cache", label: "缓存", en: "Cache" },
      { id: "backups", label: "备份", en: "Backups" },
    ],
  },
  {
    id: "ops",
    label: "运维",
    items: [
      { id: "control", label: "进程", en: "Processes" },
      { id: "events", label: "事件", en: "Events" },
      { id: "diagnostics", label: "诊断", en: "Diagnostics" },
      { id: "prompt", label: "系统提示", en: "Prompt" },
      { id: "developer", label: "开发者", en: "Developer" },
    ],
  },
  {
    id: "meta",
    label: "关于",
    items: [
      { id: "about", label: "关于", en: "About" },
    ],
  },
];

const PREF_LEAVES: SettingsLeaf[] = [
  "theme",
  "typography",
  "motion",
  "startup",
  "layout",
  "general",
  "privacy",
  "notifications",
  "shortcuts",
  "agent",
  "network",
  "cache",
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
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const cache = useCache();

  useEffect(() => {
    cache.agentHome; // ensure loaded
  }, [cache.agentHome]);

  const isPref = PREF_LEAVES.includes(leaf);
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

  const filtered = useMemo(() => {
    const ql = search.trim().toLowerCase();
    if (!ql) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.label.toLowerCase().includes(ql) ||
          i.en.toLowerCase().includes(ql),
      ),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  const currentMeta = useMemo(() => {
    for (const g of NAV_GROUPS) {
      const hit = g.items.find((i) => i.id === leaf);
      if (hit) return hit;
    }
    return NAV_GROUPS[0].items[0];
  }, [leaf]);

  return (
    <div className="settings-shell">
      <nav className="settings-nav">
        <div className="settings-nav-search-wrap">
          <input
            className="settings-nav-search"
            placeholder="搜索设置…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="settings-nav-scroll">
          {filtered.map((group) => (
            <div className="settings-nav-group" key={group.id}>
              <div className="settings-nav-group-head">{group.label}</div>
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
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="empty-inline" style={{ padding: 12 }}>
              没找到匹配项
            </div>
          ) : null}
        </div>
      </nav>

      <div className="settings-main">
        <header className="settings-pane-head">
          <h1>
            {currentMeta.label} <span className="en">{currentMeta.en}</span>
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

        <div className="settings-pane-body">
            {PREF_LEAVES.includes(leaf) ? (
              <Preferences section={leaf as PrefSection} />
            ) : null}
            {leaf === "backups" ? <Backups /> : null}
            {leaf === "control" || leaf === "events" ? (
              <Control focus={leaf === "events" ? "events" : "processes"} />
            ) : null}
            {leaf === "diagnostics" ? <Diagnostics /> : null}
        </div>
      </div>
    </div>
  );
}
