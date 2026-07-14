export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  messages: number;
  errors: number;
}

export interface ModelInfo {
  id: string;
  name?: string | null;
  api?: string | null;
  reasoning?: boolean;
  input?: string[] | null;
  contextWindow?: number | null;
  maxTokens?: number | null;
  cost?: unknown;
  compat?: unknown;
}

export interface ProviderConfig {
  name: string;
  baseUrl?: string | null;
  api?: string | null;
  apiKey?: string | null;
  authHeader?: boolean | null;
  headers?: unknown;
  compat?: unknown;
  models: ModelInfo[];
  hasAuth: boolean;
  authPreview?: string | null;
}

export interface PiSettings {
  defaultProvider?: string | null;
  defaultModel?: string | null;
  defaultThinkingLevel?: string | null;
  packages: string[];
  theme?: string | null;
}

export interface ProvidersOverview {
  providers: ProviderConfig[];
  settings: PiSettings;
  agentHome: string;
}

export interface UpsertProviderInput {
  name: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  authKey?: string;
  authHeader?: boolean;
  models: ModelInfo[];
  headers?: unknown;
  compat?: unknown;
}

export interface ProviderProbeResult {
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
}

export interface ProviderUsage {
  provider: string;
  model: string;
  totals: TokenTotals;
}

export interface DailyUsage {
  date: string;
  totals: TokenTotals;
}

export interface ToolUsage {
  name: string;
  count: number;
  errors: number;
}

export interface SkillUsage {
  name: string;
  count: number;
  lastUsed?: string | null;
}

export interface SessionSummary {
  id: string;
  path: string;
  cwd?: string | null;
  startedAt?: string | null;
  provider?: string | null;
  model?: string | null;
  totals: TokenTotals;
  messageCount: number;
  toolCalls: number;
}

export interface UsageOverview {
  totals: TokenTotals;
  byProviderModel: ProviderUsage[];
  byDay: DailyUsage[];
  tools: ToolUsage[];
  skills: SkillUsage[];
  sessions: SessionSummary[];
  sessionFiles: number;
  scannedLines: number;
  extensionEvents: number;
}

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: string;
  usageCount: number;
  lastUsed?: string | null;
}

export interface SkillsOverview {
  skills: SkillInfo[];
  toolUsage: ToolUsage[];
  skillUsage: SkillUsage[];
}

export interface PackageInfo {
  spec: string;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  installedPath?: string | null;
  hasSkills: boolean;
  hasExtensions: boolean;
  skillNames: string[];
}

export interface PackagesOverview {
  packages: PackageInfo[];
  settingsPackages: string[];
  npmRoot: string;
}

export interface DashboardStats {
  agentHome: string;
  defaultProvider?: string | null;
  defaultModel?: string | null;
  providerCount: number;
  packageCount: number;
  skillCount: number;
  sessionFiles: number;
  totals: TokenTotals;
  today: TokenTotals;
  topTools: ToolUsage[];
  topSkills: SkillUsage[];
}

export type TabId =
  | "dashboard"
  | "manage"
  | "usage"
  | "settings";

/** Deep-link navigation payload used by App / Overview / search. */
export type NavRequest = {
  tab: TabId;
  manageSection?: "providers" | "extensions";
  settingsLeaf?: string;
};

/* ---- Control / runtime types ---- */

export interface PackageDetail {
  spec: string;
  name: string;
  version: string | null;
  installedPath: string;
  description: string | null;
  extensions: Array<{ name: string; path: string; enabled: boolean }>;
  skills: Array<{ name: string; path: string; enabled: boolean }>;
  commands: Array<{ name: string; path: string; enabled: boolean }>;
  hasOverrides: boolean;
}

export interface PiProcessInfo {
  pid: number;
  ppid: number | null;
  name: string;
  cmd: string;
  cpu: number;
  memMB: number;
  startedAt: string | null;
}

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  files: string[];
}

export interface RuntimeEvent {
  ts: string;
  type: string;
  data: any;
}

/* ---- App settings ---- */

export interface AppSettings {
  theme: "light" | "dark" | "auto";
  font: "inter" | "sf" | "system" | "jetbrains";
  fontSize: number;
  radius: number;
  animation: "fast" | "normal" | "off";
  startMinimized: boolean;
  closeToTray: boolean;
  autoLaunch: boolean;
  rememberSize: boolean;
  width: number;
  height: number;
  customAgentHome: string | null;
  apiPort: number;
  cacheTtlMs: number;
  refreshOnFocus: boolean;
  refreshOnStartup: boolean;
  defaultTab: TabId;
  confirmDestructive: boolean;
  showOnboarding: boolean;
  toastNotifications: boolean;
  errorToasts: boolean;
  shortcuts: Record<string, string>;
}
