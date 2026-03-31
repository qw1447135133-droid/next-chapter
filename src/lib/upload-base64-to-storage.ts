import { getProjectRootPath } from "@/lib/file-cache";
import { compressImage } from "@/lib/image-compress";

const CURRENT_PROJECT_KEY = "storyforge_current_project";

function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch {
    return null;
  }
}

function safeName(value: string): string {
  return value.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 120) || "item";
}

function inferExtension(source: string, mimeType?: string): string {
  if (mimeType?.includes("png")) return ".png";
  if (mimeType?.includes("webp")) return ".webp";
  if (mimeType?.includes("gif")) return ".gif";
  if (mimeType?.includes("mp4")) return ".mp4";

  const lower = source.toLowerCase();
  if (lower.includes(".png")) return ".png";
  if (lower.includes(".webp")) return ".webp";
  if (lower.includes(".gif")) return ".gif";
  if (lower.includes(".mp4")) return ".mp4";
  return ".jpg";
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

async function writeBase64File(filePath: string, base64: string) {
  const writer = window.electronAPI?.jimeng?.writeFile;
  if (!writer) return false;
  const result = await writer(filePath, base64);
  return !!result.ok;
}

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType?: string } | null> {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) return null;
      return { mimeType: match[1], base64: match[2] };
    }

    // 🛡️ Handle file paths via Electron API
    const isFilePath = !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("blob:");
    if (isFilePath && window.electronAPI?.storage?.readBase64) {
      const result = await window.electronAPI.storage.readBase64(url);
      if (result?.ok && result?.base64) {
        return { base64: result.base64, mimeType: result.mimeType };
      }
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();

    // 🛡️ 使用分块处理避免大图像导致内存溢出
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return {
      base64: btoa(binary),
      mimeType: response.headers.get("content-type") || undefined,
    };
  } catch {
    return null;
  }
}

export function buildThumbnailRelativePath(source: string): string {
  return `images/generated/thumbnails/${hashString(source)}.jpg`;
}

export async function readCachedThumbnailDataUrl(
  source: string,
  projectId?: string | null,
): Promise<string | null> {
  const storage = window.electronAPI?.storage;
  if (!storage?.readBase64) return null;

  const resolvedProjectId = projectId || getCurrentProjectId();
  if (!resolvedProjectId) return null;

  const projectRoot = await getProjectRootPath(resolvedProjectId);
  if (!projectRoot) return null;

  const result = await storage.readBase64(
    `${projectRoot}/${buildThumbnailRelativePath(source)}`,
  );
  if (!result.ok || !result.exists || !result.base64) return null;
  return `data:${result.mimeType || "image/jpeg"};base64,${result.base64}`;
}

export async function persistThumbnailToProjectCache(
  source: string,
  projectId?: string | null,
): Promise<boolean> {
  const resolvedProjectId = projectId || getCurrentProjectId();
  if (!resolvedProjectId) return false;

  try {
    const thumbDataUrl = await compressImage(source, 220 * 1024, {
      maxDim: 800,
      minQuality: 0.2,
    });
    return await persistAssetToProjectCache(
      thumbDataUrl,
      buildThumbnailRelativePath(source),
      resolvedProjectId,
    );
  } catch {
    return false;
  }
}

export async function persistAssetToProjectCache(
  source: string,
  relativePath: string,
  projectId?: string | null,
): Promise<boolean> {
  if (!window.electronAPI?.jimeng?.writeFile) return false;
  const resolvedProjectId = projectId || getCurrentProjectId();
  if (!resolvedProjectId) return false;

  const projectRoot = await getProjectRootPath(resolvedProjectId);
  if (!projectRoot) return false;

  const base64Data = await fetchAsBase64(source);
  if (!base64Data?.base64) return false;

  const cleanRelativePath = relativePath.replace(/^[/\\]+/, "");
  return await writeBase64File(`${projectRoot}/${cleanRelativePath}`, base64Data.base64);
}

/**
 * 保证资源已经进入 files/ 缓存。
 * 这里不改变前端继续使用的 URL，只负责尽快将内容落盘，供后续逆向模式和离线排查使用。
 */
export async function ensureStorageUrl(
  dataUrl: string,
  folder: string = "characters",
): Promise<string> {
  const projectId = getCurrentProjectId();
  const isLocalFilePath =
    !!dataUrl &&
    !dataUrl.startsWith("data:") &&
    !dataUrl.startsWith("http://") &&
    !dataUrl.startsWith("https://") &&
    !dataUrl.startsWith("blob:");

  // Already persisted by the Electron-side write path.
  // Re-reading and re-writing the same freshly-generated local file just to
  // "ensure" storage duplicates image decode/compression work and can spike
  // renderer memory right after generation completes.
  if (isLocalFilePath) {
    return dataUrl;
  }

  try {
    const base64Data = await fetchAsBase64(dataUrl);
    if (base64Data?.base64) {
      const ext = inferExtension(dataUrl, base64Data.mimeType);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${timestamp}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      await persistAssetToProjectCache(
        dataUrl,
        `images/generated/${safeName(folder)}/${fileName}`,
        projectId,
      );
      await persistThumbnailToProjectCache(dataUrl, projectId);
    }
  } catch {
    // ignore cache write failures and keep UI responsive
  }

  return dataUrl;
}

export { safeName as safeCacheName };
