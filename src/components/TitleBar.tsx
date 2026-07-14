import { useEffect, useState } from "react";

export function TitleBar() {
  const desktop =
    typeof window !== "undefined" ? window.piSwitchDesktop : undefined;
  const [maximized, setMaximized] = useState(false);
  const isDesktop = !!desktop?.isDesktop;

  useEffect(() => {
    if (!desktop) return;
    void desktop.isMaximized().then(setMaximized);
    return desktop.onWindowState((s) => setMaximized(s.maximized));
  }, [desktop]);

  return (
    <div className={`titlebar ${isDesktop ? "desktop" : "browser"} ${maximized ? "maximized" : ""}`}>
      <div className="titlebar-drag">
        <span className="titlebar-logo">π</span>
        <span className="titlebar-title">pi-switch</span>
      </div>
      {isDesktop ? (
        <div className="titlebar-controls">
          <button
            type="button"
            className="win-btn"
            aria-label="Minimize"
            onClick={() => void desktop.minimize()}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="win-btn"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => void desktop.maximize().then(setMaximized)}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M2 3h5v5H2V3zm1-1h5v5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="1"
                  y="1"
                  width="8"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="win-btn close"
            aria-label="Close"
            onClick={() => void desktop.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="titlebar-controls" style={{ paddingRight: 10, alignItems: "center", display: "flex" }}>
          <span className="muted small">web preview</span>
        </div>
      )}
    </div>
  );
}
