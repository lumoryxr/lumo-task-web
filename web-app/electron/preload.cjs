const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  isElectron: true,
  getApiPort: () => ipcRenderer.invoke("get-api-port"),
  enterFocusMode: () => ipcRenderer.send("win:enter-focus"),
  exitFocusMode: () => ipcRenderer.send("win:exit-focus"),

  // ── Storage / database path ─────────────────────────────────────────────────
  /** Returns the absolute path to the lumo.db file currently in use. */
  getDbPath: () => ipcRenderer.invoke("db:getPath"),
  /**
   * Opens a native folder-picker dialog.
   * @returns {Promise<string|null>} selected folder, or null if cancelled.
   */
  chooseDbFolder: () => ipcRenderer.invoke("db:chooseFolder"),
  /**
   * Copies lumo.db to newDir, saves the preference, and relaunches the app.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  moveDbTo: (newDir) => ipcRenderer.invoke("db:moveTo", newDir),
  /** Reveals lumo.db in Finder / Explorer (fire-and-forget). */
  showDbInFolder: () => ipcRenderer.send("db:showInFolder"),

  // Cloud sync is driven entirely by the backend's HTTP endpoints (P1b) —
  // no preload bridge needed.
});
