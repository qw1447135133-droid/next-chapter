import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// --- IndexedDB-backed thumbnail cache ---
const DB_NAME = "thumb-cache";
const STORE_NAME = "thumbnails";
const DB_VERSION = 2;
const MAX_CACHE_ENTRIES = 200;

interface CacheEntry {
  url: string;
  usedAt: number;
}

// In-memory layer (fast path)
const memCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

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

interface ImageThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  maxBytes?: number;
  /** Maximum dimension (width/height) for the thumbnail canvas. Default 2048. */
  maxDim?: number;
}

/**
 * Displays a compressed thumbnail (<500KB by default) for base64 images,
 * or the original URL for storage-hosted images.
 * Shows a download button on hover to save the original full-size image.
 */
const ImageThumbnail = ({ src, alt, className = "", maxBytes = 500 * 1024, maxDim = 2048 }: ImageThumbnailProps) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Check memory cache first (sync)
    const mem = memCache.get(src);
    if (mem) {
      setThumbUrl(mem);
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
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);

      const qualities = [0.7, 0.5, 0.35, 0.2, 0.1];
      for (const q of qualities) {
        const result = canvas.toDataURL("image/jpeg", q);
        const size = Math.ceil((result.length - result.indexOf(",") - 1) * 0.75);
        if (size <= maxBytes) {
          setAndCache(result);
          return;
        }
      }

      const small = document.createElement("canvas");
      small.width = Math.round(w * 0.5);
      small.height = Math.round(h * 0.5);
      const sCtx = small.getContext("2d");
      if (!sCtx) return;
      sCtx.drawImage(canvas, 0, 0, small.width, small.height);
      setAndCache(small.toDataURL("image/jpeg", 0.2));
    };

    const doCompress = () => {
      if (cancelled) return;
      if (src.startsWith("data:image")) {
        const byteSize = Math.ceil((src.length - src.indexOf(",") - 1) * 0.75);
        if (byteSize <= maxBytes) {
          setAndCache(src);
          return;
        }
        const img = new Image();
        img.onload = () => compressWithCanvas(img);
        img.src = src;
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => compressWithCanvas(img);
        img.onerror = () => setAndCache(src);
        img.src = src;
      }
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
  }, [src, maxBytes, maxDim]);

  const handleDownload = async () => {
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
        onClick={() => setEnlarged(true)}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt={alt} className={className} />
        ) : (
          <div className={`${className} bg-muted animate-pulse flex items-center justify-center`}>
            <span className="text-xs text-muted-foreground">加载中...</span>
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

      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-1 flex items-center justify-center bg-black/80 border border-border/30">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-50 text-white hover:bg-white/20 h-8 w-8"
            onClick={() => setEnlarged(false)}
          >
            <X className="h-5 w-5" />
          </Button>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[92vh] object-contain cursor-pointer"
            onClick={() => setEnlarged(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageThumbnail;
