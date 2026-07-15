#!/usr/bin/env node
/**
 * dev:fix — recover from Vite HMR / module-cache corruption.
 *
 * Common symptoms this fixes:
 *   - "白屏 / styles gone / 按钮没反应" right after editing
 *   - Vite serves an empty or stub module for a source file
 *   - 1420 / 8787 ports are stuck on a dead process
 *
 * What it does:
 *   1. Stop any node process holding port 1420 (Vite) or 8787 (API)
 *      — never touches user pi dialogs / electron / unrelated node.
 *   2. Remove node_modules/.vite (Vite's optimization + HMR cache).
 *   3. Restart `npm run dev` (web + server via concurrently).
 *
 * If `npm run dev` is already running on a different shell, you can
 * skip step 3 with:  node scripts/dev-fix.mjs --no-restart
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = new Set(process.argv.slice(2));
const skipRestart = args.has("--no-restart") || args.has("--no-restart");
const verbose = args.has("--verbose") || args.has("-v");

const PORTS = [1420, 8787];

function log(...a) {
  console.log("[dev:fix]", ...a);
}
function err(...a) {
  console.error("[dev:fix]", ...a);
}

function isWindows() {
  return platform() === "win32";
}

/** Find PIDs (Windows) or PIDs (POSIX) listening on the given TCP port. */
function findPidsOnPort(port) {
  try {
    if (isWindows()) {
      const out = execSync(`netstat -ano | findstr ":${port} "`, {
        encoding: "utf8",
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/\s(\d+)\s*$/);
        if (m) pids.add(Number(m[1]));
      }
      return Array.from(pids);
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" });
      return out
        .split(/\s+/)
        .map((s) => Number(s))
        .filter(Number.isFinite);
    }
  } catch {
    return [];
  }
}

function pidIsNode(pid) {
  try {
    if (isWindows()) {
      const out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\" | Select-Object -ExpandProperty Name"`,
        { encoding: "utf8" },
      );
      return /node\.exe/i.test(out);
    } else {
      const out = execSync(`ps -o comm= -p ${pid}`, { encoding: "utf8" });
      return /node/i.test(out);
    }
  } catch {
    return false;
  }
}

function killPid(pid) {
  try {
    if (isWindows()) {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`);
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch (e) {
    if (verbose) err(`kill ${pid} failed: ${e.message}`);
    return false;
  }
}

function freePort(port) {
  const pids = findPidsOnPort(port);
  if (pids.length === 0) {
    log(`port ${port}: free`);
    return;
  }
  for (const pid of pids) {
    if (!pidIsNode(pid)) {
      if (verbose) log(`port ${port} pid ${pid}: not node, skipping`);
      continue;
    }
    if (killPid(pid)) {
      log(`port ${port} pid ${pid}: stopped (node)`);
    } else {
      log(`port ${port} pid ${pid}: failed to stop`);
    }
  }
}

function clearViteCache() {
  const cacheDir = resolve(root, "node_modules", ".vite");
  if (!existsSync(cacheDir)) {
    log("vite cache: nothing to remove");
    return;
  }
  try {
    rmSync(cacheDir, { recursive: true, force: true });
    log("vite cache: removed", cacheDir);
  } catch (e) {
    err("vite cache: failed to remove", e.message);
  }
}

function startDev() {
  log("starting npm run dev …");
  const isWin = isWindows();
  const child = spawn(
    isWin ? "npm.cmd" : "npm",
    ["run", "dev"],
    { cwd: root, stdio: "inherit", shell: false },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  log("=== dev:fix ===");
  for (const p of PORTS) freePort(p);
  clearViteCache();
  if (skipRestart) {
    log("done. Vite/API not restarted (--no-restart).");
    log("run `npm run dev` when ready.");
    return;
  }
  // give the OS a moment to release ports
  await new Promise((r) => setTimeout(r, 600));
  startDev();
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});
