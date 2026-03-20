/**
 * 上传 base64 data URI 到 Supabase Storage（通过客户端 SDK，不经过 Edge Function）
 */
import { supabase } from "@/integrations/supabase/client";

export async function ensureStorageUrl(
  dataUrl: string,
  folder: string = "characters",
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return dataUrl; // Already a URL
  }

  try {
    const [header, base64Data] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);/);
    const mimeType = mimeMatch?.[1] || "image/png";
    const ext = mimeType.includes("png") ? "png" : "jpg";

    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }

    const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("generated-images")
      .upload(fileName, byteArray, { contentType: mimeType, upsert: false });

    if (error) {
      console.warn("[Storage] Upload failed:", error.message);
      return dataUrl;
    }

    const { data } = supabase.storage.from("generated-images").getPublicUrl(fileName);
    console.log("[Storage] Uploaded successfully:", data.publicUrl);
    return data.publicUrl;
  } catch (err) {
    console.warn("[Storage] Error:", err);
    return dataUrl;
  }
}
