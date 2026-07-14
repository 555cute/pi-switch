import type {
  ModelInfo,
  PiSettings,
  ProviderConfig,
  ProvidersOverview,
  UpsertProviderInput,
} from "../src/types";
import { maskKey, readJson, writeJson } from "./fsutil";
import * as paths from "./paths";

function parseModel(v: any): ModelInfo | null {
  if (!v?.id) return null;
  return {
    id: String(v.id),
    name: v.name ?? null,
    api: v.api ?? null,
    reasoning: !!v.reasoning,
    input: Array.isArray(v.input) ? v.input.map(String) : null,
    contextWindow: typeof v.contextWindow === "number" ? v.contextWindow : null,
    maxTokens: typeof v.maxTokens === "number" ? v.maxTokens : null,
    cost: v.cost ?? null,
    compat: v.compat ?? null,
  };
}

function loadAuthMap(): Record<string, any> {
  const raw = readJson(paths.authJson()) as Record<string, any>;
  return raw && typeof raw === "object" ? raw : {};
}

function authPreviewFor(
  provider: string,
  auth: Record<string, any>,
  apiKey?: string | null,
): { hasAuth: boolean; authPreview?: string } {
  const entry = auth[provider];
  if (entry) {
    const key = entry?.key ?? (typeof entry === "string" ? entry : null);
    if (typeof key === "string") return { hasAuth: true, authPreview: maskKey(key) };
    return { hasAuth: true, authPreview: "(configured)" };
  }
  if (apiKey) return { hasAuth: true, authPreview: maskKey(apiKey) };
  return { hasAuth: false };
}

export function loadSettings(): PiSettings {
  const raw = readJson(paths.settingsJson()) as any;
  return {
    defaultProvider: raw?.defaultProvider ?? null,
    defaultModel: raw?.defaultModel ?? null,
    defaultThinkingLevel: raw?.defaultThinkingLevel ?? null,
    packages: Array.isArray(raw?.packages) ? raw.packages.map(String) : [],
    theme: raw?.theme ?? null,
  };
}

export function loadProvidersOverview(): ProvidersOverview {
  const modelsRoot = readJson(paths.modelsJson()) as any;
  const auth = loadAuthMap();
  const settings = loadSettings();
  const providers: ProviderConfig[] = [];

  const obj = modelsRoot?.providers ?? {};
  for (const [name, cfg] of Object.entries<any>(obj)) {
    const apiKey = typeof cfg?.apiKey === "string" ? cfg.apiKey : null;
    const { hasAuth, authPreview } = authPreviewFor(name, auth, apiKey);
    const models = Array.isArray(cfg?.models)
      ? (cfg.models.map(parseModel).filter(Boolean) as ModelInfo[])
      : [];

    providers.push({
      name,
      baseUrl: cfg?.baseUrl ?? null,
      api: cfg?.api ?? null,
      apiKey: apiKey
        ? apiKey.startsWith("$") || apiKey.startsWith("!")
          ? apiKey
          : maskKey(apiKey)
        : null,
      authHeader: typeof cfg?.authHeader === "boolean" ? cfg.authHeader : null,
      headers: cfg?.headers ?? null,
      compat: cfg?.compat ?? null,
      models,
      hasAuth,
      authPreview: authPreview ?? null,
    });
  }

  for (const [name, entry] of Object.entries(auth)) {
    if (providers.some((p) => p.name === name)) continue;
    const key = entry?.key ?? (typeof entry === "string" ? entry : null);
    providers.push({
      name,
      baseUrl: null,
      api: null,
      apiKey: null,
      authHeader: null,
      headers: null,
      compat: null,
      models: [],
      hasAuth: true,
      authPreview: typeof key === "string" ? maskKey(key) : "(configured)",
    });
  }

  providers.sort((a, b) => a.name.localeCompare(b.name));
  return {
    providers,
    settings,
    agentHome: paths.piAgentHome(),
  };
}

export function setAuthKey(provider: string, key: string): void {
  const root = (readJson(paths.authJson()) as any) || {};
  root[provider] = { type: "api_key", key };
  writeJson(paths.authJson(), root);
}

export function upsertProvider(input: UpsertProviderInput): ProvidersOverview {
  const name = input.name.trim();
  if (!name) throw new Error("provider name is required");

  const root = (readJson(paths.modelsJson()) as any) || {};
  if (!root.providers || typeof root.providers !== "object") root.providers = {};

  const existing = root.providers[name] ?? {};
  const providerObj: any = {};

  if (input.baseUrl?.trim()) providerObj.baseUrl = input.baseUrl.trim();
  if (input.api?.trim()) providerObj.api = input.api.trim();

  if (input.apiKey?.trim() && !input.apiKey.includes("…") && !input.apiKey.includes("...")) {
    providerObj.apiKey = input.apiKey.trim();
  } else if (existing.apiKey) {
    providerObj.apiKey = existing.apiKey;
  }

  if (typeof input.authHeader === "boolean") providerObj.authHeader = input.authHeader;
  if (input.headers) providerObj.headers = input.headers;
  if (input.compat) providerObj.compat = input.compat;

  providerObj.models = (input.models || [])
    .filter((m) => m.id?.trim())
    .map((m) => {
      const o: any = { id: m.id.trim() };
      if (m.name) o.name = m.name;
      if (m.api) o.api = m.api;
      if (m.reasoning) o.reasoning = true;
      if (m.input) o.input = m.input;
      if (m.contextWindow != null) o.contextWindow = m.contextWindow;
      if (m.maxTokens != null) o.maxTokens = m.maxTokens;
      if (m.cost) o.cost = m.cost;
      if (m.compat) o.compat = m.compat;
      return o;
    });

  root.providers[name] = providerObj;
  writeJson(paths.modelsJson(), root);

  if (
    input.authKey?.trim() &&
    !input.authKey.includes("…") &&
    !input.authKey.includes("...")
  ) {
    setAuthKey(name, input.authKey.trim());
  }

  return loadProvidersOverview();
}

export function deleteProvider(name: string): ProvidersOverview {
  const root = (readJson(paths.modelsJson()) as any) || {};
  if (root.providers) delete root.providers[name];
  writeJson(paths.modelsJson(), root);
  return loadProvidersOverview();
}

export function deleteAuthKey(provider: string): ProvidersOverview {
  const root = (readJson(paths.authJson()) as any) || {};
  delete root[provider];
  writeJson(paths.authJson(), root);
  return loadProvidersOverview();
}

export function setDefaultModel(provider: string, model: string): PiSettings {
  const root = (readJson(paths.settingsJson()) as any) || {};
  root.defaultProvider = provider;
  root.defaultModel = model;
  writeJson(paths.settingsJson(), root);
  return loadSettings();
}

export type ProviderProbeResult = {
  provider: string;
  ok: boolean;
  reachable: boolean;
  baseUrl: string | null;
  api: string | null;
  status: number | null;
  latencyMs: number;
  message: string;
  authUsed: boolean;
  authSource: "auth.json" | "models.json" | "none";
  endpoint: string | null;
  sample?: string | null;
};

function resolveSecret(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const k = raw.trim();
  if (!k) return null;
  if (k.startsWith("$")) {
    const envName = k.slice(1);
    const v = process.env[envName];
    return v && v.trim() ? v.trim() : null;
  }
  // !command refs are not executed during probe for safety
  if (k.startsWith("!")) return null;
  return k;
}

function pickAuth(
  provider: string,
  cfg: any,
): { key: string | null; source: ProviderProbeResult["authSource"] } {
  const auth = loadAuthMap();
  const entry = auth[provider];
  const authKey =
    typeof entry?.key === "string"
      ? entry.key
      : typeof entry === "string"
        ? entry
        : null;
  const fromAuth = resolveSecret(authKey);
  if (fromAuth) return { key: fromAuth, source: "auth.json" };

  const fromModels = resolveSecret(
    typeof cfg?.apiKey === "string" ? cfg.apiKey : null,
  );
  if (fromModels) return { key: fromModels, source: "models.json" };
  return { key: null, source: "none" };
}

function buildProbeRequest(
  baseUrl: string,
  api: string,
  key: string | null,
  authHeader: boolean,
): { url: string; headers: Record<string, string> } {
  const base = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "pi-switch-probe/0.1",
  };

  if (api.includes("anthropic")) {
    const url = /\/v\d+(\/|$)/.test(base) ? `${base}/models` : `${base}/v1/models`;
    if (key) {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    }
    return { url, headers };
  }

  if (api.includes("google")) {
    const url = key
      ? `${base}/models?key=${encodeURIComponent(key)}`
      : `${base}/models`;
    return { url, headers };
  }

  // openai-completions / openai-responses / generic OpenAI-compatible
  let url: string;
  if (base.endsWith("/models")) url = base;
  else if (/\/v\d+$/.test(base) || base.includes("/v1")) url = `${base}/models`;
  else url = `${base}/models`;

  if (key && authHeader !== false) {
    headers.Authorization = `Bearer ${key}`;
  } else if (key) {
    headers["x-api-key"] = key;
  }
  return { url, headers };
}

function extractSample(body: string): string | null {
  try {
    const json = JSON.parse(body);
    if (Array.isArray(json?.data) && json.data[0]?.id) return String(json.data[0].id);
    if (Array.isArray(json?.models) && json.models[0]?.name) return String(json.models[0].name);
    if (Array.isArray(json?.models) && json.models[0]?.id) return String(json.models[0].id);
    if (json?.id) return String(json.id);
  } catch {
    /* ignore */
  }
  return null;
}

export async function probeProvider(name: string): Promise<ProviderProbeResult> {
  const provider = name.trim();
  if (!provider) throw new Error("provider name is required");

  const modelsRoot = (readJson(paths.modelsJson()) as any) || {};
  const cfg = modelsRoot?.providers?.[provider];
  const baseUrl =
    typeof cfg?.baseUrl === "string" && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : null;
  const api =
    typeof cfg?.api === "string" && cfg.api.trim()
      ? cfg.api.trim()
      : "openai-completions";
  const authHeader = typeof cfg?.authHeader === "boolean" ? cfg.authHeader : true;
  const { key, source } = pickAuth(provider, cfg);

  if (!baseUrl) {
    return {
      provider,
      ok: false,
      reachable: false,
      baseUrl: null,
      api,
      status: null,
      latencyMs: 0,
      message: "未配置 baseUrl，无法探测",
      authUsed: false,
      authSource: source,
      endpoint: null,
      sample: null,
    };
  }

  const { url, headers } = buildProbeRequest(baseUrl, api, key, authHeader);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const t0 = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    const body = await res.text().catch(() => "");
    const sample = extractSample(body);
    const ok = res.status >= 200 && res.status < 300;

    let message: string;
    if (ok) message = sample ? `连通正常 · 示例模型 ${sample}` : "连通正常";
    else if (res.status === 401 || res.status === 403)
      message = `服务可达，但鉴权失败 (HTTP ${res.status})`;
    else if (res.status === 404)
      message = `服务可达，但探测路径不存在 (HTTP 404) · ${url}`;
    else message = `HTTP ${res.status}${body ? ` · ${body.slice(0, 120)}` : ""}`;

    return {
      provider,
      ok,
      reachable: true,
      baseUrl,
      api,
      status: res.status,
      latencyMs,
      message,
      authUsed: !!key,
      authSource: source,
      endpoint: url,
      sample,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      provider,
      ok: false,
      reachable: false,
      baseUrl,
      api,
      status: null,
      latencyMs,
      message: aborted
        ? "请求超时（10s）"
        : `网络错误: ${err instanceof Error ? err.message : String(err)}`,
      authUsed: !!key,
      authSource: source,
      endpoint: url,
      sample: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
