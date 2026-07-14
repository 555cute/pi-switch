import { useEffect, useMemo, useState } from "react";
import { WindowControls } from "./components/WindowControls";
import { ToastContainer } from "./components/Toast";
import { Overview } from "./pages/Overview";
import { Manage } from "./pages/Manage";
import { Settings } from "./pages/Settings";
import { Usage } from "./pages/Usage";
import { ensureAppSettings, ensureProviders, ensureSkills, useCache } from "./store";
import type { TabId } from "./types";
import "./App.css";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "概览", icon: "▦" },
  { id: "manage", label: "管理", icon: "⚙" },
  { id: "usage", label: "用量", icon: "▮" },
  { id: "settings", label: "设置", icon: "◐" },
];

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
  const [isDesktop, setIsDesktop] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<
    Array<{ tab: TabId; title: string; meta?: string }> | null
  >(null);
  const cache = useCache();

  useEffect(() => {
    const desktop = !!window.piSwitchDesktop?.isDesktop;
    setIsDesktop(desktop);
    document.documentElement.classList.toggle("is-desktop", desktop);
    ensureAppSettings();
  }, []);

  // Apply theme / font / radius when settings load
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
  }, [cache.appSettings]);

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
    const out: Array<{ tab: TabId; title: string; meta?: string }> = [];
    for (const p of cache.providers?.providers || []) {
      if (p.name.toLowerCase().includes(ql) || p.models.some((m) => m.id.toLowerCase().includes(ql))) {
        out.push({ tab: "manage", title: p.name, meta: `${p.models.length} models` });
      }
    }
    for (const s of cache.skills?.skills || []) {
      if (s.name.toLowerCase().includes(ql)) {
        out.push({ tab: "manage", title: s.name, meta: "skill" });
      }
    }
    for (const p of cache.packagesDetail || []) {
      if (p.name.toLowerCase().includes(ql) || p.spec.toLowerCase().includes(ql)) {
        out.push({ tab: "manage", title: p.name, meta: "package" });
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
                onClick={() => setTab(t.id)}
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
          <div className="data-source-tag">
            <span className="dot" />
            <code>~/.pi/agent</code>
          </div>
          <WindowControls />
        </div>
      </header>

      <main className="content">
        <div className="content-scroll">
          {tab === "dashboard" ? (
            <Overview onNavigate={(id: string) => setTab(id as TabId)} />
          ) : null}
          {tab === "manage" ? <Manage /> : null}
          {tab === "usage" ? <Usage /> : null}
          {tab === "settings" ? <Settings /> : null}
        </div>
      </main>
      <ToastContainer />
      {searchResult ? (
        <div className="search-overlay" onClick={() => setSearchResult(null)}>
          <div
            className="search-panel"
            onClick={(e) => e.stopPropagation()}
          >
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
                        setTab(r.tab);
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
