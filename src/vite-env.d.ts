/// <reference types="vite/client" />

/**
 * Electron API 类型声明（由 electron/preload.ts 暴露）
 */

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
    writeFile: (
      filePath: string,
      content: string,
    ) => Promise<{ ok: boolean; error?: string }>;
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
