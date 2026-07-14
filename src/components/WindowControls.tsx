import { useEffect, useState } from "react";

/**
 * Min / Max / Close buttons embedded into the app chrome (not a system titlebar).
 * - Minimize / Maximize / Close
 * - Only rendered in desktop mode (Electron)
 */
export function WindowControls() {
  const desktop =
    typeof window !== "undefined" ? window.piSwitchDesktop : undefined;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    void desktop.isMaximized().then(setMaximized);
    return desktop.onWindowState((s) => setMaximized(s.maximized));
  }, [desktop]);

  if (!desktop?.isDesktop) return null;

  return (
    <div className="win-controls" role="group" aria-label="Window controls">
      <button
        type="button"
        className="win-ctl"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void desktop.minimize()}
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="win-ctl"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
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
        className="win-ctl close"
        aria-label="Close"
        title="Close"
        onClick={() => void desktop.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M1 1l8 8M9 1L1 9"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
    </div>
  );
}
