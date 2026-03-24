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
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
const jimengAPI = {
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
import_electron.contextBridge.exposeInMainWorld("electronAPI", { jimeng: jimengAPI });
