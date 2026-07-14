// Global data cache: page reads return cached data immediately,
// then a background fetch updates the cache in place.

import { useSyncExternalStore } from "react";
import { api } from "./api";
import type {
  AppSettings,
  DashboardStats,
  PackageDetail,
  PackagesOverview,
  PiProcessInfo,
  PiSettings,
  ProvidersOverview,
  RuntimeEvent,
  SkillsOverview,
  UsageOverview,
} from "./types";

export type TabId =
  | "dashboard"
  | "manage"
  | "usage"
  | "settings";

type Cache = {
  dashboard?: DashboardStats;
  providers?: ProvidersOverview;
  usage?: UsageOverview;
  skills?: SkillsOverview;
  packages?: PackagesOverview;
  packagesDetail?: PackageDetail[];
  settings?: PiSettings;
  agentHome?: string;
  appSettings?: AppSettings;
  appSettingsDefaults?: AppSettings;
  processes?: PiProcessInfo[];
  recentEvents?: RuntimeEvent[];
  lastUpdated: Partial<Record<keyof Cache, number>>;
};

const state: { cache: Cache } = { cache: { lastUpdated: {} } };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return state.cache;
}

export function useCache() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

async function refresh<K extends keyof Cache>(
  key: K,
  fetcher: () => Promise<Cache[K]>,
) {
  const now = Date.now();
  const ttl = state.cache.appSettings?.cacheTtlMs ?? 1000;
  if (state.cache.lastUpdated[key] && now - state.cache.lastUpdated[key]! < ttl) {
    return;
  }
  try {
    const data = await fetcher();
    state.cache = {
      ...state.cache,
      [key]: data,
      lastUpdated: { ...state.cache.lastUpdated, [key]: now },
    };
    emit();
  } catch (err) {
    console.error(`[cache] ${String(key)} fetch failed:`, err);
  }
}

export function ensureDashboard(force = false) {
  if (force) state.cache.lastUpdated.dashboard = 0;
  if (!state.cache.dashboard || force) {
    void refresh("dashboard", () => api.getDashboard());
  }
}

export function ensureProviders(force = false) {
  if (force) state.cache.lastUpdated.providers = 0;
  if (!state.cache.providers || force) {
    void refresh("providers", () => api.getProviders());
  }
}

export function ensureUsage(force = false) {
  if (force) state.cache.lastUpdated.usage = 0;
  if (!state.cache.usage || force) {
    void refresh("usage", () => api.getUsage());
  }
}

export function ensureSkills(force = false) {
  if (force) state.cache.lastUpdated.skills = 0;
  if (!state.cache.skills || force) {
    void refresh("skills", () => api.getSkills());
  }
}

export function ensurePackages(force = false) {
  if (force) state.cache.lastUpdated.packages = 0;
  if (!state.cache.packages || force) {
    void refresh("packages", () => api.getPackages());
  }
}

export function ensurePackagesDetail(force = false) {
  if (force) state.cache.lastUpdated.packagesDetail = 0;
  if (!state.cache.packagesDetail || force) {
    void refresh("packagesDetail", () => api.getPackagesDetail());
  }
}

export function ensureSettings(force = false) {
  if (force) state.cache.lastUpdated.settings = 0;
  if (!state.cache.settings || force) {
    void Promise.all([api.getSettings(), api.getAgentHome()]).then(
      ([settings, home]) => {
        state.cache = {
          ...state.cache,
          settings,
          agentHome: home,
          lastUpdated: {
            ...state.cache.lastUpdated,
            settings: Date.now(),
          },
        };
        emit();
      },
    );
  }
}

export function ensureAppSettings(force = false) {
  if (force) state.cache.lastUpdated.appSettings = 0;
  if (!state.cache.appSettings || force) {
    void refresh("appSettings", () => api.getAppSettings().then((r) => r.settings));
    void refresh("appSettingsDefaults", () => api.getAppSettings().then((r) => r.defaults));
  }
}

export function ensureProcesses(force = false) {
  if (force) state.cache.lastUpdated.processes = 0;
  if (!state.cache.processes || force) {
    void refresh("processes", () => api.getPiProcesses());
  }
}

export function ensureRecentEvents(force = false) {
  if (force) state.cache.lastUpdated.recentEvents = 0;
  if (!state.cache.recentEvents || force) {
    void refresh("recentEvents", () => api.getRecentEvents(100));
  }
}

export async function saveProvider(input: any) {
  const next = await api.saveProvider(input);
  state.cache = {
    ...state.cache,
    providers: next,
    lastUpdated: { ...state.cache.lastUpdated, providers: Date.now() },
  };
  emit();
  return next;
}

export async function removeProvider(name: string) {
  const next = await api.removeProvider(name);
  state.cache = {
    ...state.cache,
    providers: next,
    lastUpdated: { ...state.cache.lastUpdated, providers: Date.now() },
  };
  emit();
  return next;
}

export async function removeAuth(provider: string) {
  const next = await api.removeAuth(provider);
  state.cache = {
    ...state.cache,
    providers: next,
    lastUpdated: { ...state.cache.lastUpdated, providers: Date.now() },
  };
  emit();
  return next;
}

export async function switchDefaultModel(provider: string, model: string) {
  const settings = await api.switchDefaultModel(provider, model);
  state.cache = {
    ...state.cache,
    settings,
    lastUpdated: { ...state.cache.lastUpdated, settings: Date.now() },
  };
  emit();
  return settings;
}

export async function saveAppSettings(s: AppSettings): Promise<AppSettings> {
  const saved = await api.saveAppSettings(s);
  state.cache = {
    ...state.cache,
    appSettings: saved,
    lastUpdated: { ...state.cache.lastUpdated, appSettings: Date.now() },
  };
  // apply theme immediately
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = saved.theme === "auto" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : saved.theme;
  }
  emit();
  return saved;
}

export async function setPackageOverrides(
  spec: string,
  patch: { disabled?: boolean; extensions?: string[]; skills?: string[]; commands?: string[] },
) {
  await api.setPackageOverrides(spec, patch);
  state.cache.lastUpdated.packagesDetail = 0;
  void ensurePackagesDetail(true);
}

export async function clearPackageOverrides(spec: string) {
  await api.clearPackageOverrides(spec);
  state.cache.lastUpdated.packagesDetail = 0;
  void ensurePackagesDetail(true);
}

export function pushRecentEvent(e: RuntimeEvent) {
  const list = state.cache.recentEvents || [];
  state.cache = {
    ...state.cache,
    recentEvents: [e, ...list].slice(0, 100),
  };
  emit();
}

export function refreshAll() {
  state.cache.lastUpdated = {};
  void Promise.all([
    refresh("dashboard", () => api.getDashboard()),
    refresh("usage", () => api.getUsage()),
    refresh("skills", () => api.getSkills()),
    refresh("packages", () => api.getPackages()),
    refresh("providers", () => api.getProviders()),
    refresh("settings", () => api.getSettings()),
  ]);
}
