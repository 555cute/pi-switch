import type {
  AppSettings,
  BackupFile,
  DashboardStats,
  PackageDetail,
  PackagesOverview,
  PiProcessInfo,
  PiSettings,
  ProviderProbeResult,
  ProvidersOverview,
  RuntimeEvent,
  SkillsOverview,
  UpsertProviderInput,
  UsageOverview,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardStats>("/api/dashboard"),
  getProviders: () => request<ProvidersOverview>("/api/providers"),
  saveProvider: (input: UpsertProviderInput) =>
    request<ProvidersOverview>("/api/providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removeProvider: (name: string) =>
    request<ProvidersOverview>("/api/providers/delete", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  removeAuth: (provider: string) =>
    request<ProvidersOverview>("/api/auth/delete", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  switchDefaultModel: (provider: string, model: string) =>
    request<PiSettings>("/api/default-model", {
      method: "POST",
      body: JSON.stringify({ provider, model }),
    }),
  probeProvider: (name: string) =>
    request<ProviderProbeResult>("/api/providers/probe", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getSettings: () => request<PiSettings>("/api/settings"),
  getUsage: () => request<UsageOverview>("/api/usage"),
  getSkills: () => request<SkillsOverview>("/api/skills"),
  getPackages: () => request<PackagesOverview>("/api/packages"),
  getAgentHome: async () => {
    const r = await request<{ path: string }>("/api/agent-home");
    return r.path;
  },
  ensureExtensionLog: async () => {
    const r = await request<{ path: string }>("/api/ensure-extension-log", {
      method: "POST",
      body: "{}",
    });
    return r.path;
  },

  /* ---- Control ---- */
  getPackagesDetail: () => request<PackageDetail[]>("/api/packages/detail"),
  getPackageDetail: (spec: string) =>
    request<PackageDetail>(`/api/packages/detail/${encodeURIComponent(spec)}`),
  setPackageOverrides: (
    spec: string,
    patch: { disabled?: boolean; extensions?: string[]; skills?: string[]; commands?: string[] },
  ) =>
    request<Record<string, any>>("/api/packages/overrides", {
      method: "POST",
      body: JSON.stringify({ spec, ...patch }),
    }),
  clearPackageOverrides: (spec: string) =>
    request<Record<string, any>>("/api/packages/overrides/clear", {
      method: "POST",
      body: JSON.stringify({ spec }),
    }),

  /* ---- Process ---- */
  getPiProcesses: () => request<PiProcessInfo[]>("/api/processes/pi"),
  killPiProcess: (pid: number) =>
    request<{ ok: boolean; error?: string }>("/api/processes/pi/kill", {
      method: "POST",
      body: JSON.stringify({ pid }),
    }),

  /* ---- Backups ---- */
  listBackups: () => request<BackupFile[]>("/api/backups"),
  createBackup: (label?: string) =>
    request<BackupFile>("/api/backups", {
      method: "POST",
      body: JSON.stringify({ label: label || "manual" }),
    }),
  restoreBackup: (name: string) =>
    request<{ restored: string[] }>("/api/backups/restore", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteBackup: (name: string) =>
    request<{ ok: boolean }>("/api/backups/delete", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  /* ---- Prompt ---- */
  getPrompt: () => request<{ content: string; exists: boolean }>("/api/prompt"),
  savePrompt: (content: string) =>
    request<{ content: string; exists: boolean }>("/api/prompt", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  /* ---- App settings ---- */
  getAppSettings: () =>
    request<{ settings: AppSettings; defaults: AppSettings }>("/api/app-settings"),
  saveAppSettings: (s: AppSettings) =>
    request<AppSettings>("/api/app-settings", {
      method: "POST",
      body: JSON.stringify(s),
    }),

  /* ---- Events (SSE) ---- */
  getRecentEvents: (limit = 50) =>
    request<RuntimeEvent[]>(`/api/events/recent?limit=${limit}`),
};
