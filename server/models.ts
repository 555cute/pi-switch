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
