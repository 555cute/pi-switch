import { useEffect, useMemo, useState } from "react";
import {
  clearPackageOverrides as storeClearOverrides,
  ensurePackages,
  ensurePackagesDetail,
  installPackage as storeInstallPackage,
  removePackage as storeRemovePackage,
  setPackageOverrides as storeSetOverrides,
  updatePackage as storeUpdatePackage,
  useCache,
} from "../../store";
import { ConfirmDialog } from "../../components/Modal";
import { Drawer } from "../../components/Drawer";
import { Skeleton, Tag } from "../../components/UI";
import { toast } from "../../components/Toast";
import type { PackageDetail } from "../../types";

type Filter = "all" | "with-ext" | "with-skills" | "overridden";

export function Packages() {
  const cache = useCache();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installSource, setInstallSource] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastLog, setLastLog] = useState("");

  useEffect(() => {
    ensurePackages();
    ensurePackagesDetail();
  }, []);

  const basic = cache.packages;
  const detail = cache.packagesDetail;
  const merged: PackageDetail[] = useMemo(() => {
    if (detail && detail.length) return detail;
    return (basic?.packages || []).map(
      (p) =>
        ({
          spec: p.spec,
          name: p.name || p.spec,
          version: p.version,
          installedPath: p.installedPath || "",
          description: p.description,
          extensions: [],
          skills: p.skillNames.map((n) => ({
            name: n,
            path: "",
            enabled: true,
          })),
          commands: [],
          hasOverrides: false,
        }) as PackageDetail,
    );
  }, [detail, basic]);

  const filtered = useMemo(() => {
    const ql = search.trim().toLowerCase();
    return merged.filter((p) => {
      if (ql && !p.name.toLowerCase().includes(ql) && !p.spec.toLowerCase().includes(ql))
        return false;
      if (filter === "with-ext" && p.extensions.length === 0) return false;
      if (filter === "with-skills" && p.skills.length === 0) return false;
      if (filter === "overridden" && !p.hasOverrides) return false;
      return true;
    });
  }, [merged, search, filter]);

  const current = merged.find((p) => p.spec === selected) || filtered[0] || null;

  const setDisabled = async (disabled: boolean) => {
    if (!current) return;
    setSaving(true);
    try {
      await storeSetOverrides(current.spec, { disabled });
      toast(disabled ? `已禁用「${current.name}」` : `已启用「${current.name}」`, "ok");
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (
    kind: "extensions" | "skills" | "commands",
    name: string,
    enabled: boolean,
  ) => {
    if (!current) return;
    setSaving(true);
    try {
      const list = current[kind].filter((i) => i.enabled).map((i) => i.name);
      const next = enabled
        ? Array.from(new Set([...list, name]))
        : list.filter((n) => n !== name);
      await storeSetOverrides(current.spec, { [kind]: next });
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setSaving(false);
    }
  };

  const clearOverrides = async () => {
    if (!confirmClear) return;
    try {
      await storeClearOverrides(confirmClear);
      toast("已清除覆盖", "ok");
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setConfirmClear(null);
    }
  };

  const doInstall = async () => {
    const src = installSource.trim();
    if (!src) {
      toast("请输入包源", "err");
      return;
    }
    setBusyAction("install");
    setLastLog("");
    try {
      const r = await storeInstallPackage(src);
      setLastLog([r.command, r.stdout, r.stderr].filter(Boolean).join("\n"));
      toast(r.ok ? `已安装 ${r.spec}` : `安装失败: ${r.message}`, r.ok ? "ok" : "err");
      if (r.ok) {
        setInstallOpen(false);
        setInstallSource("");
        setSelected(r.spec);
      }
    } catch (e) {
      toast("安装失败: " + e, "err");
      setLastLog(String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const doRemove = async () => {
    if (!confirmRemove) return;
    setBusyAction("remove:" + confirmRemove);
    setLastLog("");
    try {
      const r = await storeRemovePackage(confirmRemove);
      setLastLog([r.command, r.stdout, r.stderr].filter(Boolean).join("\n"));
      toast(r.ok ? `已移除 ${r.spec}` : `移除失败: ${r.message}`, r.ok ? "ok" : "err");
      if (r.ok && selected === confirmRemove) setSelected(null);
    } catch (e) {
      toast("移除失败: " + e, "err");
      setLastLog(String(e));
    } finally {
      setBusyAction(null);
      setConfirmRemove(null);
    }
  };

  const doUpdate = async (spec?: string) => {
    setBusyAction(spec ? "update:" + spec : "update-all");
    setLastLog("");
    try {
      const r = await storeUpdatePackage(spec);
      setLastLog([r.command, r.stdout, r.stderr].filter(Boolean).join("\n"));
      toast(r.ok ? "更新完成" : `更新失败: ${r.message}`, r.ok ? "ok" : "err");
    } catch (e) {
      toast("更新失败: " + e, "err");
      setLastLog(String(e));
    } finally {
      setBusyAction(null);
    }
  };

  if (!basic && !merged.length) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>
              扩展包 <span className="en">Extensions</span>
            </h1>
            <p className="muted page-kicker">加载中…</p>
          </div>
        </header>
        <div className="packages-layout">
          <section className="panel list-panel">
            <div style={{ padding: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <Skeleton width="100%" height={48} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            扩展包 <span className="en">Extensions</span>
          </h1>
          <p className="muted page-kicker">
            来自 <code>settings.json</code> packages[] · npm root{" "}
            <code>{basic?.npmRoot || ""}</code>
            {merged.filter((p) => p.hasOverrides).length > 0 ? (
              <Tag tone="warn" style={{ marginLeft: 8 }}>
                {merged.filter((p) => p.hasOverrides).length} overridden
              </Tag>
            ) : null}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn sm"
            disabled={!!busyAction}
            onClick={() => void doUpdate()}
          >
            {busyAction === "update-all" ? "更新中…" : "更新全部"}
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              ensurePackages(true);
              ensurePackagesDetail(true);
            }}
          >
            刷新
          </button>
          <button
            type="button"
            className="btn primary sm"
            onClick={() => setInstallOpen(true)}
          >
            + 安装
          </button>
        </div>
      </header>

      {lastLog && !installOpen ? (
        <div
          className="panel"
          style={{ marginBottom: 12, padding: "10px 12px" }}
        >
          <div className="panel-header" style={{ padding: 0, marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 13 }}>最近 CLI 输出</h3>
            <button
              type="button"
              className="btn xs ghost"
              onClick={() => setLastLog("")}
            >
              清除
            </button>
          </div>
          <pre
            className="muted small"
            style={{
              margin: 0,
              maxHeight: 120,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {lastLog}
          </pre>
        </div>
      ) : null}

      <div className="packages-layout">
        <section className="panel list-panel">
          <div className="panel-header">
            <h2>已安装 ({filtered.length})</h2>
          </div>
          <div className="panel-header" style={{ paddingTop: 0, borderTop: "none" }}>
            <input
              className="input sm"
              placeholder="搜索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="source-tabs" style={{ paddingLeft: 0 }}>
            {(
              [
                { id: "all", label: "全部" },
                { id: "with-ext", label: "有 ext" },
                { id: "with-skills", label: "有 skills" },
                { id: "overridden", label: "已覆盖" },
              ] as { id: Filter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`source-tab ${filter === f.id ? "active" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="provider-list">
            {filtered.map((p) => {
              const ext = p.extensions.length;
              const skl = p.skills.length;
              const cmd = p.commands.length;
              return (
                <div
                  key={p.spec}
                  className={`provider-item ${current && current.spec === p.spec ? "active" : ""}`}
                  onClick={() => setSelected(p.spec)}
                >
                  <div className="provider-item-top">
                    <span className="provider-name">
                      {p.name}
                      {p.hasOverrides ? (
                        <Tag tone="warn">覆盖</Tag>
                      ) : (
                        <Tag tone="ok">默认</Tag>
                      )}
                    </span>
                  </div>
                  <div className="provider-meta">{p.version || "?"}</div>
                  <div className="provider-models">
                    {ext > 0 ? <span className="chip">{ext} ext</span> : null}
                    {skl > 0 ? <span className="chip">{skl} skills</span> : null}
                    {cmd > 0 ? <span className="chip">{cmd} cmd</span> : null}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <div className="empty-inline">没有匹配的包</div>
            ) : null}
          </div>
        </section>

        <section className="panel form-panel">
          {!current ? (
            <div className="empty-state-large">
              <div className="empty-icon">⧉</div>
              <div className="empty-title">选一个包</div>
              <div className="empty-desc">左边选一个扩展包查看详情，或点 + 安装新包。</div>
              <button
                type="button"
                className="btn primary sm"
                style={{ marginTop: 12 }}
                onClick={() => setInstallOpen(true)}
              >
                + 安装扩展包
              </button>
            </div>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <h2>{current.name}</h2>
                  <p className="muted small">
                    {current.spec} · {current.version || "?"}
                    {current.hasOverrides ? (
                      <Tag tone="warn" style={{ marginLeft: 8 }}>
                        已被 pi-switch 覆盖
                      </Tag>
                    ) : null}
                  </p>
                </div>
                <div className="row-gap">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      const path = current.installedPath;
                      if (path) window.piSwitchDesktop?.openPath?.(path);
                    }}
                    disabled={!current.installedPath}
                  >
                    打开目录
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!!busyAction}
                    onClick={() => void doUpdate(current.spec)}
                  >
                    {busyAction === "update:" + current.spec ? "更新中…" : "更新"}
                  </button>
                  {current.hasOverrides ? (
                    <button
                      type="button"
                      className="btn sm ghost danger"
                      onClick={() => setConfirmClear(current.spec)}
                      disabled={saving}
                    >
                      清除覆盖
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn sm ghost danger"
                    disabled={!!busyAction}
                    onClick={() => setConfirmRemove(current.spec)}
                  >
                    卸载
                  </button>
                </div>
              </div>

              {current.description ? (
                <p className="muted" style={{ margin: "4px 0 12px" }}>
                  {current.description}
                </p>
              ) : null}

              <label className="checkbox big">
                <input
                  type="checkbox"
                  checked={!current.hasOverrides}
                  onChange={(e) => void setDisabled(!e.target.checked)}
                  disabled={saving}
                />
                <span>
                  <strong>启用此包</strong>
                  <span className="muted small" style={{ display: "block" }}>
                    关闭后 pi 不会加载（通过 pi-switch 覆盖层）
                  </span>
                </span>
              </label>

              <h3 className="section-h">
                Extensions (
                {current.extensions.filter((e) => e.enabled).length}/
                {current.extensions.length})
              </h3>
              {current.extensions.length === 0 ? (
                <div className="empty-inline">无 extension</div>
              ) : (
                <div className="toggle-grid">
                  {current.extensions.map((e) => (
                    <label className="toggle-row" key={e.path}>
                      <input
                        type="checkbox"
                        checked={e.enabled}
                        onChange={(ev) =>
                          void toggleItem("extensions", e.name, ev.target.checked)
                        }
                        disabled={saving}
                      />
                      <span className="toggle-name">
                        {e.name}
                        <code className="toggle-path">
                          {e.path.replace(current.installedPath, "…")}
                        </code>
                      </span>
                      <button
                        type="button"
                        className="btn xs ghost"
                        onClick={(ev) => {
                          ev.preventDefault();
                          window.piSwitchDesktop?.openPath?.(e.path);
                        }}
                        title="在文件管理器打开"
                      >
                        ▢
                      </button>
                    </label>
                  ))}
                </div>
              )}

              <h3 className="section-h">
                Skills ({current.skills.filter((s) => s.enabled).length}/
                {current.skills.length})
              </h3>
              {current.skills.length === 0 ? (
                <div className="empty-inline">无 skill</div>
              ) : (
                <div className="toggle-grid">
                  {current.skills.map((s) => (
                    <label className="toggle-row" key={s.path || s.name}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(ev) =>
                          void toggleItem("skills", s.name, ev.target.checked)
                        }
                        disabled={saving}
                      />
                      <span className="toggle-name">
                        {s.name}
                        <code className="toggle-path">
                          {s.path
                            ? s.path.replace(current.installedPath, "…")
                            : "(session history)"}
                        </code>
                      </span>
                      {s.path ? (
                        <button
                          type="button"
                          className="btn xs ghost"
                          onClick={(ev) => {
                            ev.preventDefault();
                            window.piSwitchDesktop?.openPath?.(s.path);
                          }}
                        >
                          ▢
                        </button>
                      ) : (
                        <span />
                      )}
                    </label>
                  ))}
                </div>
              )}

              {current.commands.length > 0 ? (
                <>
                  <h3 className="section-h">
                    Commands (
                    {current.commands.filter((c) => c.enabled).length}/
                    {current.commands.length})
                  </h3>
                  <div className="toggle-grid">
                    {current.commands.map((c) => (
                      <label className="toggle-row" key={c.path || c.name}>
                        <input
                          type="checkbox"
                          checked={c.enabled}
                          onChange={(ev) =>
                            void toggleItem("commands", c.name, ev.target.checked)
                          }
                          disabled={saving}
                        />
                        <span className="toggle-name">
                          {c.name}
                          <code className="toggle-path">
                            {c.path.replace(current.installedPath, "…")}
                          </code>
                        </span>
                        <button
                          type="button"
                          className="btn xs ghost"
                          onClick={(ev) => {
                            ev.preventDefault();
                            window.piSwitchDesktop?.openPath?.(c.path);
                          }}
                        >
                          ▢
                        </button>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirmClear}
        title="清除覆盖"
        danger
        confirmText="清除"
        message={
          <>
            清除「<strong>{confirmClear}</strong>」的所有 pi-switch 覆盖？
            <br />
            <span className="muted small">将恢复使用 pi 原始配置。</span>
          </>
        }
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => void clearOverrides()}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title="卸载扩展包"
        danger
        confirmText={busyAction?.startsWith("remove:") ? "卸载中…" : "卸载"}
        message={
          <>
            确定运行 <code>pi remove {confirmRemove}</code>？
            <br />
            <span className="muted small">
              会从 settings.json packages[] 移除，并尝试清理安装目录。
            </span>
          </>
        }
        onCancel={() => {
          if (!busyAction) setConfirmRemove(null);
        }}
        onConfirm={() => void doRemove()}
      />

      <Drawer
        open={installOpen}
        onClose={() => {
          if (!busyAction) setInstallOpen(false);
        }}
        title="安装扩展包"
        width={480}
      >
        <p className="muted small" style={{ marginBottom: 12 }}>
          调用本机 <code>pi install</code>。支持 npm / git / 本地路径。
        </p>
        <label className="full" style={{ display: "block", marginBottom: 12 }}>
          包源
          <input
            className="input"
            value={installSource}
            onChange={(e) => setInstallSource(e.target.value)}
            placeholder="npm:@scope/pkg  或  git:github.com/user/repo"
            disabled={!!busyAction}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doInstall();
            }}
          />
        </label>
        <div
          className="chip-row"
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}
        >
          {(
            [
              "npm:@juicesharp/rpiv-web-tools",
              "npm:gentle-engram",
              "npm:pi-powerline-footer",
            ] as string[]
          ).map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => setInstallSource(ex)}
              disabled={!!busyAction}
            >
              {ex}
            </button>
          ))}
        </div>
        {lastLog ? (
          <pre
            className="muted small"
            style={{
              maxHeight: 160,
              overflow: "auto",
              background: "var(--bg-panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 10,
              whiteSpace: "pre-wrap",
              marginBottom: 12,
            }}
          >
            {lastLog}
          </pre>
        ) : null}
        <div className="form-actions">
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn ghost sm"
            disabled={!!busyAction}
            onClick={() => setInstallOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            className="btn primary sm"
            disabled={!!busyAction || !installSource.trim()}
            onClick={() => void doInstall()}
          >
            {busyAction === "install" ? "安装中…" : "安装"}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          第三方包拥有完整系统权限，安装前请审查来源。
        </p>
      </Drawer>
    </div>
  );
}
