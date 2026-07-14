import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import {
  deleteAuthKey,
  deleteProvider,
  loadProvidersOverview,
  loadSettings,
  setDefaultModel,
  upsertProvider,
} from "./models";
import { loadDashboard, loadPackagesOverview, loadSkillsOverview } from "./inventory";
import { loadUsageOverview } from "./usage";
import { piAgentHome, usageLogPath } from "./paths";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
} from "./appSettings";
import {
  clearPackageOverrides,
  createBackup,
  deleteBackup,
  ensurePiSwitchDirs,
  findPiProcesses,
  getLastEvent,
  killPiProcess,
  listAllPackagesDetail,
  listBackups,
  loadPackageDetail,
  loadPrompt,
  onEvent,
  restoreBackup,
  runtimeEventsPath,
  savePrompt,
  setPackageOverrides,
} from "./control";

const PORT = Number(process.env.PI_SWITCH_PORT || 8787);

ensurePiSwitchDirs();

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  if (!chunks.length) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return null;
  return JSON.parse(text);
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, err: unknown) {
  send(res, 500, { error: String(err instanceof Error ? err.message : err) });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    if (req.method === "GET" && p === "/api/health") {
      return send(res, 200, {
        ok: true,
        agentHome: piAgentHome(),
        configDir: process.env.APPDATA || require("os").homedir(),
      });
    }
    if (req.method === "GET" && p === "/api/dashboard") {
      return send(res, 200, await loadDashboard());
    }
    if (req.method === "GET" && p === "/api/providers") {
      return send(res, 200, loadProvidersOverview());
    }
    if (req.method === "POST" && p === "/api/providers") {
      const body = await readBody(req);
      return send(res, 200, upsertProvider(body));
    }
    if (req.method === "POST" && p === "/api/providers/delete") {
      const body = await readBody(req);
      return send(res, 200, deleteProvider(String(body.name)));
    }
    if (req.method === "POST" && p === "/api/auth/delete") {
      const body = await readBody(req);
      return send(res, 200, deleteAuthKey(String(body.provider)));
    }
    if (req.method === "POST" && p === "/api/default-model") {
      const body = await readBody(req);
      return send(res, 200, setDefaultModel(String(body.provider), String(body.model)));
    }
    if (req.method === "GET" && p === "/api/settings") {
      return send(res, 200, loadSettings());
    }
    if (req.method === "GET" && p === "/api/usage") {
      return send(res, 200, await loadUsageOverview());
    }
    if (req.method === "GET" && p === "/api/skills") {
      return send(res, 200, await loadSkillsOverview());
    }
    if (req.method === "GET" && p === "/api/packages") {
      return send(res, 200, loadPackagesOverview());
    }
    if (req.method === "GET" && p === "/api/packages/detail") {
      return send(res, 200, listAllPackagesDetail());
    }
    if (req.method === "GET" && p.startsWith("/api/packages/detail/")) {
      const spec = decodeURIComponent(p.slice("/api/packages/detail/".length));
      return send(res, 200, loadPackageDetail(spec));
    }
    if (req.method === "POST" && p === "/api/packages/overrides") {
      const body = await readBody(req);
      return send(res, 200, setPackageOverrides(body.spec, body));
    }
    if (req.method === "POST" && p === "/api/packages/overrides/clear") {
      const body = await readBody(req);
      return send(res, 200, clearPackageOverrides(body.spec));
    }
    if (req.method === "GET" && p === "/api/agent-home") {
      return send(res, 200, { path: piAgentHome() });
    }
    if (req.method === "POST" && p === "/api/ensure-extension-log") {
      const log = usageLogPath();
      fs.mkdirSync(path.dirname(log), { recursive: true });
      return send(res, 200, { path: log });
    }

    /* ---- App settings ---- */
    if (req.method === "GET" && p === "/api/app-settings") {
      const s = loadAppSettings();
      return send(res, 200, { settings: s, defaults: DEFAULT_APP_SETTINGS });
    }
    if (req.method === "POST" && p === "/api/app-settings") {
      const body = await readBody(req);
      const saved = saveAppSettings(body);
      return send(res, 200, saved);
    }

    /* ---- Process control ---- */
    if (req.method === "GET" && p === "/api/processes/pi") {
      return send(res, 200, await findPiProcesses());
    }
    if (req.method === "POST" && p === "/api/processes/pi/kill") {
      const body = await readBody(req);
      return send(res, 200, await killPiProcess(Number(body.pid)));
    }

    /* ---- Backups ---- */
    if (req.method === "GET" && p === "/api/backups") {
      return send(res, 200, listBackups());
    }
    if (req.method === "POST" && p === "/api/backups") {
      const body = (await readBody(req)) || {};
      return send(res, 200, createBackup(body.label));
    }
    if (req.method === "POST" && p === "/api/backups/restore") {
      const body = await readBody(req);
      return send(res, 200, restoreBackup(String(body.name)));
    }
    if (req.method === "POST" && p === "/api/backups/delete") {
      const body = await readBody(req);
      deleteBackup(String(body.name));
      return send(res, 200, { ok: true });
    }

    /* ---- Prompt ---- */
    if (req.method === "GET" && p === "/api/prompt") {
      return send(res, 200, loadPrompt());
    }
    if (req.method === "POST" && p === "/api/prompt") {
      const body = await readBody(req);
      return send(res, 200, savePrompt(String(body.content || "")));
    }

    /* ---- Runtime events (SSE) ---- */
    if (req.method === "GET" && p === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": ok\n\n");
      const last = getLastEvent();
      if (last) res.write(`data: ${JSON.stringify(last)}\n\n`);
      const off = onEvent((e) => {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      });
      const ka = setInterval(() => {
        res.write(`: keep-alive\n\n`);
      }, 15000);
      req.on("close", () => {
        clearInterval(ka);
        off();
      });
      return;
    }

    /* ---- Recent events (from disk) ---- */
    if (req.method === "GET" && p === "/api/events/recent") {
      const file = runtimeEventsPath();
      const limit = Number(url.searchParams.get("limit") || "50");
      if (!fs.existsSync(file)) return send(res, 200, []);
      const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
      const out: any[] = [];
      for (const line of lines.slice(-limit)) {
        try { out.push(JSON.parse(line)); } catch { /* ignore */ }
      }
      return send(res, 200, out);
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    sendError(res, err);
  }
});

/* ---- Tail runtime events file (if extension writes to it) ---- */
function watchRuntime() {
  const file = runtimeEventsPath();
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, ""); } catch { /* ignore */ }
  }
  let pos = fs.statSync(file).size;
  try {
    fs.watch(file, () => {
      try {
        const stat = fs.statSync(file);
        if (stat.size <= pos) {
          pos = stat.size;
          return;
        }
        const fd = fs.openSync(file, "r");
        const buf = Buffer.alloc(stat.size - pos);
        fs.readSync(fd, buf, 0, buf.length, pos);
        fs.closeSync(fd);
        pos = stat.size;
        for (const line of buf.toString("utf8").split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj && obj.type) {
              // import lazily to avoid circular dep at top
              const { pushEvent } = require("./control");
              pushEvent(obj);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`pi-switch server http://127.0.0.1:${PORT}`);
  console.log(`agent home: ${piAgentHome()}`);
  watchRuntime();
});
