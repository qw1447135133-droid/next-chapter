/**
 * Compress an image (base64 data-url or regular URL) to be under the given maxBytes (default 10 MB).
 * Uses canvas to re-encode at progressively lower quality.
 * Returns a compressed data-url string.
 */
export async function compressImage(
  imageSource: string,
  maxBytes: number = 10 * 1024 * 1024
): Promise<string> {
  // For data URLs, check size directly
  if (imageSource.startsWith("data:image")) {
    const byteSize = Math.ceil((imageSource.length - imageSource.indexOf(",") - 1) * 0.75);
    if (byteSize <= maxBytes) return imageSource;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed for storage URLs
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Scale down if dimensions are very large (max 2048 on longest side)
      const maxDim = 2048;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
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
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = imageSource;
  });
}
