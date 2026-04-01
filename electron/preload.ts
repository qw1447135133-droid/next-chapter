/**
 * electron/preload.ts
 *
 * 安全桥接：通过 contextBridge 向渲染进程暴露 electronAPI，
 * 仅暴露最小必要接口。
 */

import { contextBridge, ipcRenderer } from "electron";
import fs from "node:fs";
import path from "node:path";

type BuiltinApiBundle = {
  geminiEndpoint?: string;
  geminiKey?: string;
  gptEndpoint?: string;
  gptKey?: string;
  claudeEndpoint?: string;
  claudeKey?: string;
  grokEndpoint?: string;
  grokKey?: string;
  seedreamEndpoint?: string;
  seedreamKey?: string;
  jimengEndpoint?: string;
  jimengKey?: string;
  tuziEndpoint?: string;
  tuziKey?: string;
  modelMappings?: Record<string, string>;
};

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserViewState {
  visible: boolean;
  url?: string;
  title?: string;
  loading: boolean;
  error?: string;
}

export interface JimengAPI {
  /** 写入文件到系统目录（content 为 base64 字符串） */
  writeFile: (
    filePath: string,
    content: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export interface StorageAPI {
  /** 获取默认存储路径 */
  getDefaultPath: () => Promise<{ files: string; db: string }>;
  /** 打开文件夹选择对话框 */
  selectFolder: () => Promise<string | null>;
  /** 用系统文件管理器打开指定文件夹 */
  openFolder: (folderPath: string) => Promise<void>;
  writeText: (
    filePath: string,
    content: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readText: (filePath: string) => Promise<{
    ok: boolean;
    exists?: boolean;
    content?: string;
    error?: string;
  }>;
  readBase64: (filePath: string) => Promise<{
    ok: boolean;
    exists?: boolean;
    base64?: string;
    mimeType?: string;
    error?: string;
  }>;
}

export interface BrowserViewAPI {
  create: (params: { url?: string; bounds?: BrowserViewBounds }) => Promise<{
    ok: boolean;
    id: string;
    state: BrowserViewState;
  }>;
  navigate: (url: string) => Promise<{ ok: boolean; state: BrowserViewState }>;
  setBounds: (bounds: BrowserViewBounds) => Promise<{ ok: boolean }>;
  show: () => Promise<{ ok: boolean; state: BrowserViewState }>;
  hide: () => Promise<{ ok: boolean; state: BrowserViewState }>;
  getState: () => Promise<BrowserViewState>;
  execute: <T>(params: { script: string; data?: unknown; args?: unknown[] }) => Promise<{
    ok: boolean;
    result?: T;
    error?: string;
  }>;
  capture: () => Promise<{
    ok: boolean;
    base64?: string;
    mimeType?: string;
    error?: string;
  }>;
  setFileInputFiles: (params: {
    selector?: string;
    index?: number;
    files: Array<{ fileName: string; dataUrl: string }>;
  }) => Promise<{
    ok: boolean;
    count?: number;
    selector?: string;
    index?: number;
    error?: string;
  }>;
  sendInputEvents: (events: Array<{
    type: string;
    keyCode?: string;
    modifiers?: string[];
    x?: number;
    y?: number;
    button?: string;
    clickCount?: number;
  }>) => Promise<{ ok: boolean; error?: string }>;
  download: (params: {
    savePath: string;
    script?: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean; savePath?: string; url?: string; error?: string }>;
  close: () => Promise<{ ok: boolean }>;
  setIgnoreMouseEvents: (ignore: boolean) => Promise<{ ok: boolean }>;
  onStateChange: (callback: (state: BrowserViewState) => void) => () => void;
}

export interface ReversePlaywrightAPI {
  runSegments: (params: {
    url: string;
    model: string;
    duration: string;
    aspectRatio?: string;
    segments: Array<{
      segmentKey: string;
      prompt: string;
      refs: Array<{ fileName: string; url?: string; dataUrl?: string }>;
    }>;
    headless?: boolean;
  }) => Promise<{
    ok: boolean;
    logs: string[];
    currentModel?: string;
    currentDuration?: string;
    screenshotBase64?: string;
    error?: string;
    segments?: Array<{
      segmentKey: string;
      ok: boolean;
      uploadedCount?: number;
      promptLength?: number;
      error?: string;
    }>;
  }>;
  prepareSegment: (params: {
    url: string;
    model: string;
    duration: string;
    aspectRatio?: string;
    prompt: string;
    refs: Array<{ fileName: string; url?: string; dataUrl?: string }>;
    headless?: boolean;
  }) => Promise<{
    ok: boolean;
    logs: string[];
    currentModel?: string;
    currentDuration?: string;
    uploadedCount?: number;
    promptLength?: number;
    screenshotBase64?: string;
    error?: string;
  }>;
  capture: () => Promise<{ ok: boolean; base64?: string; error?: string }>;
  close: () => Promise<{ ok: boolean }>;
}

export interface RuntimeAPI {
  builtinApiBundle: BuiltinApiBundle | null;
  builtinApiBundlePath: string;
  verifyBuiltinApiAdminPassword: (password: string) => Promise<boolean>;
}

function getEmbeddedBuiltinApiBundlePath(): string {
  if (process.defaultApp) {
    return path.resolve(__dirname, "..", "config", "builtin-api.json");
  }
  return path.join(process.resourcesPath, "config", "builtin-api.json");
}

function getPortableBuiltinApiBundlePath(): string | null {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!portableDir) return null;
  return path.join(portableDir, "config", "builtin-api.json");
}

function getBuiltinApiBundlePath(): string {
  return getPortableBuiltinApiBundlePath() || getEmbeddedBuiltinApiBundlePath();
}

function getBuiltinApiBundleCandidatePaths(): string[] {
  const portablePath = getPortableBuiltinApiBundlePath();
  const embeddedPath = getEmbeddedBuiltinApiBundlePath();
  return portablePath ? [portablePath, embeddedPath] : [embeddedPath];
}

function readBuiltinApiBundle(): BuiltinApiBundle | null {
  for (const filePath of getBuiltinApiBundleCandidatePaths()) {
    if (!fs.existsSync(filePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as BuiltinApiBundle;
    } catch {
      continue;
    }
  }
  return null;
}

const builtinApiBundle = readBuiltinApiBundle();
const builtinApiBundlePath = getBuiltinApiBundlePath();
const runtimeAPI: RuntimeAPI = {
  builtinApiBundle,
  builtinApiBundlePath,
  verifyBuiltinApiAdminPassword: (password: string) =>
    ipcRenderer.invoke("runtime:verifyBuiltinApiAdminPassword", password),
};

const jimengAPI: JimengAPI = {
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("jimeng:writeFile", { filePath, content }),
};

const browserViewAPI: BrowserViewAPI = {
  create: (params) => ipcRenderer.invoke("browserView:create", params),
  navigate: (url) => ipcRenderer.invoke("browserView:navigate", { url }),
  setBounds: (bounds) => ipcRenderer.invoke("browserView:setBounds", bounds),
  show: () => ipcRenderer.invoke("browserView:show"),
  hide: () => ipcRenderer.invoke("browserView:hide"),
  getState: () => ipcRenderer.invoke("browserView:getState"),
  execute: (params) => ipcRenderer.invoke("browserView:execute", params),
  capture: () => ipcRenderer.invoke("browserView:capture"),
  setFileInputFiles: (params) =>
    ipcRenderer.invoke("browserView:setFileInputFiles", params),
  sendInputEvents: (events) =>
    ipcRenderer.invoke("browserView:sendInputEvents", { events }),
  download: (params) => ipcRenderer.invoke("browserView:download", params),
  close: () => ipcRenderer.invoke("browserView:close"),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.invoke("browserView:setIgnoreMouseEvents", ignore),
  onStateChange: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, state: BrowserViewState) =>
      callback(state);
    ipcRenderer.on("browserView:state", handler);
    return () => {
      ipcRenderer.removeListener("browserView:state", handler);
    };
  },
};

const reversePlaywrightAPI: ReversePlaywrightAPI = {
  runSegments: (params) =>
    ipcRenderer.invoke("reversePlaywright:runSegments", params),
  prepareSegment: (params) =>
    ipcRenderer.invoke("reversePlaywright:prepareSegment", params),
  capture: () => ipcRenderer.invoke("reversePlaywright:capture"),
  close: () => ipcRenderer.invoke("reversePlaywright:close"),
};

contextBridge.exposeInMainWorld("electronAPI", {
  jimeng: jimengAPI,
  runtime: runtimeAPI,
  storage: {
    getDefaultPath: () => ipcRenderer.invoke("storage:getDefaultPath"),
    selectFolder: () => ipcRenderer.invoke("storage:selectFolder"),
    openFolder: (folderPath: string) =>
      ipcRenderer.invoke("storage:openFolder", folderPath),
    writeText: (filePath: string, content: string) =>
      ipcRenderer.invoke("storage:writeText", { filePath, content }),
    readText: (filePath: string) =>
      ipcRenderer.invoke("storage:readText", { filePath }),
    readBase64: (filePath: string) =>
      ipcRenderer.invoke("storage:readBase64", { filePath }),
  } as StorageAPI,
  browserView: browserViewAPI,
  reversePlaywright: reversePlaywrightAPI,
  // 🛡️ 崩溃日志 API
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
});
