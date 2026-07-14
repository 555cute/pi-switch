import { useEffect, useMemo, useState } from "react";
import {
  ensureProviders,
  removeAuth as storeRemoveAuth,
  removeProvider as storeRemoveProvider,
  saveProvider as storeSaveProvider,
  switchDefaultModel,
  useCache,
} from "../../store";
import { api } from "../../api";
import { ConfirmDialog } from "../../components/Modal";
import { Drawer } from "../../components/Drawer";
import { Skeleton, Tag } from "../../components/UI";
import { toast } from "../../components/Toast";
import type { ModelInfo, ProviderProbeResult, UpsertProviderInput } from "../../types";
import { API_TYPES } from "../../utils";

const emptyForm = (): UpsertProviderInput => ({
  name: "",
  baseUrl: "",
  api: "openai-completions",
  apiKey: "",
  authKey: "",
  authHeader: true,
  models: [{ id: "" }],
});

export function Providers() {
  const cache = useCache();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UpsertProviderInput>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showOnlyNoAuth, setShowOnlyNoAuth] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClearAuth, setConfirmClearAuth] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"create" | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, ProviderProbeResult>>({});
  const [batchProbing, setBatchProbing] = useState(false);

  useEffect(() => {
    ensureProviders();
  }, []);

  const data = cache.providers;
  const defaults = data?.settings;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    let list = data.providers;
    if (showOnlyNoAuth) list = list.filter((p) => !p.hasAuth);
    if (q)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.models.some(
            (m) =>
              m.id.toLowerCase().includes(q) ||
              (m.name ?? "").toLowerCase().includes(q),
          ),
      );
    return list;
  }, [data, filter, showOnlyNoAuth]);

  if (!data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <h1>供应商 <span className="en">Providers</span></h1>
            <p className="muted page-kicker">加载中…</p>
          </div>
        </header>
        <div className="providers-layout">
          <section className="panel list-panel">
            <div style={{ padding: 16 }}>
              {[0, 1, 2, 3].map((i) => (
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

  const startEdit = (name: string) => {
    const p = data.providers.find((x) => x.name === name);
    if (!p) return;
    setEditing(name);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl ?? "",
      api: p.api ?? "openai-completions",
      apiKey: "",
      authKey: "",
      authHeader: p.authHeader ?? true,
      models: p.models.length ? p.models.map((m) => ({ ...m })) : [{ id: "" }],
    });
    setDrawer("create");
  };

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDrawer("create");
  };

  const updateModel = (idx: number, patch: Partial<ModelInfo>) => {
    setForm((f) => {
      const models = [...f.models];
      models[idx] = { ...models[idx], ...patch };
      return { ...f, models };
    });
  };

  const moveModel = (idx: number, dir: -1 | 1) => {
    setForm((f) => {
      const models = [...f.models];
      const target = idx + dir;
      if (target < 0 || target >= models.length) return f;
      [models[idx], models[target]] = [models[target], models[idx]];
      return { ...f, models };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: UpsertProviderInput = {
        ...form,
        name: form.name.trim(),
        models: form.models
          .map((m) => ({ ...m, id: m.id.trim() }))
          .filter((m) => m.id.length > 0),
        apiKey: form.apiKey?.trim() || undefined,
        authKey: form.authKey?.trim() || undefined,
        baseUrl: form.baseUrl?.trim() || undefined,
        api: form.api?.trim() || undefined,
      };
      if (!payload.name) throw new Error("Name required");
      await storeSaveProvider(payload);
      toast(`已保存「${payload.name}」`, "ok");
      setEditing(payload.name);
      setDrawer(null);
    } catch (e) {
      toast("保存失败: " + e, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name: string) => {
    setSaving(true);
    try {
      await storeRemoveProvider(name);
      if (editing === name) {
        setEditing(null);
        setForm(emptyForm());
        setDrawer(null);
      }
      toast(`已删除「${name}」`, "ok");
    } catch (e) {
      toast("删除失败: " + e, "err");
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  };

  const removeAuthFor = async (provider: string) => {
    try {
      await storeRemoveAuth(provider);
      toast(`已清除「${provider}」的 auth key`, "ok");
    } catch (e) {
      toast("失败: " + e, "err");
    } finally {
      setConfirmClearAuth(null);
    }
  };

  const setDefault = async (provider: string, model: string) => {
    try {
      await switchDefaultModel(provider, model);
      toast(`默认 → ${provider}/${model}`, "ok");
    } catch (e) {
      toast("失败: " + e, "err");
    }
  };

  const probeOne = async (name: string, silent = false) => {
    setProbing(name);
    try {
      const r = await api.probeProvider(name);
      setProbeResults((prev) => ({ ...prev, [name]: r }));
      if (!silent) {
        toast(
          r.ok
            ? `「${name}」连通 · ${r.latencyMs}ms`
            : `「${name}」${r.message}`,
          r.ok ? "ok" : r.reachable ? "info" : "err",
        );
      }
      return r;
    } catch (e) {
      if (!silent) toast(`探测失败: ${e}`, "err");
      return null;
    } finally {
      setProbing((cur) => (cur === name ? null : cur));
    }
  };

  const probeAll = async () => {
    if (!data?.providers.length) return;
    setBatchProbing(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of data.providers) {
        const r = await probeOne(p.name, true);
        if (r?.ok) ok += 1;
        else fail += 1;
      }
      toast(`探测完成：${ok} 正常 · ${fail} 异常`, fail ? "info" : "ok");
    } finally {
      setBatchProbing(false);
      setProbing(null);
    }
  };

  const noAuthCount = data.providers.filter((p) => !p.hasAuth).length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>
            供应商 <span className="en">Providers</span>
          </h1>
          <p className="muted page-kicker">
            管理 <code>models.json</code> + <code>auth.json</code> · 默认：
            <strong>
              {defaults?.defaultProvider ?? "—"}/{defaults?.defaultModel ?? "—"}
            </strong>
            {noAuthCount > 0 ? (
              <Tag tone="warn" style={{ marginLeft: 8 }}>
                {noAuthCount} 个无 auth
              </Tag>
            ) : null}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn sm"
            disabled={batchProbing || data.providers.length === 0}
            onClick={() => void probeAll()}
          >
            {batchProbing ? "探测中…" : "全部探测"}
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => ensureProviders(true)}
          >
            刷新
          </button>
          <button type="button" className="btn primary sm" onClick={startCreate}>
            + 新建
          </button>
        </div>
      </header>

      <div className="providers-layout">
        <section className="panel list-panel">
          <div className="panel-header">
            <h2>已配置 ({filtered.length})</h2>
            <div className="row-gap">
              <input
                className="input sm"
                placeholder="过滤…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <label className="checkbox compact">
                <input
                  type="checkbox"
                  checked={showOnlyNoAuth}
                  onChange={(e) => setShowOnlyNoAuth(e.target.checked)}
                />
                无 auth
              </label>
            </div>
          </div>
          <div className="provider-list">
            {filtered.map((p) => {
              const isDefault = defaults?.defaultProvider === p.name;
              const probe = probeResults[p.name];
              return (
                <div
                  key={p.name}
                  className={`provider-item ${editing === p.name ? "active" : ""}`}
                  onClick={() => startEdit(p.name)}
                >
                  <div className="provider-item-top">
                    <span className="provider-name">
                      {p.name}
                      {isDefault ? <Tag tone="info">默认</Tag> : null}
                    </span>
                    <span className="row-gap" style={{ gap: 6 }}>
                      <span className={`pill ${p.hasAuth ? "ok" : "warn"}`}>
                        {p.hasAuth ? "auth" : "no key"}
                      </span>
                      {probe ? (
                        <span
                          className={`pill ${probe.ok ? "ok" : probe.reachable ? "warn" : "warn"}`}
                          title={probe.message}
                        >
                          {probe.ok ? `${probe.latencyMs}ms` : "fail"}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="btn xs ghost"
                        disabled={probing === p.name || batchProbing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void probeOne(p.name);
                        }}
                      >
                        {probing === p.name ? "…" : "测"}
                      </button>
                    </span>
                  </div>
                  <div className="provider-meta">
                    {p.api ?? "api?"} · {p.models.length} models
                    {probe ? ` · ${probe.message}` : ""}
                  </div>
                  <div className="provider-models">
                    {p.models.slice(0, 4).map((m) => (
                      <span className="chip" key={m.id}>
                        {m.id}
                      </span>
                    ))}
                    {p.models.length > 4 ? (
                      <span className="chip muted">+{p.models.length - 4}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <div className="empty-inline">
                {showOnlyNoAuth ? "都认证了 ✓" : "还没有供应商。点 + 新建。"}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel form-panel">
          <div className="empty-state-large">
            <div className="empty-icon">☁</div>
            <div className="empty-title">选择或新建供应商</div>
            <div className="empty-desc">
              左边点击一个供应商可查看/编辑详情，或点右上「+ 新建」创建一个。
            </div>
            <div className="row-gap" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary sm" onClick={startCreate}>
                + 新建供应商
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => cache.agentHome && window.piSwitchDesktop?.openPath?.(cache.agentHome)}
              >
                打开 models.json 目录
              </button>
            </div>
          </div>
        </section>
      </div>

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={editing ? `编辑「${editing}」` : "新建供应商"}
        width={520}
      >
        <div className="form-grid">
          <label>
            Name
            <input
              className="input"
              value={form.name}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-proxy"
            />
          </label>
          <label>
            API type
            <select
              className="input"
              value={form.api ?? ""}
              onChange={(e) => setForm({ ...form, api: e.target.value })}
            >
              {API_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            Base URL
            <input
              className="input"
              value={form.baseUrl ?? ""}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="full">
            models.json apiKey <span className="muted">(留空保留已有)</span>
            <input
              className="input"
              value={form.apiKey ?? ""}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-… or $ENV or !cmd"
            />
          </label>
          <label className="full">
            auth.json key <span className="muted">(推荐用于密钥)</span>
            <input
              className="input"
              value={form.authKey ?? ""}
              onChange={(e) => setForm({ ...form, authKey: e.target.value })}
              placeholder="sk-… or $MY_KEY"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!form.authHeader}
              onChange={(e) => setForm({ ...form, authHeader: e.target.checked })}
            />
            发送 Authorization: Bearer
          </label>
        </div>

        <div className="models-editor">
          <div className="panel-header">
            <h3>模型 ({form.models.length})</h3>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() =>
                setForm((f) => ({ ...f, models: [...f.models, { id: "" }] }))
              }
            >
              + 模型
            </button>
          </div>
          {form.models.map((m, idx) => (
            <div className="model-row" key={idx}>
              <input
                className="input"
                placeholder="model id"
                value={m.id}
                onChange={(e) => updateModel(idx, { id: e.target.value })}
              />
              <input
                className="input"
                placeholder="display name"
                value={m.name ?? ""}
                onChange={(e) => updateModel(idx, { name: e.target.value })}
              />
              <label className="checkbox compact">
                <input
                  type="checkbox"
                  checked={!!m.reasoning}
                  onChange={(e) => updateModel(idx, { reasoning: e.target.checked })}
                />
                reasoning
              </label>
              <div className="row-gap">
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => moveModel(idx, -1)}
                  disabled={idx === 0}
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn xs ghost"
                  onClick={() => moveModel(idx, 1)}
                  disabled={idx === form.models.length - 1}
                  aria-label="下移"
                >
                  ↓
                </button>
                {editing && m.id ? (
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => void setDefault(form.name, m.id)}
                  >
                    设为默认
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn xs ghost danger"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      models: f.models.filter((_, i) => i !== idx),
                    }))
                  }
                  aria-label="删除模型"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {editing && probeResults[editing] ? (
          <div className="probe-result" style={{ marginTop: 12 }}>
            <div className="panel-header" style={{ padding: 0, marginBottom: 8 }}>
              <h3>连通性</h3>
              <Tag
                tone={
                  probeResults[editing].ok
                    ? "ok"
                    : probeResults[editing].reachable
                      ? "warn"
                      : "danger"
                }
              >
                {probeResults[editing].ok
                  ? "OK"
                  : probeResults[editing].reachable
                    ? "AUTH?"
                    : "DOWN"}
              </Tag>
            </div>
            <div className="muted small" style={{ lineHeight: 1.5 }}>
              <div>{probeResults[editing].message}</div>
              <div>
                {probeResults[editing].latencyMs}ms · auth:{" "}
                {probeResults[editing].authSource}
                {probeResults[editing].status != null
                  ? ` · HTTP ${probeResults[editing].status}`
                  : ""}
              </div>
              {probeResults[editing].endpoint ? (
                <div className="truncate" title={probeResults[editing].endpoint || ""}>
                  {probeResults[editing].endpoint}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="form-actions" style={{ marginTop: 16 }}>
          {editing ? (
            <>
              <button
                type="button"
                className="btn ghost sm"
                disabled={probing === editing || batchProbing}
                onClick={() => void probeOne(editing)}
              >
                {probing === editing ? "探测中…" : "测试连通"}
              </button>
              <button
                type="button"
                className="btn ghost sm danger"
                onClick={() => setConfirmClearAuth(editing)}
              >
                清 auth key
              </button>
              <button
                type="button"
                className="btn ghost sm danger"
                onClick={() => setConfirmDelete(editing)}
              >
                删除 provider
              </button>
            </>
          ) : null}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setDrawer(null)}
          >
            取消
          </button>
          <button
            type="button"
            className="btn primary sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除供应商"
        danger
        confirmText="删除"
        message={
          <>
            确定要从 <code>models.json</code> 删除 <strong>「{confirmDelete}」</strong>？
            <br />
            <span className="muted small">相关 auth 不会自动删除。</span>
          </>
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
      />

      <ConfirmDialog
        open={!!confirmClearAuth}
        title="清除 auth key"
        danger
        confirmText="清除"
        message={
          <>
            确定要从 <code>auth.json</code> 删除 <strong>「{confirmClearAuth}」</strong> 的 key？
          </>
        }
        onCancel={() => setConfirmClearAuth(null)}
        onConfirm={() => confirmClearAuth && void removeAuthFor(confirmClearAuth)}
      />
    </div>
  );
}
