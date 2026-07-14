// pi-switch 自己的设置存储（与 pi 的 ~/.pi/agent 分离）。
// 存放在 ~/.pi-switch/settings.json（mac/linux）或 %APPDATA%\pi-switch\settings.json（windows）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AppSettings {
  // 外观
  theme: "light" | "dark" | "auto";
  font: "inter" | "sf" | "system" | "jetbrains";
  fontSize: number; // px
  radius: number; // px
  animation: "fast" | "normal" | "off";

  // 窗口
  startMinimized: boolean;
  closeToTray: boolean;
  autoLaunch: boolean;
  rememberSize: boolean;
  width: number;
  height: number;

  // 数据源
  customAgentHome: string | null;
  apiPort: number;

  // 缓存
  cacheTtlMs: number;
  refreshOnFocus: boolean;
  refreshOnStartup: boolean;

  // 行为
  defaultTab: "dashboard" | "manage" | "usage" | "settings";
  confirmDestructive: boolean;
  showOnboarding: boolean;
  toastNotifications: boolean;
  errorToasts: boolean;

  // 快捷键
  shortcuts: Record<string, string>; // action -> accelerator
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "light",
  font: "inter",
  fontSize: 13,
  radius: 10,
  animation: "normal",
  startMinimized: false,
  closeToTray: false,
  autoLaunch: false,
  rememberSize: true,
  width: 1000,
  height: 640,
  customAgentHome: null,
  apiPort: 8787,
  cacheTtlMs: 1000,
  refreshOnFocus: true,
  refreshOnStartup: true,
  defaultTab: "dashboard",
  confirmDestructive: true,
  showOnboarding: false,
  toastNotifications: true,
  errorToasts: true,
  shortcuts: {
    "window.close": "CmdOrCtrl+W",
    "window.minimize": "CmdOrCtrl+M",
    "window.refresh": "F5",
    "tab.dashboard": "CmdOrCtrl+1",
    "tab.manage": "CmdOrCtrl+2",
    "tab.usage": "CmdOrCtrl+3",
    "tab.settings": "CmdOrCtrl+4",
  },
};

export function piSwitchConfigDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "pi-switch");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "pi-switch");
  }
  return path.join(os.homedir(), ".config", "pi-switch");
}

export function appSettingsPath(): string {
  return path.join(piSwitchConfigDir(), "settings.json");
}

export function piSwitchBackupsDir(): string {
  return path.join(piSwitchConfigDir(), "backups");
}

export function piSwitchLogsDir(): string {
  return path.join(piSwitchConfigDir(), "logs");
}

const LEGACY_TABS: Record<string, AppSettings["defaultTab"]> = {
  providers: "manage",
  skills: "manage",
  packages: "manage",
  control: "settings",
  backups: "settings",
};

function normalizeDefaultTab(v: unknown): AppSettings["defaultTab"] {
  if (typeof v !== "string") return DEFAULT_APP_SETTINGS.defaultTab;
  if (v in LEGACY_TABS) return LEGACY_TABS[v];
  if (v === "dashboard" || v === "manage" || v === "usage" || v === "settings") return v;
  return DEFAULT_APP_SETTINGS.defaultTab;
}

function normalizeShortcuts(raw: Record<string, string> | undefined): Record<string, string> {
  const base = { ...DEFAULT_APP_SETTINGS.shortcuts, ...(raw || {}) };
  // migrate old tab.* keys
  if (base["tab.providers"] && !raw?.["tab.manage"]) {
    base["tab.manage"] = base["tab.providers"];
  }
  delete base["tab.providers"];
  delete base["tab.skills"];
  delete base["tab.packages"];
  return base;
}

export function loadAppSettings(): AppSettings {
  const file = appSettingsPath();
  if (!fs.existsSync(file)) {
    return { ...DEFAULT_APP_SETTINGS, shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...DEFAULT_APP_SETTINGS,
      ...raw,
      defaultTab: normalizeDefaultTab(raw.defaultTab),
      shortcuts: normalizeShortcuts(raw.shortcuts),
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS, shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts } };
  }
}

export function saveAppSettings(s: AppSettings): AppSettings {
  fs.mkdirSync(piSwitchConfigDir(), { recursive: true });
  const merged = {
    ...DEFAULT_APP_SETTINGS,
    ...s,
    defaultTab: normalizeDefaultTab(s.defaultTab),
    shortcuts: normalizeShortcuts(s.shortcuts),
  };
  fs.writeFileSync(appSettingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}
