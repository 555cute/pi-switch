import { useCallback, useEffect, useMemo, useState } from "react";
import { WindowControls } from "./components/WindowControls";
import { ToastContainer, setToastPrefs } from "./components/Toast";
import { Overview } from "./pages/Overview";
import { Manage } from "./pages/Manage";
import { Settings, type SettingsLeaf } from "./pages/Settings";
import { Usage } from "./pages/Usage";
import { ensureAppSettings, ensureProviders, ensureSkills, useCache } from "./store";
import type { NavRequest, TabId } from "./types";
import "./App.css";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "概览", icon: "⌂" },
  { id: "manage", label: "管理", icon: "☰" },
  { id: "usage", label: "用量", icon: "▣" },
  { id: "settings", label: "设置", icon: "⚙" },
];

const TAB_IDS = new Set<TabId>(["dashboard", "manage", "usage", "settings"]);

export type { NavRequest };

function normalizeTab(id: string | undefined | null): TabId {
  if (!id) return "dashboard";
  if (id === "providers" || id === "skills" || id === "packages") return "manage";
  if (id === "control" || id === "backups") return "settings";
  if (TAB_IDS.has(id as TabId)) return id as TabId;
  return "dashboard";
}

function applyTheme(theme: "light" | "dark" | "auto") {
  let resolved: "light" | "dark" = "light";
  if (theme === "dark") resolved = "dark";
  else if (theme === "auto") {
    resolved = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.dataset.theme = resolved;
}

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [manageSection, setManageSection] = useState<"providers" | "extensions">("providers");
  const [settingsLeaf, setSettingsLeaf] = useState<SettingsLeaf>("theme");
  const [navEpoch, setNavEpoch] = useState(0);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<
    Array<{ tab: TabId; title: string; meta?: string; nav?: NavRequest }> | null
  >(null);
  const cache = useCache();

  const navigate = useCallback((req: NavRequest | TabId | string) => {
    const target: NavRequest =
      typeof req === "string"
        ? { tab: normalizeTab(req) }
        : { ...req, tab: normalizeTab(req.tab) };

    setTab(target.tab);
    if (target.manageSection) setManageSection(target.manageSection);
    if (target.settingsLeaf) setSettingsLeaf(target.settingsLeaf as SettingsLeaf);
    setNavEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    const desktop = !!window.piSwitchDesktop?.isDesktop;
    setIsDesktop(desktop);
    document.documentElement.classList.toggle("is-desktop", desktop);
    ensureAppSettings();
  }, []);

  // Apply theme / font / radius / toast prefs when settings load
  useEffect(() => {
    const s = cache.appSettings;
    if (!s) return;
    applyTheme(s.theme);
    document.documentElement.style.setProperty("--radius", `${s.radius}px`);
    document.documentElement.style.setProperty("--font-size", `${s.fontSize}px`);
    const fontMap: Record<string, string> = {
      inter: '"Inter","Inter Tight",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      sf: '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",sans-serif',
      system: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      jetbrains: '"JetBrains Mono","Inter",monospace',
    };
    document.documentElement.style.setProperty("--font", fontMap[s.font] || fontMap.inter);
    document.documentElement.dataset.animation = s.animation;
    setToastPrefs({
      toastNotifications: s.toastNotifications !== false,
      errorToasts: s.errorToasts !== false,
    });

    if (!defaultApplied) {
      setTab(normalizeTab(s.defaultTab));
      setDefaultApplied(true);
    }
  }, [cache.appSettings, defaultApplied]);

  // Follow system theme changes
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => {
      if (cache.appSettings?.theme === "auto") applyTheme("auto");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [cache.appSettings?.theme]);

  // Trigger initial fetches for badges
  useEffect(() => {
    ensureProviders();
    ensureSkills();
  }, []);

  // Refresh on window focus
  useEffect(() => {
    const onFocus = () => {
      if (cache.appSettings?.refreshOnFocus) {
        ensureProviders(true);
        ensureSkills(true);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cache.appSettings?.refreshOnFocus]);

  // Desktop navigate IPC (global shortcuts from Electron)
  useEffect(() => {
    const unsub = window.piSwitchDesktop?.onNavigate?.((payload) => {
      if (payload?.tab) navigate(payload as NavRequest);
    });
    return () => unsub?.();
  }, [navigate]);

  // In-app keyboard shortcuts (browser + desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const map: Record<string, TabId> = {
        "1": "dashboard",
        "2": "manage",
        "3": "usage",
        "4": "settings",
      };
      const t = map[e.key];
      if (t) {
        e.preventDefault();
        navigate(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Tab badges: manage tab shows count of issues (no auth + overridden)
  const badges: Partial<Record<TabId, string | number>> = useMemo(() => {
    const out: Partial<Record<TabId, string | number>> = {};
    const noAuth = (cache.providers?.providers || []).filter((p) => !p.hasAuth).length;
    const overridden = (cache.packagesDetail || []).filter((p) => p.hasOverrides).length;
    const total = noAuth + overridden;
    if (total > 0) out.manage = total;
    return out;
  }, [cache.providers, cache.packagesDetail]);

  const runSearch = (q: string) => {
    const ql = q.toLowerCase();
    const out: Array<{ tab: TabId; title: string; meta?: string; nav?: NavRequest }> = [];
    for (const p of cache.providers?.providers || []) {
      if (p.name.toLowerCase().includes(ql) || p.models.some((m) => m.id.toLowerCase().includes(ql))) {
        out.push({
          tab: "manage",
          title: p.name,
          meta: `${p.models.length} models`,
          nav: { tab: "manage", manageSection: "providers" },
        });
      }
    }
    for (const s of cache.skills?.skills || []) {
      if (s.name.toLowerCase().includes(ql)) {
        out.push({
          tab: "manage",
          title: s.name,
          meta: "skill",
          nav: { tab: "manage", manageSection: "extensions" },
        });
      }
    }
    for (const p of cache.packagesDetail || []) {
      if (p.name.toLowerCase().includes(ql) || p.spec.toLowerCase().includes(ql)) {
        out.push({
          tab: "manage",
          title: p.name,
          meta: "package",
          nav: { tab: "manage", manageSection: "extensions" },
        });
      }
    }
    // settings leaves
    const settingsHits: Array<{ leaf: SettingsLeaf; title: string; en: string }> = [
      { leaf: "theme", title: "主题", en: "theme" },
      { leaf: "typography", title: "字体与排版", en: "font typography" },
      { leaf: "shortcuts", title: "快捷键", en: "shortcuts hotkey" },
      { leaf: "backups", title: "备份与恢复", en: "backup" },
      { leaf: "control", title: "进程控制", en: "process" },
      { leaf: "prompt", title: "系统提示", en: "prompt" },
      { leaf: "network", title: "网络连接", en: "network port" },
      { leaf: "cache", title: "缓存与刷新", en: "cache" },
    ];
    for (const h of settingsHits) {
      if (h.title.includes(q) || h.en.includes(ql)) {
        out.push({
          tab: "settings",
          title: h.title,
          meta: "settings",
          nav: { tab: "settings", settingsLeaf: h.leaf },
        });
      }
    }
    setSearchResult(out.slice(0, 30));
  };

  return (
    <div className={`app-root ${isDesktop ? "desktop" : "browser"}`}>
      <header className="topbar">
        <div className="topbar-brand draggable">
          <div className="brand-mark">π</div>
          <div className="brand-text">
            <div className="brand-title">pi-switch</div>
            <div className="brand-sub">v0.1.0</div>
          </div>
        </div>

        <nav className="topnav">
          {TABS.map((t) => {
            const badge = badges[t.id];
            return (
              <button
                type="button"
                key={t.id}
                className={`topnav-item ${tab === t.id ? "active" : ""}`}
                onClick={() => navigate(t.id)}
                data-icon={t.icon}
              >
                <span className="topnav-icon">{t.icon}</span>
                <span className="topnav-label">{t.label}</span>
                {badge ? <span className="tab-badge">{badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="topbar-right">
          <div className="global-search">
            <span className="gs-icon">⌕</span>
            <input
              className="gs-input"
              placeholder="搜索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  runSearch(search.trim());
                }
              }}
            />
            {search ? (
              <button
                type="button"
                className="gs-clear"
                onClick={() => setSearch("")}
                aria-label="清空"
              >
                ×
              </button>
            ) : null}
          </div>
          <div className="data-source-tag" title={cache.agentHome || "~/.pi/agent"}>
            <span className="dot" />
            <span>Agent</span>
          </div>
          <WindowControls />
        </div>
      </header>

      <main className="content">
        <div className="content-scroll">
          {tab === "dashboard" ? <Overview onNavigate={navigate} /> : null}
          {tab === "manage" ? (
            <Manage key={`manage-${manageSection}-${navEpoch}`} initial={manageSection} />
          ) : null}
          {tab === "usage" ? <Usage /> : null}
          {tab === "settings" ? (
            <Settings key={`settings-${settingsLeaf}-${navEpoch}`} initial={settingsLeaf} />
          ) : null}
        </div>
      </main>
      <ToastContainer />
      {searchResult ? (
        <div className="search-overlay" onClick={() => setSearchResult(null)}>
          <div className="search-panel" onClick={(e) => e.stopPropagation()}>
            <div className="search-panel-head">
              <h3>搜索「{search}」</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSearchResult(null)}
              >
                ×
              </button>
            </div>
            <div className="search-panel-body">
              {searchResult.length === 0 ? (
                <div className="empty-inline">没找到匹配项</div>
              ) : (
                <div className="search-list">
                  {searchResult.map((r, i) => (
                    <button
                      type="button"
                      key={i}
                      className="search-row"
                      onClick={() => {
                        navigate(r.nav || r.tab);
                        setSearchResult(null);
                        setSearch("");
                      }}
                    >
                      <span className="search-tab">{r.tab}</span>
                      <span className="search-title">{r.title}</span>
                      <span className="search-meta">{r.meta}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
