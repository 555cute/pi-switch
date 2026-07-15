import { useEffect, useRef, useState } from "react";
import {
  ensureProcesses,
  ensureRecentEvents,
  pushRecentEvent,
  useCache,
} from "../../store";
import { ConfirmDialog } from "../../components/Modal";
import { Tag } from "../../components/UI";
import { toast } from "../../components/Toast";
import { api } from "../../api";
import type { PiProcessInfo, RuntimeEvent } from "../../types";
import { formatDate } from "../../utils";

const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

const EVENT_TYPES = ["usage", "skill", "tool", "all"] as const;

export function Control({
  focus = "all",
}: {
  focus?: "all" | "processes" | "events";
} = {}) {
  const cache = useCache();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [eventFilter, setEventFilter] = useState<(typeof EVENT_TYPES)[number]>("all");
  const [confirmKill, setConfirmKill] = useState<PiProcessInfo | null>(null);
  const [procFilter, setProcFilter] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const eventListRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const showProcesses = focus === "all" || focus === "processes";
  const showEvents = focus === "all" || focus === "events";

  useEffect(() => {
    ensureProcesses();
    ensureRecentEvents();
  }, []);

  useEffect(() => {
    if (paused) return;
    const es = new EventSource(`${BASE}/api/events`);
    esRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as RuntimeEvent;
        pushRecentEvent(data);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      setSseConnected(false);
      es.close();
    };
    return () => {
      es.close();
      esRef.current = null;
      setSseConnected(false);
    };
  }, [paused]);

  useEffect(() => {
    if (autoScroll && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [cache.recentEvents, autoScroll]);

  const processes = cache.processes || [];
  const events = cache.recentEvents || [];

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      ensureProcesses(true);
      ensureRecentEvents(true);
      toast("已刷新", "ok");
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  };

  const kill = async (p: PiProcessInfo) => {
    setError(null);
    try {
      const r = await api.killPiProcess(p.pid);
      if (!r.ok) {
        setError(r.error || "kill failed");
        toast("Kill 失败: " + (r.error || "?"), "err");
      } else {
        toast(`已 kill PID ${p.pid}`, "ok");
      }
      ensureProcesses(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setConfirmKill(null);
    }
  };

  const exportEvents = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pi-runtime-events-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出", "ok");
  };

  const filteredProcs = processes.filter((p) => {
    const ql = procFilter.trim().toLowerCase();
    if (!ql) return true;
    return (
      p.name.toLowerCase().includes(ql) ||
      String(p.pid).includes(ql) ||
      p.cmd.toLowerCase().includes(ql)
    );
  });

  const filteredEvents =
    eventFilter === "all" ? events : events.filter((e) => e.type === eventFilter);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            控制台 <span className="en">Control</span>
          </h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`btn sm ${paused ? "" : "primary"}`}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "继续事件流" : "暂停事件流"}
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? "刷新中…" : "刷新"}
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">⚠ {error}</div> : null}

      {showProcesses ? (
      <section className="panel">
        <div className="panel-header">
          <h2>
            Pi 进程 ({filteredProcs.length}/{processes.length})
          </h2>
          <div className="row-gap">
            <input
              className="input sm"
              placeholder="过滤 PID / name / cmd…"
              value={procFilter}
              onChange={(e) => setProcFilter(e.target.value)}
            />
          </div>
        </div>
        {processes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">○</div>
            <div className="empty-title">没找到 pi 进程</div>
            <div className="empty-desc">
              可能没在运行，或者 pi 用了不同的进程名。点刷新试试。
            </div>
            <div className="empty-action">
              <button
                type="button"
                className="btn sm"
                onClick={() => void refresh()}
              >
                刷新
              </button>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PID</th>
                  <th>Name</th>
                  <th>CPU%</th>
                  <th>Mem</th>
                  <th>Cmd</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredProcs.map((p) => (
                  <tr key={p.pid}>
                    <td>
                      <code>{p.pid}</code>
                    </td>
                    <td>{p.name}</td>
                    <td>{p.cpu.toFixed(1)}</td>
                    <td>{p.memMB} MB</td>
                    <td className="truncate" title={p.cmd}>
                      {p.cmd}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm danger ghost"
                        onClick={() => setConfirmKill(p)}
                      >
                        Kill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {showEvents ? (
      <section className="panel">
        <div className="panel-header">
          <h2>
            实时事件 ({filteredEvents.length}/{events.length}){" "}
            {paused ? (
              <Tag tone="warn">PAUSED</Tag>
            ) : sseConnected ? (
              <Tag tone="ok">LIVE</Tag>
            ) : (
              <Tag tone="warn">OFFLINE</Tag>
            )}
          </h2>
          <div className="row-gap">
            <div className="seg">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`seg-btn ${eventFilter === t ? "active" : ""}`}
                  onClick={() => setEventFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="checkbox compact">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              自动滚动
            </label>
            <button type="button" className="btn ghost sm" onClick={exportEvents}>
              导出 JSON
            </button>
          </div>
        </div>
        <p className="muted small" style={{ padding: "0 16px 8px" }}>
          来源：~/.pi-switch/logs/runtime.jsonl（由 pi-switch-usage 扩展写入）。
          <span style={{ marginLeft: 8 }}>
            <code>PI_SWITCH_EVENTS</code> 环境变量配置路径
          </span>
        </p>
        <div className="event-feed" ref={eventListRef}>
          {filteredEvents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">∅</div>
              <div className="empty-title">没有事件</div>
              <div className="empty-desc">
                让 pi 跑一会，或者安装 pi-switch-usage 扩展。
              </div>
            </div>
          ) : (
            filteredEvents.map((e, i) => (
              <details className="event-row" key={i}>
                <summary>
                  <span className="event-ts">{formatDate(e.ts)}</span>
                  <span className={`event-type type-${e.type}`}>{e.type}</span>
                  <span className="event-data">
                    {JSON.stringify(e.data || {}).slice(0, 200)}
                  </span>
                </summary>
                <pre className="event-detail">
                  {JSON.stringify(e.data || {}, null, 2)}
                </pre>
              </details>
            ))
          )}
        </div>
      </section>
      ) : null}

      <ConfirmDialog
        open={!!confirmKill}
        title="Kill 进程"
        danger
        confirmText="Kill"
        message={
          <>
            确定要 kill <code>{confirmKill?.name}</code>{" "}
            (<code>PID {confirmKill?.pid}</code>)?
            <br />
            <span className="muted small">进程会收到 SIGTERM（Windows 用 taskkill /f）。</span>
          </>
        }
        onCancel={() => setConfirmKill(null)}
        onConfirm={() => confirmKill && void kill(confirmKill)}
      />
    </div>
  );
}
