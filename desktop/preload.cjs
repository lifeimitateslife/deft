const { contextBridge, ipcRenderer, webUtils } = require("electron");
const commands = [
  "init",
  "create",
  "open",
  "pending",
  "save",
  "close",
  "recover",
  "check",
  "reload",
  "acceptReload",
  "settings",
  "reveal",
  "link",
  "asset",
  "image",
  "export",
  "print",
  "pdf",
  "confirm",
  "material",
];
const bridge = Object.fromEntries(
  commands.map((name) => [
    name,
    (...args) => ipcRenderer.invoke(`deft:${name}`, ...args),
  ]),
);
contextBridge.exposeInMainWorld("deft", {
  ...bridge,
  dropped: (files) =>
    ipcRenderer.invoke(
      "deft:open",
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  onAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("action", handler);
    return () => ipcRenderer.removeListener("action", handler);
  },
  platform: process.platform,
});
