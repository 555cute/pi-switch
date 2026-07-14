/**
 * Optional pi extension: append realtime usage / skill / tool events
 * to ~/.pi/agent/pi-switch/usage-events.jsonl for pi-switch analytics.
 *
 * Install (user settings example):
 *   "packages" already works for npm packages; for a local path extension,
 *   point pi at this folder via settings extensions or:
 *     pi -e /absolute/path/to/pi-switch/extensions/pi-switch-usage
 *
 * Note: exact ExtensionAPI shape may vary by pi version — adjust imports
 * against @earendil-works/pi-coding-agent docs if the host rejects this file.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

type UsageLike = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { total?: number };
};

function logPath() {
  // Prefer pi-switch's own runtime log (forwarded via SSE to the UI).
  // Fall back to legacy ~/.pi/agent/pi-switch/usage-events.jsonl.
  if (process.env.PI_SWITCH_EVENTS) return process.env.PI_SWITCH_EVENTS;
  return join(homedir(), ".pi", "agent", "pi-switch", "usage-events.jsonl");
}

async function appendEvent(event: Record<string, unknown>) {
  const path = logPath();
  await mkdir(dirname(path), { recursive: true });
  const line = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
    source: "pi-switch-usage",
  });
  await appendFile(path, line + "\n", "utf8");
}

export default function (pi: {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  // fallback loose surface
  [key: string]: any;
}) {
  const safe = (fn: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(fn)
      .catch((err) => {
        console.error("[pi-switch-usage]", err);
      });
  };

  // Best-effort hooks — different pi versions expose slightly different events.
  pi.on?.("message", (msg: any) => {
    safe(async () => {
      if (msg?.role === "assistant" && msg?.usage) {
        await appendEvent({
          type: "usage",
          provider: msg.provider,
          model: msg.model,
          usage: msg.usage as UsageLike,
          stopReason: msg.stopReason,
        });
      }
      if (msg?.role === "user") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((p: any) => p?.type === "text")
                  .map((p: any) => p.text)
                  .join("\n")
              : "";
        if (text.startsWith("/skill:")) {
          const name = text.slice("/skill:".length).split(/\s+/)[0];
          if (name) await appendEvent({ type: "skill", name });
        }
      }
      if (msg?.role === "toolResult") {
        await appendEvent({
          type: "tool",
          name: msg.toolName,
          isError: !!msg.isError,
        });
      }
    });
  });

  pi.on?.("tool_call", (call: any) => {
    safe(async () => {
      await appendEvent({
        type: "tool",
        name: call?.name ?? call?.toolName ?? "unknown",
        isError: false,
      });
    });
  });

  return {
    name: "pi-switch-usage",
    version: "0.1.0",
  };
}
