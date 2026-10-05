const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ssfDesktop", {
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  openBuildFile: () => ipcRenderer.invoke("build:open-file"),
  fetchBuildUrl: (url, contact) => ipcRenderer.invoke("build:fetch-url", { url, contact }),
  saveExport: (name, content, format) => ipcRenderer.invoke("export:save", { name, content, format }),
  openTrustedLink: (url) => ipcRenderer.invoke("external:open-trusted", url),
});
