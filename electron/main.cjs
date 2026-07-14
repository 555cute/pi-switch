const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  Tray,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");

const isDev = !app.isPackaged;

// Config from disk (read lazily so we can update without restart)
function piSwitchConfigPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || require("os").homedir(), "pi-switch", "settings.json");
  }
  if (process.platform === "darwin") {
    return path.join(require("os").homedir(), "Library", "Application Support", "pi-switch", "settings.json");
  }
  return path.join(require("os").homedir(), ".config", "pi-switch", "settings.json");
}

function readAppSettings() {
  try {
    if (!fs.existsSync(piSwitchConfigPath())) return null;
    return JSON.parse(fs.readFileSync(piSwitchConfigPath(), "utf8"));
  } catch { return null; }
}

const appSettings = readAppSettings() || {};
const API_PORT = Number(appSettings.apiPort || process.env.PI_SWITCH_PORT || 8787);
const WEB_URL = process.env.PI_SWITCH_WEB_URL || `http://127.0.0.1:1420`;
const WEB_PORT = 1420;

let mainWindow = null;
let apiProcess = null;
let webProcess = null;
let tray = null;
let isQuitting = false;

function applyTheme() {
  const t = appSettings.theme || "light";
  nativeTheme.themeSource = t === "auto" ? "system" : t;
}

function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`timeout waiting for ${url}`));
          return;
        }
        setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function startWebServer() {
  return new Promise((resolve) => {
    const probe = http.get(`http://127.0.0.1:${WEB_PORT}/`, (res) => {
      res.resume();
      resolve(false);
    });
    probe.on("error", () => {
      const root = path.join(__dirname, "..");
      const bin = process.platform === "win32" ? "npx.cmd" : "npx";
      webProcess = spawn(
        bin,
        ["vite", "--host", "127.0.0.1", "--port", String(WEB_PORT)],
        {
          cwd: root,
          env: { ...process.env, PI_SWITCH_EVENTS: runtimeEventsPathForExt() },
          stdio: "pipe",
          windowsHide: true,
          shell: process.platform === "win32",
        }
      );
      webProcess.stdout?.on("data", (d) => isDev && process.stdout.write(`[web] ${d}`));
      webProcess.stderr?.on("data", (d) => isDev && process.stderr.write(`[web] ${d}`));
      webProcess.on("exit", (code) => {
        webProcess = null;
        if (isDev) console.log(`[web] exited ${code}`);
      });
      resolve(true);
    });
  });
}

function runtimeEventsPathForExt() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || require("os").homedir(), "pi-switch", "logs", "runtime.jsonl");
  }
  if (process.platform === "darwin") {
    return path.join(require("os").homedir(), "Library", "Application Support", "pi-switch", "logs", "runtime.jsonl");
  }
  return path.join(require("os").homedir(), ".config", "pi-switch", "logs", "runtime.jsonl");
}

function startApiServer() {
  return new Promise((resolve) => {
    const probe = http.get(`http://127.0.0.1:${API_PORT}/api/health`, (res) => {
      res.resume();
      resolve(false);
    });
    probe.on("error", () => {
      const root = path.join(__dirname, "..");
      const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
      const serverEntry = path.join(root, "server", "index.ts");
      const bin = process.platform === "win32" ? "npx.cmd" : "npx";
      apiProcess = spawn(bin, ["tsx", serverEntry], {
        cwd: root,
        env: {
          ...process.env,
          PI_SWITCH_PORT: String(API_PORT),
          PI_SWITCH_EVENTS: runtimeEventsPathForExt(),
          ELECTRON_RUN_AS_NODE: "1",
        },
        stdio: "pipe",
        windowsHide: true,
        shell: process.platform === "win32",
      });
      apiProcess.stdout?.on("data", (d) => isDev && process.stdout.write(`[api] ${d}`));
      apiProcess.stderr?.on("data", (d) => isDev && process.stderr.write(`[api] ${d}`));
      apiProcess.on("exit", (code) => {
        apiProcess = null;
        if (isDev) console.log(`[api] exited ${code}`);
      });
      resolve(true);
    });
  });
}

function createWindow() {
  applyTheme();

  const w = appSettings.rememberSize ? appSettings.width || 1000 : 1000;
  const h = appSettings.rememberSize ? appSettings.height || 640 : 640;

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 800,
    minHeight: 540,
    show: !appSettings.startMinimized,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: appSettings.theme === "dark" ? "#1d1d1f" : "#fbfbfc",
    autoHideMenuBar: true,
    backgroundMaterial: process.platform === "win32" ? "mica" : undefined,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, "icon.png"),
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    if (appSettings.closeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Remember size
  const saveSize = () => {
    if (!mainWindow || !appSettings.rememberSize) return;
    try {
      const [width, height] = mainWindow.getSize();
      const cfg = { ...(readAppSettings() || {}), width, height };
      fs.mkdirSync(path.dirname(piSwitchConfigPath()), { recursive: true });
      fs.writeFileSync(piSwitchConfigPath(), JSON.stringify(cfg, null, 2));
    } catch { /* ignore */ }
  };
  mainWindow.on("resize", saveSize);
  mainWindow.on("close", saveSize);

  const load = async () => {
    if (isDev) {
      try {
        await waitForUrl(WEB_URL);
        await mainWindow.loadURL(WEB_URL);
      } catch (err) {
        const msg = String(err);
        console.error("[ui]", msg);
        mainWindow?.loadURL(
          `data:text/html;charset=utf-8,` +
            encodeURIComponent(
              `<body style="background:#f6f7f9;color:#1f2328;font-family:Segoe UI,sans-serif;padding:40px">
                <h2>pi-switch failed to start UI</h2>
                <p>${msg}</p>
                <p>Run <code>npm run dev:desktop</code> from the project root.</p>
              </body>`
            )
        );
      }
    } else {
      const distIndex = path.join(__dirname, "..", "dist", "index.html");
      await mainWindow.loadFile(distIndex);
    }
  };

  load();

  ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"].forEach((ev) => {
    mainWindow.on(ev, () => {
      mainWindow?.webContents.send("window-state", {
        maximized: mainWindow.isMaximized(),
        fullscreen: mainWindow.isFullScreen(),
      });
    });
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "icon.png");
    if (!fs.existsSync(iconPath)) return;
    tray = new Tray(iconPath);
    const menu = Menu.buildFromTemplate([
      { label: "Show pi-switch", click: () => mainWindow?.show() },
      { label: "Hide", click: () => mainWindow?.hide() },
      { type: "separator" },
      { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
    ]);
    tray.setToolTip("pi-switch");
    tray.setContextMenu(menu);
    tray.on("click", () => {
      if (mainWindow?.isVisible()) mainWindow.hide();
      else mainWindow.show();
    });
  } catch (err) {
    console.error("[tray] failed:", err);
  }
}

function setAutoLaunch(enable) {
  try {
    if (process.platform === "win32") {
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath,
        args: ["--autostart"],
      });
    } else if (process.platform === "darwin") {
      app.setLoginItemSettings({ openAtLogin: enable });
    } else {
      app.setLoginItemSettings({ openAtLogin: enable });
    }
  } catch (err) {
    console.error("[autoLaunch] failed:", err);
  }
}

/* ---- IPC ---- */
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:isMaximized", () => !!mainWindow?.isMaximized());
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:platform", () => process.platform);
ipcMain.handle("app:setAutoLaunch", (_e, enable) => {
  setAutoLaunch(!!enable);
  return app.getLoginItemSettings();
});
ipcMain.handle("app:getAutoLaunch", () => app.getLoginItemSettings());
ipcMain.handle("shell:openPath", (_e, p) => shell.openPath(String(p)));
ipcMain.handle("shell:showItemInFolder", (_e, p) => shell.showItemInFolder(String(p)));
ipcMain.handle("shell:openExternal", (_e, url) => shell.openExternal(String(url)));
ipcMain.handle("app:relaunch", () => {
  isQuitting = true;
  app.relaunch();
  app.quit();
});
ipcMain.handle("app:hide", () => mainWindow?.hide());
ipcMain.handle("app:quit", () => {
  isQuitting = true;
  app.quit();
});

/* ---- Global shortcuts ---- */
function applyShortcuts() {
  globalShortcut.unregisterAll();
  const sc = appSettings.shortcuts || {};
  const map = {
    "window.close": () => mainWindow?.close(),
    "window.minimize": () => mainWindow?.minimize(),
  };
  for (const [action, accel] of Object.entries(sc)) {
    const fn = map[action];
    if (!fn || !accel) continue;
    try { globalShortcut.register(accel, fn); } catch { /* ignore */ }
  }
}

app.whenReady().then(async () => {
  if (appSettings.autoLaunch) setAutoLaunch(true);
  applyTheme();
  try {
    await startWebServer();
    await startApiServer();
    await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`, 20000);
  } catch (err) {
    console.error("API start failed", err);
  }
  createWindow();
  createTray();
  applyShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on("window-all-closed", () => {
  if (appSettings.closeToTray && process.platform !== "darwin") {
    // stay alive in tray
    return;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  for (const p of [apiProcess, webProcess]) {
    if (p && !p.killed) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"], { windowsHide: true });
        } else {
          p.kill("SIGTERM");
        }
      } catch { /* ignore */ }
    }
  }
});
