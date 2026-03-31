import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { readCachedThumbnailDataUrl } from "@/lib/upload-base64-to-storage";

// --- IndexedDB-backed thumbnail cache ---
const DB_NAME = "thumb-cache";
const STORE_NAME = "thumbnails";
const DB_VERSION = 2;
const MAX_CACHE_ENTRIES = 200;
const ELECTRON_LARGE_DATA_URL_LIMIT = 1024 * 1024;

// 🛡️ 防止内存溢出：限制同时处理的图片数量
const MAX_CONCURRENT_COMPRESSIONS = 5; // 增加并发数以处理多图像生成
let activeCompressions = 0;
const compressionQueue: Array<() => void> = [];

// 🛡️ 为超大图像（如 Gemini 2K/4K）添加更激进的压缩策略
const LARGE_IMAGE_THRESHOLD = 2 * 1024 * 1024; // 2MB
const AGGRESSIVE_MAX_DIM = 600; // 超大图像的最大尺寸
const AGGRESSIVE_MAX_BYTES = 300 * 1024; // 超大图像的最大字节数
const COMPRESSION_TIMEOUT = 10000; // 10秒超时，防止大图像压缩时间过长

function queueCompression(fn: () => void) {
  if (activeCompressions < MAX_CONCURRENT_COMPRESSIONS) {
    activeCompressions++;
    fn();
  } else {
    compressionQueue.push(fn);
  }
}

function finishCompression() {
  activeCompressions--;
  const next = compressionQueue.shift();
  if (next) {
    activeCompressions++;
    next();
  }
}

interface CacheEntry {
  url: string;
  usedAt: number;
}

// In-memory layer (fast path)
const memCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDataUrlByteSize(src: string): number {
  return Math.ceil((src.length - src.indexOf(",") - 1) * 0.75);
}

function isLocalFilePath(src: string): boolean {
  return !!src &&
    !src.startsWith("data:") &&
    !src.startsWith("http://") &&
    !src.startsWith("https://") &&
    !src.startsWith("blob:");
}

export async function downloadImageSource(src: string, fallbackName: string) {
  if (src.startsWith("data:")) {
    const link = document.createElement("a");
    link.href = src;
    const ext = src.startsWith("data:image/png") ? "png" : "jpg";
    link.download = `${fallbackName}.${ext}`;
    link.click();
    return;
  }

  const electronStorage = (window as any).electronAPI?.storage;
  if (isLocalFilePath(src) && electronStorage?.readBase64) {
    const result = await electronStorage.readBase64(src);
    if (result?.ok && result?.base64) {
      const ext =
        result.mimeType === "image/png"
          ? "png"
          : result.mimeType === "image/webp"
            ? "webp"
            : result.mimeType === "image/gif"
              ? "gif"
              : "jpg";
      const link = document.createElement("a");
      link.href = `data:${result.mimeType || "image/jpeg"};base64,${result.base64}`;
      link.download = `${fallbackName}.${ext}`;
      link.click();
      return;
    }
  }

  const resp = await fetch(src);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const ext = src.includes(".png") ? "png" : "jpg";
  link.download = `${fallbackName}.${ext}`;
  link.click();
  URL.revokeObjectURL(url);
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop old v1 store if exists
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME);
      store.createIndex("usedAt", "usedAt", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<string | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (entry) {
          // Update usedAt (mark as recently used)
          store.put({ url: entry.url, usedAt: Date.now() }, key);
          resolve(entry.url);
        } else {
          resolve(undefined);
        }
      };
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ url: value, usedAt: Date.now() } as CacheEntry, key);

    // Evict oldest entries if over limit
    const countReq = store.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total <= MAX_CACHE_ENTRIES) return;
      const toDelete = total - MAX_CACHE_ENTRIES;
      const idx = store.index("usedAt");
      const cursorReq = idx.openCursor(); // ascending by usedAt
      let deleted = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && deleted < toDelete) {
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        }
      };
    };
  } catch {
    // silently ignore storage errors
  }
}

/**
 * Pre-warm the thumbnail cache for a given image URL.
 * Call this after generation so that when the user switches tabs the thumbnail is already ready.
 */
export function prewarmThumbnail(src: string, maxDim = 800, maxBytes = 500 * 1024): void {
  if (!src) return;
  // Already cached
  if (memCache.has(src)) return;
  const isElectronRenderer = typeof window !== "undefined" && !!(window as any).electronAPI?.storage;
  const localFilePath = isLocalFilePath(src);

  // Avoid eagerly decoding freshly-saved local files in Electron.
  // The visible component can load/compress them on demand, but prewarming here
  // duplicates the just-generated image in memory and can spike renderer usage.
  if (isElectronRenderer && localFilePath) {
    console.log("⏭️ [prewarmThumbnail] Skip eager prewarm for local file path:", src);
    return;
  }

  // 🛡️ 检测超大图像（如 Gemini 2K/4K）并使用更激进的压缩参数
  const imageSize = getDataUrlByteSize(src);
  const isLargeImage = imageSize > LARGE_IMAGE_THRESHOLD;
  if (isLargeImage) {
    console.log(`🔍 检测到超大图像 (${(imageSize / 1024 / 1024).toFixed(2)}MB)，使用激进压缩策略`);
    maxDim = AGGRESSIVE_MAX_DIM;
    maxBytes = AGGRESSIVE_MAX_BYTES;
  }

  const isLargeElectronDataUrl =
    isElectronRenderer &&
    src.startsWith("data:image") &&
    imageSize > ELECTRON_LARGE_DATA_URL_LIMIT;
  if (isLargeElectronDataUrl) {
    return;
  }

  // 🛡️ For local file paths, use Electron API then compress the result
  if (localFilePath) {
    const electronStorage = (window as any).electronAPI?.storage;
    if (electronStorage?.readBase64) {
      queueCompression(() => {
        electronStorage.readBase64(src).then((result: any) => {
          if (!result?.ok || !result?.base64 || !result?.mimeType) {
            finishCompression();
            return;
          }
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          const byteSize = getDataUrlByteSize(dataUrl);
          if (byteSize <= maxBytes) {
            memCache.set(src, dataUrl);
            idbSet(src, dataUrl);
            finishCompression();
            return;
          }
          // Too large — compress via canvas
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              let w = img.width, h = img.height;
              if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio); h = Math.round(h * ratio);
              }
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext("2d");
              if (!ctx) { finishCompression(); return; }
              ctx.drawImage(img, 0, 0, w, h);
              for (const q of [0.7, 0.5, 0.35, 0.2, 0.1]) {
                const res = canvas.toDataURL("image/jpeg", q);
                if (getDataUrlByteSize(res) <= maxBytes) {
                  memCache.set(src, res); idbSet(src, res);
                  finishCompression(); return;
                }
              }
              const small = document.createElement("canvas");
              small.width = Math.round(w * 0.5); small.height = Math.round(h * 0.5);
              const sCtx = small.getContext("2d");
              if (sCtx) { sCtx.drawImage(canvas, 0, 0, small.width, small.height); }
              const res = (sCtx ? small : canvas).toDataURL("image/jpeg", 0.2);
              memCache.set(src, res); idbSet(src, res);
              finishCompression();
            } catch { finishCompression(); }
          };
          img.onerror = () => finishCompression();
          img.src = dataUrl;
        }).catch(() => finishCompression());
      });
    }
    return;
  }

  // 🛡️ 包裹在 try-catch 中防止崩溃
  try {
    // 🛡️ 使用队列防止同时压缩太多图片
    queueCompression(() => {
      // 🛡️ 添加超时机制防止大图像压缩时间过长
      let timeoutId: NodeJS.Timeout | null = null;
      let completed = false;

      const safeFinish = () => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);
        finishCompression();
      };

      timeoutId = setTimeout(() => {
        console.warn(`⏱️ 图像压缩超时 (${COMPRESSION_TIMEOUT}ms)，跳过该图像`);
        safeFinish();
      }, COMPRESSION_TIMEOUT);

      // Check IDB, then compress if miss
      idbGet(src).then((cached) => {
        if (completed) return;
        if (cached) {
          memCache.set(src, cached);
          safeFinish();
          return;
        }
        const img = new Image();

        // 🛡️ 只对 HTTP/HTTPS URL 设置 crossOrigin，本地文件路径不设置
        if (src.startsWith('http://') || src.startsWith('https://')) {
          img.crossOrigin = "anonymous";
        }

        img.onload = () => {
          if (completed) return;
          try {
            const canvas = document.createElement("canvas");
            let w = img.width;
            let h = img.height;

            // 🛡️ 对超大图像使用更激进的缩放
            const targetMaxDim = isLargeImage ? AGGRESSIVE_MAX_DIM : maxDim;
            const targetMaxBytes = isLargeImage ? AGGRESSIVE_MAX_BYTES : maxBytes;

            if (w > targetMaxDim || h > targetMaxDim) {
              const ratio = Math.min(targetMaxDim / w, targetMaxDim / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              safeFinish();
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);

            // 🛡️ 对超大图像使用更低的质量参数
            const qualities = isLargeImage ? [0.5, 0.35, 0.2, 0.1, 0.05] : [0.7, 0.5, 0.35, 0.2, 0.1];
            for (const q of qualities) {
              const result = canvas.toDataURL("image/jpeg", q);
              const size = Math.ceil((result.length - result.indexOf(",") - 1) * 0.75);
              if (size <= targetMaxBytes) {
                memCache.set(src, result);
                idbSet(src, result);
                safeFinish();
                return;
              }
            }
            const small = document.createElement("canvas");
            small.width = Math.round(w * 0.5);
            small.height = Math.round(h * 0.5);
            const sCtx = small.getContext("2d");
            if (!sCtx) {
              safeFinish();
              return;
            }
            sCtx.drawImage(canvas, 0, 0, small.width, small.height);
            const result = small.toDataURL("image/jpeg", 0.2);
            memCache.set(src, result);
            idbSet(src, result);
            safeFinish();
          } catch (err) {
            console.error('🔥 prewarmThumbnail 压缩失败:', err);
            // 保存错误到崩溃日志
            try {
              const crashLog = {
                type: 'prewarmThumbnail',
                timestamp: new Date().toISOString(),
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
                src: src.substring(0, 100), // 只保存前100个字符
                imageSize: imageSize,
                isLargeImage: isLargeImage
              };
              const logs = JSON.parse(localStorage.getItem('crash-logs') || '[]');
              logs.unshift(crashLog);
              if (logs.length > 50) logs.length = 50;
              localStorage.setItem('crash-logs', JSON.stringify(logs, null, 2));
            } catch {}
            safeFinish();
          }
        };
        img.onerror = (err) => {
          if (completed) return;
          console.error('🔥 prewarmThumbnail 图片加载失败:', err);
          memCache.set(src, src);
          safeFinish();
        };
        img.src = src;
      }).catch((err) => {
        if (completed) return;
        console.error('🔥 prewarmThumbnail idbGet 失败:', err);
        safeFinish();
      });
    });
  } catch (err) {
    console.error('🔥 prewarmThumbnail 外层错误:', err);
    // 保存错误到崩溃日志
    try {
      const crashLog = {
        type: 'prewarmThumbnail-outer',
        timestamp: new Date().toISOString(),
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      };
      const logs = JSON.parse(localStorage.getItem('crash-logs') || '[]');
      logs.unshift(crashLog);
      if (logs.length > 50) logs.length = 50;
      localStorage.setItem('crash-logs', JSON.stringify(logs, null, 2));
    } catch {}
  }
}

interface ImageThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  maxBytes?: number;
  /** Maximum dimension (width/height) for the thumbnail canvas. Default 800. */
  maxDim?: number;
}

/**
 * Displays a compressed thumbnail (<500KB by default) for base64 images,
 * or the original URL for storage-hosted images.
 * Shows a download button on hover to save the original full-size image.
 */
const ImageThumbnail = ({ src, alt, className = "", maxBytes = 500 * 1024, maxDim = 800 }: ImageThumbnailProps) => {
  const isElectronRenderer = typeof window !== "undefined" && !!(window as any).electronAPI?.storage;
  const localFilePath = isLocalFilePath(src);

  // 🛡️ 检测超大图像并调整压缩参数
  const imageSize = src ? getDataUrlByteSize(src) : 0;
  const isLargeImage = imageSize > LARGE_IMAGE_THRESHOLD;
  if (isLargeImage) {
    maxDim = AGGRESSIVE_MAX_DIM;
    maxBytes = AGGRESSIVE_MAX_BYTES;
  }

  // Check mem cache synchronously for instant display; otherwise null (skeleton)
  const initialThumb = src ? memCache.get(src) ?? null : null;
  // For small base64 images, show immediately
  const isSmallBase64 = src?.startsWith("data:image") &&
    imageSize <= maxBytes;
  const shouldSkipLargeElectronDataUrl =
    !!src &&
    isElectronRenderer &&
    src.startsWith("data:image") &&
    imageSize > ELECTRON_LARGE_DATA_URL_LIMIT;
  
  const [thumbUrl, setThumbUrl] = useState<string | null>(
    initialThumb ?? (isSmallBase64 && !shouldSkipLargeElectronDataUrl ? src : null),
  );
  const [hovered, setHovered] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    if (!src) { setThumbUrl(null); return; }

    let cancelled = false;

    // Check memory cache first (sync)
    const mem = memCache.get(src);
    if (mem) {
      setThumbUrl(mem);
      return;
    }

    if (isElectronRenderer && localFilePath) {
      setThumbUrl(null);

      let attempts = 0;
      const maxAttempts = 12;
      const retryDelayMs = 250;

      const loadCachedThumb = async () => {
        const cachedThumb = await readCachedThumbnailDataUrl(src);
        if (cancelled) return;
        if (cachedThumb) {
          memCache.set(src, cachedThumb);
          setThumbUrl(cachedThumb);
          return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(() => {
            if (!cancelled) void loadCachedThumb();
          }, retryDelayMs);
        }
      };

      void loadCachedThumb();
      return;
    }

    if (shouldSkipLargeElectronDataUrl) {
      setThumbUrl(null);

      let attempts = 0;
      const maxAttempts = 8;
      const retryDelayMs = 350;

      const loadCachedThumb = async () => {
        const cachedThumb = await readCachedThumbnailDataUrl(src);
        if (cancelled) return;
        if (cachedThumb) {
          memCache.set(src, cachedThumb);
          setThumbUrl(cachedThumb);
          return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(() => {
            if (!cancelled) void loadCachedThumb();
          }, retryDelayMs);
        }
      };

      void loadCachedThumb();
      return;
    }

    // Small base64 — already showing
    if (isSmallBase64) {
      memCache.set(src, src);
      idbSet(src, src);
      return;
    }

    const setAndCache = (url: string) => {
      if (cancelled) return;
      memCache.set(src, url);
      idbSet(src, url);
      setThumbUrl(url);
    };

    // Helper: compress via canvas and update thumbUrl
    const compressWithCanvas = (img: HTMLImageElement) => {
      try {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finishCompression();
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        // 🛡️ 对超大图像使用更低的质量参数
        const qualities = isLargeImage ? [0.5, 0.35, 0.2, 0.1, 0.05] : [0.7, 0.5, 0.35, 0.2, 0.1];
        for (const q of qualities) {
          const result = canvas.toDataURL("image/jpeg", q);
          const size = getDataUrlByteSize(result);
          if (size <= maxBytes) {
            setAndCache(result);
            finishCompression();
            return;
          }
        }

        const small = document.createElement("canvas");
        small.width = Math.round(w * 0.5);
        small.height = Math.round(h * 0.5);
        const sCtx = small.getContext("2d");
        if (!sCtx) {
          finishCompression();
          return;
        }
        sCtx.drawImage(canvas, 0, 0, small.width, small.height);
        setAndCache(small.toDataURL("image/jpeg", 0.2));
        finishCompression();
      } catch (err) {
        console.error('Canvas 压缩失败:', err);
        // 🛡️ 保存错误到崩溃日志
        try {
          const crashLog = {
            type: 'compressWithCanvas',
            timestamp: new Date().toISOString(),
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            imageSize: imageSize,
            isLargeImage: isLargeImage,
            imgWidth: img.width,
            imgHeight: img.height
          };
          const logs = JSON.parse(localStorage.getItem('crash-logs') || '[]');
          logs.unshift(crashLog);
          if (logs.length > 50) logs.length = 50;
          localStorage.setItem('crash-logs', JSON.stringify(logs, null, 2));
        } catch {}
        // 降级：直接使用原图
        if (!cancelled) setThumbUrl(src);
        finishCompression();
      }
    };

    const doCompress = () => {
      if (cancelled) {
        return;
      }

      queueCompression(() => {
        if (cancelled) {
          finishCompression();
          return;
        }

        if (src.startsWith("data:image")) {
          const img = new Image();
          img.onload = () => compressWithCanvas(img);
          img.onerror = (err) => {
            console.error('🔥 图片加载失败 (data:image):', err);
            if (!cancelled) setThumbUrl(src);
            finishCompression();
          };
          img.src = src;
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          // HTTP/HTTPS URL — fetch via Image element with CORS
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => compressWithCanvas(img);
          img.onerror = (err) => {
            console.error('🔥 图片加载失败:', src, err);
            if (!cancelled) setThumbUrl(src);
            finishCompression();
          };
          img.src = src;
        } else {
          // 🛡️ Local file path — read via Electron API to avoid canvas taint/CORS crash
          // Then compress the resulting data URL via canvas (same pipeline as data: URLs)
          const electronStorage = (window as any).electronAPI?.storage;
          if (electronStorage?.readBase64) {
            electronStorage.readBase64(src).then((result: any) => {
              if (cancelled) { finishCompression(); return; }
              if (result?.ok && result?.base64 && result?.mimeType) {
                const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
                // Check if already small enough
                const byteSize = getDataUrlByteSize(dataUrl);
                if (byteSize <= maxBytes) {
                  setAndCache(dataUrl);
                  finishCompression();
                  return;
                }
                // Too large — compress via canvas
                const img = new Image();
                img.onload = () => compressWithCanvas(img);
                img.onerror = () => { setAndCache(dataUrl); finishCompression(); };
                img.src = dataUrl;
              } else {
                // File not found or error — just skip, don't crash
                finishCompression();
              }
            }).catch(() => {
              finishCompression();
            });
          } else {
            // No Electron API — skip, can't load local files safely
            finishCompression();
          }
        }
      });
    };

    // Check IndexedDB (async), then compress if miss
    idbGet(src).then((cached) => {
      if (cancelled) return;
      if (cached) {
        memCache.set(src, cached);
        setThumbUrl(cached);
      } else {
        doCompress();
      }
    });

    return () => { cancelled = true; };
  }, [src, maxBytes, maxDim, isSmallBase64, shouldSkipLargeElectronDataUrl, isElectronRenderer, localFilePath]);

  const handleDownload = async () => {
    try {
      await downloadImageSource(src, alt || "image");
      return;
    } catch {
      if (!isLocalFilePath(src)) {
        window.open(src, "_blank");
      }
      return;
    }

    if (src.startsWith("data:")) {
      // Legacy base64 download
      const link = document.createElement("a");
      link.href = src;
      const ext = src.startsWith("data:image/png") ? "png" : "jpg";
      link.download = `${alt || "image"}.${ext}`;
      link.click();
    } else {
      // Storage URL download — fetch as blob
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const ext = src.includes(".png") ? "png" : "jpg";
        link.download = `${alt || "image"}.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        window.open(src, "_blank");
      }
    }
  };

  return (
    <>
      <div
        className="relative cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (shouldSkipLargeElectronDataUrl) return;
          setEnlarged(true);
        }}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt={alt} className={className} />
        ) : (
          <div className={`${className} bg-muted animate-pulse flex items-center justify-center`}>
            <span className="text-xs text-muted-foreground">
              {shouldSkipLargeElectronDataUrl ? "大图预览已省略" : "加载中..."}
            </span>
          </div>
        )}
        {hovered && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 opacity-90 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            title="下载原图"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={enlarged && !shouldSkipLargeElectronDataUrl} onOpenChange={setEnlarged}>
        <DialogContent
          className="h-screen w-screen max-w-none border-0 bg-black/85 p-0 shadow-none"
          onClick={() => setEnlarged(false)}
        >
          <DialogTitle className="sr-only">{alt || "图片预览"}</DialogTitle>
          <DialogDescription className="sr-only">
            查看图片的大图预览。
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-50 text-white hover:bg-white/20 h-8 w-8"
            onClick={(event) => {
              event.stopPropagation();
              setEnlarged(false);
            }}
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex h-full w-full items-center justify-center p-4">
            <img
              src={localFilePath ? (thumbUrl || "") : src}
              alt={alt}
              className="max-h-[92vh] max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageThumbnail;
