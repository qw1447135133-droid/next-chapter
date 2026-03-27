import { getApiConfig } from "@/pages/Settings";

/**
 * Electron 下解析「缓存文件」根目录：优先用户自定义，否则为默认 program/files。
 * 非 Electron 返回 null。
 */
export async function getResolvedFilesStoragePath(): Promise<string | null> {
  const cfg = getApiConfig().storagePath?.trim();
  if (cfg) return cfg;

  if (
    typeof window !== "undefined" &&
    window.electronAPI?.storage?.getDefaultPath
  ) {
    const p = await window.electronAPI.storage.getDefaultPath();
    return p.files;
  }

  return null;
}
