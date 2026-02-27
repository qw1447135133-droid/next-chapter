import { supabase } from "@/integrations/supabase/client";

/**
 * If the given URL is a base64 data URI, upload it via the upload-image
 * edge function and return the public URL. Otherwise return the original URL.
 */
export async function ensureStorageUrl(
  dataUrl: string,
  folder: string = "characters",
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return dataUrl; // Already a URL
  }

  try {
    // Parse base64 to blob
    const [header, base64Data] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);/);
    const mimeType = mimeMatch?.[1] || "image/png";
    const ext = mimeType.includes("png") ? "png" : "jpg";

    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], `image.${ext}`, { type: mimeType });

    // Upload via edge function (uses service role key, no client-side RLS issues)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const { data, error } = await supabase.functions.invoke("upload-image", {
      body: formData,
    });

    if (error || data?.error) {
      console.warn("[Storage fallback] Edge upload failed:", error?.message || data?.error);
      return dataUrl;
    }

    console.log("[Storage fallback] Uploaded successfully:", data.imageUrl);
    return data.imageUrl;
  } catch (err) {
    console.warn("[Storage fallback] Error:", err);
    return dataUrl;
  }
}
