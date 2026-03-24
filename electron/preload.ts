/**
 * electron/preload.ts
 *
 * 安全桥接：通过 contextBridge 向渲染进程暴露 electronAPI，
 * 仅暴露最小必要接口。
 */

import { contextBridge, ipcRenderer } from "electron";

export interface JimengStatus {
  status: "stopped" | "starting" | "running" | "error";
  apiBase?: string;
  message?: string;
  logs?: string[];
}

export interface JimengAPI {
  /** 启动即梦 Python 服务 */
  start: () => Promise<{ ok: boolean; status: string; apiBase?: string; logs: string[] }>;
  /** 停止服务 */
  stop: () => Promise<{ ok: boolean }>;
  /** 查询当前状态 */
  status: () => Promise<JimengStatus>;
  /** 获取 API 地址（仅服务运行时有效） */
  getApiBase: () => Promise<string | null>;
  /** 打开即梦登录页（首次授权用） */
  openSetup: () => Promise<{ ok: boolean }>;
  /** 打开浏览器数据目录 */
  openBrowserData: () => Promise<void>;
  /** 写入文件到系统目录（content 为 base64 字符串） */
  writeFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
  /** 写入 xlsx 并准备即梦目录结构，返回 workDir / episodeDir / xlsxFile */
  prepareXlsx: (params: { episodeLabel: string; base64Content: string; xlsxName: string }) =>
    Promise<{ ok: boolean; workDir?: string; episodeDir?: string; xlsxFile?: string; error?: string }>;
  /** 监听服务状态变化 */
  onStatusChange: (callback: (status: JimengStatus) => void) => () => void;
}

export interface StorageAPI {
  /** 获取默认存储路径 */
  getDefaultPath: () => Promise<{ files: string; db: string }>;
  /** 打开文件夹选择对话框 */
  selectFolder: () => Promise<string | null>;
  /** 用系统文件管理器打开指定文件夹 */
  openFolder: (folderPath: string) => Promise<void>;
}

const jimengAPI: JimengAPI = {
  start: () => ipcRenderer.invoke("jimeng:start"),
  stop: () => ipcRenderer.invoke("jimeng:stop"),
  status: () => ipcRenderer.invoke("jimeng:status"),
  getApiBase: () => ipcRenderer.invoke("jimeng:getApiBase"),
  openSetup: () => ipcRenderer.invoke("jimeng:openSetup"),
  openBrowserData: () => ipcRenderer.invoke("jimeng:openBrowserData"),
  writeFile: (filePath, content) => ipcRenderer.invoke("jimeng:writeFile", { filePath, content }),
  prepareXlsx: (params) => ipcRenderer.invoke("jimeng:prepareXlsx", params),
  onStatusChange: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, status: JimengStatus) => callback(status);
    ipcRenderer.on("jimeng:status", handler);
    return () => { ipcRenderer.removeListener("jimeng:status", handler); };
  },
};

contextBridge.exposeInMainWorld("electronAPI", {
  jimeng: jimengAPI,
  storage: {
    getDefaultPath: () => ipcRenderer.invoke("storage:getDefaultPath"),
    selectFolder: () => ipcRenderer.invoke("storage:selectFolder"),
    openFolder: (folderPath: string) => ipcRenderer.invoke("storage:openFolder", folderPath),
  } as StorageAPI,
});
