const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piSwitchDesktop", {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  platform: () => ipcRenderer.invoke("app:platform"),
  setAutoLaunch: (enable) => ipcRenderer.invoke("app:setAutoLaunch", enable),
  getAutoLaunch: () => ipcRenderer.invoke("app:getAutoLaunch"),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  showItemInFolder: (p) => ipcRenderer.invoke("shell:showItemInFolder", p),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  relaunch: () => ipcRenderer.invoke("app:relaunch"),
  hide: () => ipcRenderer.invoke("app:hide"),
  quit: () => ipcRenderer.invoke("app:quit"),
  onWindowState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("window-state", handler);
    return () => ipcRenderer.removeListener("window-state", handler);
  },
  onNavigate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("navigate", handler);
    return () => ipcRenderer.removeListener("navigate", handler);
  },
});
