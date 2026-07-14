import os from "node:os";
import path from "node:path";

export function piAgentHome(): string {
  return path.join(os.homedir(), ".pi", "agent");
}

export function modelsJson(): string {
  return path.join(piAgentHome(), "models.json");
}

export function authJson(): string {
  return path.join(piAgentHome(), "auth.json");
}

export function settingsJson(): string {
  return path.join(piAgentHome(), "settings.json");
}

export function sessionsDir(): string {
  return path.join(piAgentHome(), "sessions");
}

export function skillsDir(): string {
  return path.join(piAgentHome(), "skills");
}

export function agentsSkillsDir(): string {
  return path.join(os.homedir(), ".agents", "skills");
}

export function npmDir(): string {
  return path.join(piAgentHome(), "npm");
}

export function usageLogPath(): string {
  return path.join(piAgentHome(), "pi-switch", "usage-events.jsonl");
}
