var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function getEmbeddedBuiltinApiBundlePath() {
  if (process.defaultApp) {
    return import_node_path.default.resolve(__dirname, "..", "config", "builtin-api.json");
  }
  return import_node_path.default.join(process.resourcesPath, "config", "builtin-api.json");
}
function getPortableBuiltinApiBundlePath() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!portableDir) return null;
  return import_node_path.default.join(portableDir, "config", "builtin-api.json");
}
function getBuiltinApiBundlePath() {
  return getPortableBuiltinApiBundlePath() || getEmbeddedBuiltinApiBundlePath();
}
function getBuiltinApiBundleCandidatePaths() {
  const portablePath = getPortableBuiltinApiBundlePath();
  const embeddedPath = getEmbeddedBuiltinApiBundlePath();
  return portablePath ? [portablePath, embeddedPath] : [embeddedPath];
}
function readBuiltinApiBundle() {
  for (const filePath of getBuiltinApiBundleCandidatePaths()) {
    if (!import_node_fs.default.existsSync(filePath)) continue;
    try {
      return JSON.parse(import_node_fs.default.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
  }
  return null;
}
var builtinApiBundle = readBuiltinApiBundle();
var builtinApiBundlePath = getBuiltinApiBundlePath();
var runtimeAPI = {
  builtinApiBundle,
  builtinApiBundlePath,
  verifyBuiltinApiAdminPassword: (password) => import_electron.ipcRenderer.invoke("runtime:verifyBuiltinApiAdminPassword", password)
};
var jimengAPI = {
  writeFile: (filePath, content) => import_electron.ipcRenderer.invoke("jimeng:writeFile", { filePath, content })
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
  runtime: runtimeAPI,
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
