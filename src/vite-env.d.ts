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

interface BuiltinApiBundle {
  geminiEndpoint?: string;
  geminiKey?: string;
  jimengEndpoint?: string;
  jimengKey?: string;
  viduEndpoint?: string;
  viduKey?: string;
  klingEndpoint?: string;
  klingKey?: string;
  modelMappings?: Record<string, string>;
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
  };
  runtime: {
    builtinApiBundle: BuiltinApiBundle | null;
    builtinApiBundlePath: string;
    verifyBuiltinApiAdminPassword: (password: string) => Promise<boolean>;
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
  };
  reversePlaywright: {
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
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
