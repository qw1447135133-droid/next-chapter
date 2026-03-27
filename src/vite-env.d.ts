/// <reference types="vite/client" />

/**
 * Electron API 类型声明（由 electron/preload.ts 暴露）
 */

interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserViewState {
  visible: boolean;
  url?: string;
  title?: string;
  loading: boolean;
  error?: string;
}

interface ElectronAPI {
  jimeng: {
    start: () => Promise<{
      ok: boolean;
      status: string;
      apiBase?: string;
      logs: string[];
    }>;
    stop: () => Promise<{ ok: boolean }>;
    status: () => Promise<{
      status: string;
      apiBase?: string;
      message?: string;
      logs?: string[];
    }>;
    getApiBase: () => Promise<string | null>;
    openSetup: () => Promise<{ ok: boolean }>;
    openBrowserData: () => Promise<void>;
    writeFile: (
      filePath: string,
      content: string,
    ) => Promise<{ ok: boolean; error?: string }>;
    prepareXlsx: (params: {
      episodeLabel: string;
      base64Content: string;
      xlsxName: string;
      storageRoot?: string;
    }) => Promise<{
      ok: boolean;
      workDir?: string;
      episodeDir?: string;
      xlsxFile?: string;
      error?: string;
    }>;
    onStatusChange: (callback: (status: any) => void) => () => void;
  };
  storage: {
    getDefaultPath: () => Promise<{ files: string; db: string }>;
    selectFolder: () => Promise<string | null>;
    openFolder: (folderPath: string) => Promise<void>;
  };
  browserView: {
    create: (params?: { url?: string; bounds?: BrowserViewBounds }) => Promise<{
      ok: boolean;
      id: string;
      state: BrowserViewState;
    }>;
    navigate: (url: string) => Promise<{ ok: boolean; state: BrowserViewState }>;
    setBounds: (bounds: BrowserViewBounds) => Promise<{ ok: boolean }>;
    show: () => Promise<{ ok: boolean; state: BrowserViewState }>;
    hide: () => Promise<{ ok: boolean; state: BrowserViewState }>;
    getState: () => Promise<BrowserViewState>;
    execute: <T>(params: { script: string; args?: unknown[] }) => Promise<{
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
    close: () => Promise<{ ok: boolean }>;
    setIgnoreMouseEvents: (ignore: boolean) => Promise<{ ok: boolean }>;
    onStateChange: (callback: (state: BrowserViewState) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
