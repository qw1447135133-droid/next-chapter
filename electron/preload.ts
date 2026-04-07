/**
 * electron/preload.ts
 *
 * 安全桥接：通过 contextBridge 向渲染进程暴露 electronAPI，
 * 仅暴露当前产品仍在使用的最小必要接口。
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

export interface JimengAPI {
  writeFile: (
    filePath: string,
    content: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export interface DreaminaCliAPI {
  exec: (
    args: string[],
    stdin?: string,
  ) => Promise<{
    ok: boolean;
    installed?: boolean;
    path?: string;
    code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
  }>;
}

export interface StorageAPI {
  getDefaultPath: () => Promise<{ files: string; db: string }>;
  selectFolder: () => Promise<string | null>;
  openFolder: (folderPath: string) => Promise<void>;
  openPath: (targetPath: string) => Promise<string>;
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

const dreaminaCliAPI: DreaminaCliAPI = {
  exec: (args, stdin) =>
    ipcRenderer.invoke("dreamina:exec", { args, stdin }),
};

contextBridge.exposeInMainWorld("electronAPI", {
  jimeng: jimengAPI,
  dreaminaCli: dreaminaCliAPI,
  runtime: runtimeAPI,
  storage: {
    getDefaultPath: () => ipcRenderer.invoke("storage:getDefaultPath"),
    selectFolder: () => ipcRenderer.invoke("storage:selectFolder"),
    openFolder: (folderPath: string) =>
      ipcRenderer.invoke("storage:openFolder", folderPath),
    openPath: (targetPath: string) =>
      ipcRenderer.invoke("storage:openPath", targetPath),
    writeText: (filePath: string, content: string) =>
      ipcRenderer.invoke("storage:writeText", { filePath, content }),
    readText: (filePath: string) =>
      ipcRenderer.invoke("storage:readText", { filePath }),
    readBase64: (filePath: string) =>
      ipcRenderer.invoke("storage:readBase64", { filePath }),
  } as StorageAPI,
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args));
  },
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1]);
  },
});
