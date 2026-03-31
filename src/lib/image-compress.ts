/**
 * Compress an image (base64 data-url or regular URL) to be under the given maxBytes (default 10 MB).
 * Uses canvas to re-encode at progressively lower quality.
 * Returns a compressed data-url string.
 */
export async function compressImage(
  imageSource: string,
  maxBytes: number = 10 * 1024 * 1024,
  { maxDim = 1024, minQuality = 0.2 }: { maxDim?: number; minQuality?: number } = {}
): Promise<string> {
  // For data URLs, check size directly
  if (imageSource.startsWith("data:image")) {
    const byteSize = Math.ceil((imageSource.length - imageSource.indexOf(",") - 1) * 0.75);
    if (byteSize <= maxBytes) return imageSource;
  }

  // 🛡️ For local file paths, read via Electron API first to get a safe data URL
  const isLocalFilePath = !imageSource.startsWith("data:") && !imageSource.startsWith("http://") && !imageSource.startsWith("https://") && !imageSource.startsWith("blob:");
  if (isLocalFilePath) {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.storage?.readBase64) {
      try {
        const result = await electronAPI.storage.readBase64(imageSource);
        if (result?.ok && result?.base64 && result?.mimeType) {
          imageSource = `data:${result.mimeType};base64,${result.base64}`;
          // Now check if it fits within maxBytes
          const byteSize = Math.ceil((imageSource.length - imageSource.indexOf(",") - 1) * 0.75);
          if (byteSize <= maxBytes) return imageSource;
          // Otherwise fall through to canvas compression with the data URL
        } else {
          return imageSource; // Can't read file, return as-is
        }
      } catch (err) {
        console.error("Error reading file for compression:", err);
        return imageSource; // Error reading file, return as-is
      }
    } else {
      return imageSource; // No Electron API, return as-is without canvas
    }
  }

  return new Promise((resolve, reject) => {
    // 🛡️ Check data URL size before processing
    if (imageSource.startsWith("data:")) {
      const base64Length = imageSource.length - imageSource.indexOf(",") - 1;
      const estimatedBytes = Math.ceil(base64Length * 0.75);
      // If data URL is extremely large (>20MB), reject immediately to prevent crash
      if (estimatedBytes > 20 * 1024 * 1024) {
        reject(new Error(`Image too large: ${Math.round(estimatedBytes/1024/1024)}MB. Maximum 20MB.`));
        return;
      }
    }

    const img = new Image();
    // 🛡️ Only set crossOrigin for HTTP/HTTPS URLs, not local file paths
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      img.crossOrigin = "anonymous";
    }

    // 🛡️ Add timeout to prevent hanging on large images
    const timeout = setTimeout(() => {
      img.src = ""; // Clear source to stop loading
      reject(new Error("Image compression timeout - image too large or network issue"));
    }, 30000); // 30 second timeout

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Scale down if dimensions are very large
        const dimLimit = maxDim;
        if (width > dimLimit || height > dimLimit) {
          const ratio = Math.min(dimLimit / width, dimLimit / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality
        const qualities = [0.8, 0.6, 0.4, 0.3, 0.2];
        for (const q of qualities) {
          const result = canvas.toDataURL("image/jpeg", q);
          const size = Math.ceil((result.length - result.indexOf(",") - 1) * 0.75);
          if (size <= maxBytes) {
            resolve(result);
            return;
          }
        }

        // Last resort: further scale down
        const smallCanvas = document.createElement("canvas");
        smallCanvas.width = Math.round(width * 0.5);
        smallCanvas.height = Math.round(height * 0.5);
        const sCtx = smallCanvas.getContext("2d");
        if (!sCtx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
        resolve(smallCanvas.toDataURL("image/jpeg", 0.3));
      } catch (err) {
        reject(new Error(`Canvas compression failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Failed to load image for compression"));
    };

    try {
      img.src = imageSource;
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`Failed to set image source: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}
