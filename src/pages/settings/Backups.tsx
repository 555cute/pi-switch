import { useEffect, useState } from "react";
import { useCache } from "../../store";
import { api } from "../../api";
import { ConfirmDialog } from "../../components/Modal";
import { Drawer } from "../../components/Drawer";
import { Skeleton } from "../../components/UI";
import { toast } from "../../components/Toast";
import type { BackupFile } from "../../types";
import { formatDate } from "../../utils";

export function Backups() {
  const cache = useCache();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BackupFile | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupFile | null>(null);
  const [detail, setDetail] = useState<BackupFile | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setBackups(await api.listBackups());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await api.createBackup(label || "manual");
      toast(`已创建「${b.name}」`, "ok");
      setLabel("");
      await load();
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b: BackupFile) => {
    setBusy(true);
    try {
      const r = await api.restoreBackup(b.name);
      toast(`已恢复：${r.restored.join(", ")}`, "ok");
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setBusy(false);
      setConfirmRestore(null);
    }
  };

  const remove = async (b: BackupFile) => {
    setBusy(true);
    try {
      await api.deleteBackup(b.name);
      toast("已删除", "ok");
      await load();
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  const openFolder = () => {
    if (cache.agentHome) {
      // best effort: derive backup dir from agentHome parent
      window.piSwitchDesktop?.openPath?.(cache.agentHome + "\\..\\pi-switch\\backups");
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            备份 <span className="en">Backups</span>
          </h1>
        </div>
        <div className="header-actions">
          <input
            className="input sm"
            placeholder="标签（可选）"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="button"
            className="btn primary sm"
            onClick={() => void create()}
            disabled={busy}
          >
            + 新建备份
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">⚠ {error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>历史备份 ({backups.length})</h2>
          <button type="button" className="btn ghost sm" onClick={openFolder}>
            打开备份目录
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 16 }}>
            <Skeleton width="100%" height={32} />
            <div style={{ height: 6 }} />
            <Skeleton width="100%" height={32} />
            <div style={{ height: 6 }} />
            <Skeleton width="100%" height={32} />
          </div>
        ) : backups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◉</div>
            <div className="empty-title">还没有备份</div>
            <div className="empty-desc">
              在动 models.json / auth.json 之前先建一个。
            </div>
            <div className="empty-action">
              <button
                type="button"
                className="btn primary sm"
                onClick={() => void create()}
              >
                + 立即创建
              </button>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>创建时间</th>
                  <th>文件</th>
                  <th>大小</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setDetail(b)}
                      >
                        <code>{b.name}</code>
                      </button>
                    </td>
                    <td>{formatDate(b.createdAt)}</td>
                    <td className="muted small">{b.files.join(", ")}</td>
                    <td>{(b.size / 1024).toFixed(1)} KB</td>
                    <td>
                      <div className="row-gap">
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setConfirmRestore(b)}
                          disabled={busy}
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost danger"
                          onClick={() => setConfirmDelete(b)}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        width={520}
      >
        {detail ? (
          <div>
            <table className="kv">
              <tbody>
                <tr>
                  <td>创建时间</td>
                  <td>{formatDate(detail.createdAt)}</td>
                </tr>
                <tr>
                  <td>大小</td>
                  <td>{(detail.size / 1024).toFixed(2)} KB</td>
                </tr>
                <tr>
                  <td>文件数</td>
                  <td>{detail.files.length}</td>
                </tr>
                <tr>
                  <td>路径</td>
                  <td>
                    <code style={{ wordBreak: "break-all" }}>{detail.path}</code>
                  </td>
                </tr>
              </tbody>
            </table>
            <h3 style={{ marginTop: 16 }}>包含文件</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {detail.files.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
            <div className="row-gap" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => window.piSwitchDesktop?.openPath?.(detail.path)}
              >
                打开目录
              </button>
              <button
                type="button"
                className="btn ghost sm danger"
                onClick={() => {
                  setConfirmDelete(detail);
                  setDetail(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={!!confirmRestore}
        title="恢复备份"
        danger
        confirmText="覆盖并恢复"
        message={
          <>
            从「<strong>{confirmRestore?.name}</strong>」恢复？
            <br />
            <span className="muted small">
              将覆盖当前 {confirmRestore?.files.join(", ")} 的内容。建议先做一次当前配置的备份。
            </span>
          </>
        }
        onCancel={() => setConfirmRestore(null)}
        onConfirm={() => confirmRestore && void restore(confirmRestore)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除备份"
        danger
        confirmText="删除"
        message={
          <>
            确定要删除「<strong>{confirmDelete?.name}</strong>」？<br />
            <span className="muted small">无法恢复。</span>
          </>
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
      />
    </div>
  );
}
