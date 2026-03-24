/**
 * 本地 Gemini API 客户端
 *
 * 支持三种网络模式：
 *   1. supabase: 通过 Supabase Edge Function 代理（密钥在本地）
 *   2. fc: 通过阿里云 FC API 网关（密钥在 FC 环境变量）
 *   3. direct: 直连（浏览器直接调用）
 *
 * 业务逻辑在本地，API 密钥通过 FC 获取或本地存储
 */
import { getApiConfig } from "@/pages/Settings";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_GEMINI_BASE_URL = "http://202.90.21.53:13003/v1beta";
export const DEFAULT_JIMENG_BASE_URL = "http://202.90.21.53:13003/v1";
export const DEFAULT_VIDU_BASE_URL = "https://api.vidu.cn/ent/v2";

const SUPABASE_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy`;

/** 获取当前激活的代理 URL */
function getProxyUrl(): string {
  const config = getApiConfig();
  if (config.proxyMode === "fc" && config.fcProxyUrl) {
    return config.fcProxyUrl.replace(/\/$/, "") + "/proxy";
  }
  return SUPABASE_PROXY_URL;
}

// ===== 服务名称映射 =====
export type AiService = "gemini" | "jimeng" | "vidu" | "kling";

/** 从 URL 推断服务名称 */
export function inferServiceFromUrl(url: string): AiService | null {
  if (url.includes("generativelanguage.googleapis.com")) return "gemini";
  if (url.includes("ark.cn-beijing.volces.com")) return "jimeng";
  if (url.includes("vidu")) return "vidu";
  if (url.includes("klingai.com")) return "kling";
  return null;
}

// ===== Proxied / Direct Fetch =====

/**
 * Smart fetch: 根据配置选择直连、Supabase代理或FC代理
 * FC 模式下自动带上 service 参数，让 FC 注入对应的 API 密钥
 */
export async function proxiedFetch(
  targetUrl: string,
  targetHeaders: Record<string, string>,
  body?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const config = getApiConfig();

  if (config.directMode) {
    try {
      const headers: Record<string, string> = { ...targetHeaders };
      if (!headers["Content-Type"] && body) {
        headers["Content-Type"] = "application/json";
      }
      const resp = await fetch(targetUrl, {
        method: body ? "POST" : "GET",
        headers,
        body,
        signal,
      });
      return resp;
    } catch (directErr) {
      console.warn("[proxiedFetch] 直连失败，自动回退到代理模式:", (directErr as Error).message);
    }
  }

  // 代理模式（Supabase Edge Function 或 阿里云 FC）
  const proxyUrl = getProxyUrl();
  const proxyType = config.proxyMode === "fc" ? "FC" : "Supabase";
  const isFcMode = config.proxyMode === "fc";

  // 推断服务名称（用于 FC 自动注入密钥）
  const service = inferServiceFromUrl(targetUrl);

  const MAX_RETRIES = config.retryCount ?? 2;
  const RETRY_DELAY_MS = config.retryDelayMs ?? 3000;

  const doProxyFetch = () => {
    if (isFcMode && config.fcProxyUrl) {
      // FC API 网关模式：只传 service + path + body
      // 从 targetUrl 提取 path（FC 内部配置端点）
      let apiPath = targetUrl;
      try {
        const urlObj = new URL(targetUrl);
        apiPath = urlObj.pathname + urlObj.search;
      } catch {
        const match = targetUrl.match(/https?:\/\/[^\/]+(\/.*)/);
        if (match) apiPath = match[1];
      }

      return fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(service ? { "x-service": service } : {}),
        },
        body: JSON.stringify({
          service,
          path: apiPath,
          body: body ? JSON.parse(body) : undefined,
        }),
        signal,
      });
    } else {
      // Supabase Edge Function 代理
      const proxyHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "x-target-url": targetUrl,
        "x-target-headers": JSON.stringify(targetHeaders),
      };
      return fetch(proxyUrl, {
        method: body ? "POST" : "GET",
        headers: proxyHeaders,
        body,
        signal,
      });
    }
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try
 {
      if (signal?.aborted) throw new Error("请求已取消");
      const resp = await doProxyFetch();
      if (resp.status === 502 && attempt < MAX_RETRIES) {
        const errBody = await resp.text().catch(() => "");
        console.warn(`[proxiedFetch] ${proxyType}代理返回502，第${attempt + 1}次重试 (${RETRY_DELAY_MS}ms后)...`, errBody.slice(0, 150));
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return resp;
    } catch (fetchErr) {
      if (signal?.aborted) throw fetchErr;
      if (attempt < MAX_RETRIES) {
        console.warn(`[proxiedFetch] 网络错误(${proxyType}代理)，第${attempt + 1}次重试 (${RETRY_DELAY_MS}ms后):`, (fetchErr as Error).message);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw fetchErr;
    }
  }

  return doProxyFetch();
}

// ===== Request Building =====

export function buildGeminiRequest(baseUrl: string, path: string, apiKey: string) {
  const isDefaultProxy = baseUrl === DEFAULT_GEMINI_BASE_URL || baseUrl.includes("202.90.21.53");
  const isGoogleOfficial = baseUrl.includes("generativelanguage.googleapis.com");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;
  if (isDefaultProxy) {
    url = `${baseUrl}${path}`;
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (isGoogleOfficial) {
    url = `${baseUrl}${path}`;
    headers["x-goog-api-key"] = apiKey;
  } else {
    const separator = path.includes("?") ? "&" : "?";
    url = `${baseUrl}${path}${separator}key=${apiKey}`;
  }
  return { url, headers };
}

export function getGeminiEndpoint() {
  const config = getApiConfig();
  return {
    apiKey: config.zhanhuKey,
    baseUrl: config.zhanhuEndpoint || DEFAULT_GEMINI_BASE_URL,
  };
}

export function getJimengConfig() {
  const config = getApiConfig();
  return {
    apiKey: config.jimeng,
    endpoint: config.jimengEndpoint || DEFAULT_JIMENG_BASE_URL,
  };
}

export function getViduConfig() {
  const config = getApiConfig();
  return {
    apiKey: config.viduKey,
    endpoint: config.viduEndpoint || DEFAULT_VIDU_BASE_URL,
  };
}

export function getKlingConfig() {
  const config = getApiConfig();
  return {
    apiKey: config.klingKey,
    endpoint: config.klingEndpoint || "https://api.klingai.com",
  };
}

export function getSeedanceConfig() {
  const config = getApiConfig();
  return {
    apiKey: config.zhanhuKey,
    endpoint: config.zhanhuEndpoint || DEFAULT_GEMINI_BASE_URL,
  };
}

// ===== Core API Call =====

export async function callGemini(
  model: string,
  contents: any[],
  generationConfig?: Record<string, any>,
  signal?: AbortSignal,
): Promise<any> {
  const { apiKey, baseUrl } = getGeminiEndpoint();
  const config = getApiConfig();

  // FC 模式下不检查本地 key（由 FC 注入）
  if (config.proxyMode !== "fc" && !apiKey) throw new Error("请先在设置中配置 Gemini API Key");

  const { url, headers } = buildGeminiRequest(baseUrl, `/models/${model}:generateContent`, apiKey);
  const body: any = { contents };
  if (generationConfig && Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const jsonBody = JSON.stringify(body);

  if (signal?.aborted) throw new Error("请求已取消");

  const response = await proxiedFetch(url, headers, jsonBody, signal);

  if (response.ok) {
    const data = await response.json();
    // 部分网关仍返回 200 但 body 内含 error
    const errMsg = data?.error?.message ?? (typeof data?.error === "string" ? data.error : null);
    if (errMsg) {
      throw new Error(String(errMsg));
    }
    return data;
  }

  const text = await response.text().catch(() => "");
  throw new Error(`模型 ${model} 调用失败 (${response.status}): ${text.slice(0, 200)}`);
}

/** 当 extractText 为空时，从原始响应推断原因（安全拦截、仅 thought 等） */
export function explainGeminiNoText(data: unknown): string | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;

  const err = d.error as { message?: string } | string | undefined;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && err.message) return String(err.message);

  const pf = d.promptFeedback as { blockReason?: string; blockReasonMessage?: string } | undefined;
  if (pf?.blockReason) {
    const extra = pf.blockReasonMessage ? `（${pf.blockReasonMessage}）` : "";
    return `请求未生成正文：内容审核 ${pf.blockReason}${extra}`;
  }

  const cand = (d.candidates as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
  if (!cand) {
    return "模型未返回候选结果，可能被安全策略拦截或网关截断了响应。";
  }

  const fr = cand.finishReason as string | undefined;
  if (fr && fr !== "STOP" && fr !== "FINISH_REASON_STOP") {
    const frMap: Record<string, string> = {
      SAFETY: "因安全策略未输出文本，请换一张参考图或简化画面内容后重试。",
      RECITATION: "因模型版权引用限制未输出文本。",
      MAX_TOKENS: "输出被长度限制截断，请重试。",
      OTHER: "模型提前结束（OTHER），请稍后重试。",
    };
    return frMap[fr] ?? `模型结束原因：${fr}`;
  }

  const parts = (cand.content as { parts?: unknown[] } | undefined)?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const onlyThought = parts.every((p: unknown) => (p as { thought?: boolean }).thought === true);
    if (onlyThought) {
      return "模型只返回了内部推理，没有可见文本。请稍后重试，或检查网关是否支持当前模型。";
    }
  }

  return null;
}

/**
 * Streaming version of callGemini — calls streamGenerateContent and invokes
 * onChunk with the accumulated text after each SSE event.
 * Returns the final complete text.
 */
export async function callGeminiStream(
  model: string,
  contents: any[],
  onChunk: (accumulated: string) => void,
  generationConfig?: Record<string, any>,
  signal?: AbortSignal,
): Promise<string> {
  const { apiKey, baseUrl } = getGeminiEndpoint();
  const config = getApiConfig();

  // FC 模式下不检查本地 key（由 FC 注入）
  if (config.proxyMode !== "fc" && !apiKey) throw new Error("请先在设置中配置 Gemini API Key");

  const { url, headers } = buildGeminiRequest(
    baseUrl,
    `/models/${model}:streamGenerateContent?alt=sse`,
    apiKey,
  );
  const body: any = { contents };
  if (generationConfig && Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  if (signal?.aborted) throw new Error("请求已取消");

  const response = await proxiedFetch(url, headers, JSON.stringify(body), signal);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`模型 ${model} 调用失败 (${response.status}): ${text.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("浏览器不支持流式读取");

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const parts = parsed?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.thought) continue; // skip thinking tokens
          if (part.text) {
            accumulated += part.text;
            onChunk(accumulated);
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  return accumulated.trim();
}

// ===== Response Parsing =====

export function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || "")
    .join("")
    .trim();
}

export async function extractImageBase64(data: any): Promise<{ base64: string; mimeType: string } | null> {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  // Try inlineData first
  for (const part of parts) {
    if (part.inlineData) {
      return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
    }
  }

  // Fallback: fileData
  for (const part of parts) {
    if (part.fileData?.fileUri) {
      const result = await fetchImageAsBase64(part.fileData.fileUri);
      if (result) return { base64: result.data, mimeType: result.mimeType };
    }
  }

  // Fallback: URL in text
  for (const part of parts) {
    if (part.text) {
      const mdMatch = part.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      const urlMatch = mdMatch?.[1] || part.text.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif))/i)?.[1];
      if (urlMatch) {
        const result = await fetchImageAsBase64(urlMatch);
        if (result) return { base64: result.data, mimeType: result.mimeType };
      }
    }
  }

  return null;
}

// ===== Image Utilities =====

export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const config = getApiConfig();
    // Use proxy for HTTP URLs to avoid mixed content issues (unless direct mode)
    const needsProxy = !config.directMode && url.startsWith("http://");
    const resp = needsProxy
      ? await proxiedFetch(url, {}, undefined)
      : await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const contentType = resp.headers.get("content-type") || "image/png";
    return { mimeType: contentType.split(";")[0], data: base64 };
  } catch {
    return null;
  }
}

export async function getInlineData(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }
  if (imageUrl.startsWith("http")) {
    return fetchImageAsBase64(imageUrl);
  }
  return null;
}

// ===== Storage Upload =====

export async function uploadImageToStorage(base64: string, mimeType: string, folder: string): Promise<string> {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("generated-images")
    .upload(fileName, bytes, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`图片上传失败: ${error.message}`);

  const { data } = supabase.storage.from("generated-images").getPublicUrl(fileName);
  return data.publicUrl;
}

/** Upload a File object directly to storage */
export async function uploadFileToStorage(file: File, folder: string): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("generated-images")
    .upload(fileName, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`图片上传失败: ${error.message}`);

  const { data } = supabase.storage.from("generated-images").getPublicUrl(fileName);
  return data.publicUrl;
}

// ===== Seedream Image Generation =====

export async function callSeedreamImage(
  prompt: string,
  options: { model?: string; size?: string; image?: string[]; signal?: AbortSignal } = {},
): Promise<{ base64: string; mimeType: string }> {
  const { apiKey, endpoint } = getSeedanceConfig();
  const config = getApiConfig();

  // FC 模式下不检查本地 key（由 FC 注入）
  const needsLocalKey = config.proxyMode !== "fc";
  if (needsLocalKey && !apiKey) throw new Error("Seedance API Key 未配置，请在设置中配置");

  const baseUrl = endpoint.replace("/v1beta", "").replace(/\/v1\/?$/, "");
  const payload: any = {
    model: options.model || "doubao-seedream-3-0",
    prompt,
    size: options.size || "2560x1440",
    watermark: false,
  };
  if (options.image && options.image.length > 0) {
    // Convert URLs to base64 data URIs if needed, as external URLs may not be accessible by the API
    const processedImages: string[] = [];
    for (const img of options.image) {
      if (img.startsWith("data:")) {
        processedImages.push(img);
      } else {
        try {
          const fetched = await fetchImageAsBase64(img);
          if (fetched) {
            processedImages.push(`data:${fetched.mimeType};base64,${fetched.data}`);
          } else {
            processedImages.push(img);
          }
        } catch {
          processedImages.push(img);
        }
      }
    }
    payload.image = processedImages;
    payload.sequential_image_generation = "disabled";
  }

  const resp = await proxiedFetch(`${baseUrl}/v1/images/generations/`, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }, JSON.stringify(payload), options.signal);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Seedream 生成失败 (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const imgItem = data.data?.[0];
  if (imgItem?.b64_json) {
    return { base64: imgItem.b64_json, mimeType: "image/png" };
  }
  if (imgItem?.url) {
    // Always proxy external image URLs to avoid CORS issues
    const imgResp = await proxiedFetch(imgItem.url, {});
    if (!imgResp.ok) throw new Error("Seedream 图片下载失败");
    const buf = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const ct = imgResp.headers.get("content-type") || "";
    return { base64: btoa(binary), mimeType: ct.includes("png") ? "image/png" : "image/jpeg" };
  }
  throw new Error("Seedream 未返回图片");
}

// ===== Text Processing =====

export function rewriteToFirstFrame(desc: string): string {
  if (!desc) return desc;

  const splitPatterns = /[，,]?\s*(?:瞬间|顿时|随即|紧接着|突然间|立刻|马上|随后|接着|于是|结果|导致|使得)/;
  const splitMatch = desc.match(splitPatterns);
  let cleaned = splitMatch ? desc.slice(0, splitMatch.index) : desc;

  const removePatterns = [
    /化[为成].*?(血雾|碎片|粉末|灰烬|废墟|齑粉)/g,
    /鲜血[溅飞洒喷].*?[。，,]/g,
    /血[溅飞洒喷花].*?[。，,]/g,
    /[炸爆]成.*?(碎片|粉末|废墟)/g,
    /倒[地下飞].*?[。，,]/g,
    /身体.*?(?:碎裂|断裂|爆裂|粉碎)/g,
    /尸体/g,
    /惨死/g,
  ];
  for (const pat of removePatterns) {
    cleaned = cleaned.replace(pat, "");
  }

  cleaned = cleaned
    .replace(/飞来击中/g, "飞向")
    .replace(/飞来砸中/g, "飞向")
    .replace(/飞来射中/g, "射向")
    .replace(/击中/g, "朝其飞去")
    .replace(/砍中/g, "朝其挥去")
    .replace(/刺中/g, "朝其刺去")
    .replace(/射中/g, "射向")
    .replace(/撞上/g, "冲向")
    .replace(/砸中/g, "砸向")
    .replace(/劈中/g, "朝其劈去")
    .replace(/一拳砸在/g, "举拳准备砸向")
    .replace(/一拳打在/g, "举拳准备打向")
    .replace(/一拳击在/g, "举拳准备击向")
    .replace(/踹开/g, "准备踹向")
    .replace(/踢中/g, "踢向")
    .replace(/摔在/g, "即将摔向")
    .replace(/重重摔/g, "即将摔")
    .replace(/按在.*?地面/g, "按向地面")
    .replace(/反复捶打/g, "举拳准备捶打")
    .replace(/拖向/g, "准备拖向")
    .replace(/架住/g, "准备架住")
    .replace(/将其/g, "准备将其")
    .replace(/渗出鲜血/g, "")
    .replace(/嘴角渗出/g, "")
    .replace(/痛苦地倒地/g, "即将倒地")
    .replace(/倒地咳嗽/g, "即将倒地");

  cleaned = cleaned.replace(/[，,、]+\s*(\[[^\]]*\])\s*$/, "").replace(/[，,、。]+$/, "").replace(/\s+/g, " ").trim();
  return cleaned || desc;
}

// ===== Style Maps =====

export const CHAR_STYLE_MAP: Record<string, string> = {
  "live-action": "Photorealistic live-action cinematography. Shot on high-end cinema camera (ARRI Alexa / RED V-Raptor). Cinematic lighting with motivated key light, soft fill, and subtle rim light. Film-grade color grading with natural skin tones, accurate subsurface scattering on skin, pore-level detail, real fabric weave and stitching on clothing. Shallow depth of field with anamorphic bokeh. No post-processing glow or bloom. The image must look indistinguishable from a real film still.",
  "hyper-cg": "Hyper-realistic CG render at AAA game cinematic quality (Unreal Engine 5 / Nanite-level detail). Physically-based rendering (PBR) with ray-traced global illumination, accurate subsurface scattering on skin, micro-detail normal maps on all surfaces. Ultra-high polygon count with no visible faceting. Realistic hair strand simulation, cloth physics folds, and specular response on metals and wet surfaces. Studio-quality three-point lighting setup with HDRI environment reflections.",
  "3d-cartoon": "3D cartoon animation style matching Pixar / Disney / Illumination feature-film quality. Smooth subdivided surfaces with appealing stylized proportions (slightly oversized head, expressive eyes). Soft volumetric ambient occlusion, subsurface scattering on skin for a warm translucent feel. Rim lighting for silhouette readability. Rich saturated color palette with complementary accent colors. Clean topology with no artifacts. The character should feel like a frame from a theatrical animated feature.",
  "2.5d-stylized": "2.5D stylized illustration blending hand-painted 2D textures over 3D geometry, inspired by Spider-Man: Into the Spider-Verse and Arcane: League of Legends. Visible artistic brushstrokes, Ben-Day dots, and cross-hatching layered on top of three-dimensional forms. Graphic novel panel aesthetic with strong ink outlines of varying weight. Limited but bold color palette with intentional color holds on linework. Slight printing misregistration effect. Mixed frame-rate feel captured in a still image.",
  "anime-3d": "3D cel-shaded anime style inspired by Genshin Impact, Honkai: Star Rail, and Guilty Gear Strive. Hard-edge toon shading with exactly 2-3 shadow steps and no smooth gradients. Crisp black outlines of uniform weight rendered over clean 3D geometry. Anime-proportioned facial features: large luminous eyes with detailed iris highlights, small nose and mouth. Vibrant highly-saturated color palette. Specular highlights rendered as sharp geometric shapes. Hair rendered as stylized chunky planes with clear silhouette.",
  "cel-animation": "Traditional 2D hand-drawn cel animation style evoking classic Disney Renaissance, Studio Ghibli, and golden-age theatrical shorts. Crisp confident ink lineart with consistent line weight and occasional taper. Large areas of flat solid color fills with no gradients. Shadow rendered as a single flat darker tone with a razor-sharp terminator line (no soft falloff). Highlight as a single lighter shape. Clean negative space. Slight paper-texture grain overlay. The image should feel like a hand-inked and hand-painted animation cel photographed on a rostrum camera.",
  "retro-comic": "Vintage American comic book style evoking 1960s-1970s Marvel / DC print era and pulp illustration. Bold, confident ink outlines with dramatic thick-to-thin brush strokes. High-contrast flat color blocks using a limited CMYK print palette. Mechanical halftone Ben-Day dot patterns for all mid-tones, shadows, and gradients (visible dot grid, not smooth). Slight ink bleed and paper yellowing. Strong chiaroscuro lighting with deep black shadows. Dynamic poses with foreshortening. Speech-balloon-ready composition. The image must feel like a freshly printed newsprint comic page.",
};

export const SCENE_STYLE_MAP: Record<string, string> = {
  "live-action": "Photorealistic live-action cinematography of an environment / location. Shot on high-end cinema camera with cinematic lighting, motivated practical light sources, film-grade color grading, real-world material textures (concrete, wood, metal, fabric), atmospheric haze and depth fog, shallow depth of field with anamorphic bokeh. The image must look indistinguishable from a real film location scout photograph.",
  "hyper-cg": "Hyper-realistic CG environment render at AAA game cinematic quality (Unreal Engine 5 / Nanite-level). Physically-based rendering with ray-traced global illumination, accurate material PBR responses, volumetric fog and god rays, ultra-detailed environment props with micro-surface detail. HDRI sky lighting with realistic time-of-day atmosphere. No visible LOD pop-in or texture stretching.",
  "3d-cartoon": "3D cartoon environment matching Pixar / Disney / Illumination feature-film quality. Stylized but detailed world-building with appealing shape language (rounded edges, exaggerated proportions). Soft volumetric lighting with warm ambient occlusion. Rich saturated color palette with clear color storytelling. Clean modular set design that feels like a miniature stage set brought to life.",
  "2.5d-stylized": "2.5D stylized environment illustration blending hand-painted 2D textures over 3D geometry, inspired by Spider-Man: Into the Spider-Verse and Arcane: League of Legends. Visible artistic brushstrokes and cross-hatching on architectural surfaces. Graphic novel aesthetic with strong ink outlines of varying weight. Bold limited color palette with intentional color holds. Slight printing misregistration effect. Atmospheric depth achieved through layered parallax planes.",
  "anime-3d": "3D cel-shaded anime environment inspired by Genshin Impact and Honkai: Star Rail open-world landscapes. Hard-edge toon shading with 2-3 shadow steps on all surfaces. Clean outlines on major architectural forms. Vibrant highly-saturated color palette with stylized foliage and sky. Specular highlights as sharp geometric shapes on water and metal. Anime-style clouds and atmospheric perspective.",
  "cel-animation": "Traditional 2D hand-painted background art in the style of classic Disney, Studio Ghibli, and golden-age animation. Lush painterly environment with visible gouache / watercolor brushwork. Flat perspective with subtle depth layering for multiplane camera effect. Warm natural color palette with soft atmospheric gradients in sky and distance. No lineart on backgrounds — shapes defined by color and value changes. Slight paper-texture grain overlay.",
  "retro-comic": "Vintage American comic book environment evoking 1960s-1970s Marvel / DC print era. Bold ink outlines on architecture and props with dramatic thick-to-thin brushwork. High-contrast flat color blocks using limited CMYK palette. Mechanical halftone Ben-Day dot patterns for skies, shadows, and gradients. Slight ink bleed and paper yellowing. Strong chiaroscuro lighting with deep black shadow areas. The environment must feel like a freshly printed comic panel background.",
};

export const STORYBOARD_STYLE_MAP: Record<string, string> = {
  "live-action": "Photorealistic live-action cinematography. Cinema camera look with cinematic lighting, film-grade color grading, real-world textures, shallow depth of field, anamorphic bokeh. Indistinguishable from a real film still.",
  "hyper-cg": "Hyper-realistic CG render, AAA game cinematic quality (UE5-level). PBR materials, ray-traced global illumination, volumetric fog, ultra-detailed surfaces, HDRI environment lighting.",
  "3d-cartoon": "3D cartoon animation, Pixar/Disney feature-film quality. Stylized proportions, smooth subsurface skin, soft volumetric AO, rich saturated colors, appealing shape language.",
  "2.5d-stylized": "2.5D stylized illustration, Spider-Verse / Arcane aesthetic. Hand-painted textures over 3D forms, visible brushstrokes, Ben-Day dots, bold ink outlines, limited color palette, printing misregistration effect.",
  "anime-3d": "3D cel-shaded anime, Genshin Impact / Guilty Gear Strive style. Hard-edge 2-3 step toon shading, crisp uniform outlines, anime facial features, vibrant saturated colors, sharp geometric specular highlights.",
  "cel-animation": "Traditional 2D cel animation, Disney Renaissance / Studio Ghibli style. Crisp ink lineart, flat solid color fills, razor-sharp shadow terminator, no gradients, paper-texture grain overlay.",
  "retro-comic": "Vintage 1960s-70s American comic book style. Bold ink brush outlines, flat CMYK color blocks, mechanical halftone Ben-Day dot patterns, ink bleed, paper yellowing, deep chiaroscuro shadows.",
};
