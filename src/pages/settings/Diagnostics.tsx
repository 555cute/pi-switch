import { useEffect, useState } from "react";
import { Tag } from "../../components/UI";
import { toast } from "../../components/Toast";
import { useCache } from "../../store";

export function Diagnostics() {
  const cache = useCache();
  const port = cache.appSettings?.apiPort || 8787;
  const base = import.meta.env.VITE_API_BASE || `http://127.0.0.1:${port}`;
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "err">(
    "checking",
  );
  const [latency, setLatency] = useState<number | null>(null);
  const [version, setVersion] = useState<string>("—");

  const runCheck = async () => {
    setApiStatus("checking");
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/health`, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApiStatus("ok");
    } catch {
      setApiStatus("err");
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
    <div className="settings-stack">
      <section className="setting-card">
        <div className="setting-card-title">健康检查</div>
        <div className="setting-card-body">
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">API 服务</div>
            </div>
            <div className="setting-row-control">
              {apiStatus === "checking" ? (
                <Tag tone="warn">checking</Tag>
              ) : apiStatus === "ok" ? (
                <Tag tone="ok">
                  online{latency != null ? ` · ${latency}ms` : ""}
                </Tag>
              ) : (
                <Tag tone="danger">offline</Tag>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">端点</div>
            </div>
            <div className="setting-row-control">
              <code className="mono small">{base}/api/health</code>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">运行环境</div>
            </div>
            <div className="setting-row-control">
              <Tag tone="info">
                {window.piSwitchDesktop?.isDesktop ? "Electron" : "Web"} · v
                {version}
              </Tag>
              <Tag tone="default">{import.meta.env.DEV ? "dev" : "prod"}</Tag>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">Agent home</div>
            </div>
            <div className="setting-row-control">
              <button
                type="button"
                className="btn xs"
                disabled={!cache.agentHome}
                onClick={() =>
                  cache.agentHome &&
                  window.piSwitchDesktop?.openPath?.(cache.agentHome)
                }
              >
                打开
              </button>
            </div>
          </div>
        </div>
        <div className="setting-card-footer">
          <button type="button" className="btn xs" onClick={() => void runCheck()}>
            重新检测
          </button>
          <button
            type="button"
            className="btn xs"
            onClick={() => {
              toast("正在刷新…", "info");
              window.location.reload();
            }}
          >
            刷新应用
          </button>
        </div>
      </section>
    </div>
  );
}
