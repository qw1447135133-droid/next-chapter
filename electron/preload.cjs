var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var jimengAPI = {
  start: () => import_electron.ipcRenderer.invoke("jimeng:start"),
  stop: () => import_electron.ipcRenderer.invoke("jimeng:stop"),
  status: () => import_electron.ipcRenderer.invoke("jimeng:status"),
  getApiBase: () => import_electron.ipcRenderer.invoke("jimeng:getApiBase"),
  openSetup: () => import_electron.ipcRenderer.invoke("jimeng:openSetup"),
  openBrowserData: () => import_electron.ipcRenderer.invoke("jimeng:openBrowserData"),
  writeFile: (filePath, content) => import_electron.ipcRenderer.invoke("jimeng:writeFile", { filePath, content }),
  prepareXlsx: (params) => import_electron.ipcRenderer.invoke("jimeng:prepareXlsx", params),
  onStatusChange: (callback) => {
    const handler = (_, status) => callback(status);
    import_electron.ipcRenderer.on("jimeng:status", handler);
    return () => {
      import_electron.ipcRenderer.removeListener("jimeng:status", handler);
    };
  }
};
var browserViewAPI = {
  create: (params) => import_electron.ipcRenderer.invoke("browserView:create", params),
  navigate: (url) => import_electron.ipcRenderer.invoke("browserView:navigate", { url }),
  setBounds: (bounds) => import_electron.ipcRenderer.invoke("browserView:setBounds", bounds),
  show: () => import_electron.ipcRenderer.invoke("browserView:show"),
  hide: () => import_electron.ipcRenderer.invoke("browserView:hide"),
  getState: () => import_electron.ipcRenderer.invoke("browserView:getState"),
  execute: (params) => import_electron.ipcRenderer.invoke("browserView:execute", params),
  capture: () => import_electron.ipcRenderer.invoke("browserView:capture"),
  setFileInputFiles: (params) => import_electron.ipcRenderer.invoke("browserView:setFileInputFiles", params),
  sendInputEvents: (events) => import_electron.ipcRenderer.invoke("browserView:sendInputEvents", { events }),
  download: (params) => import_electron.ipcRenderer.invoke("browserView:download", params),
  close: () => import_electron.ipcRenderer.invoke("browserView:close"),
  setIgnoreMouseEvents: (ignore) => import_electron.ipcRenderer.invoke("browserView:setIgnoreMouseEvents", ignore),
  onStateChange: (callback) => {
    const handler = (_, state) => callback(state);
    import_electron.ipcRenderer.on("browserView:state", handler);
    return () => {
      import_electron.ipcRenderer.removeListener("browserView:state", handler);
    };
  }
};
var reversePlaywrightAPI = {
  runSegments: (params) => import_electron.ipcRenderer.invoke("reversePlaywright:runSegments", params),
  prepareSegment: (params) => import_electron.ipcRenderer.invoke("reversePlaywright:prepareSegment", params),
  capture: () => import_electron.ipcRenderer.invoke("reversePlaywright:capture"),
  close: () => import_electron.ipcRenderer.invoke("reversePlaywright:close")
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  jimeng: jimengAPI,
  storage: {
    getDefaultPath: () => import_electron.ipcRenderer.invoke("storage:getDefaultPath"),
    selectFolder: () => import_electron.ipcRenderer.invoke("storage:selectFolder"),
    openFolder: (folderPath) => import_electron.ipcRenderer.invoke("storage:openFolder", folderPath),
    writeText: (filePath, content) => import_electron.ipcRenderer.invoke("storage:writeText", { filePath, content }),
    readText: (filePath) => import_electron.ipcRenderer.invoke("storage:readText", { filePath }),
    readBase64: (filePath) => import_electron.ipcRenderer.invoke("storage:readBase64", { filePath })
  },
  browserView: browserViewAPI,
  reversePlaywright: reversePlaywrightAPI,
  // 🛡️ 崩溃日志 API
  invoke: (channel, ...args) => import_electron.ipcRenderer.invoke(channel, ...args)
});
