/**
 * 本地 Gemini API 客户端 - 通过轻量级代理 Edge Function 调用外部 API
 * 代理仅做请求转发，所有提示词逻辑在前端完成
 */
import { getApiConfig } from "@/pages/Settings";

export const DEFAULT_GEMINI_BASE_URL = "http://202.90.21.53:13003/v1beta";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy`;

// ===== Proxied / Direct Fetch =====

/**
 * Smart fetch: uses direct fetch or proxy Edge Function based on directMode setting.
 * When direct mode is enabled but the request fails (e.g. mixed content, CORS),
 * automatically falls back to the proxy.
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
      // Direct mode failed (mixed content, network error, CORS) — fall back to proxy
      console.warn("[proxiedFetch] 直连失败，自动回退到代理模式:", (directErr as Error).message);
    }
  }

  // Proxy mode: route through Edge Function with retry on transient network errors
  const MAX_RETRIES = config.retryCount ?? 2;
  const RETRY_DELAY_MS = config.retryDelayMs ?? 3000;

  const doProxyFetch = () => {
    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-target-url": targetUrl,
      "x-target-headers": JSON.stringify(targetHeaders),
    };
    return fetch(PROXY_URL, {
      method: body ? "POST" : "GET",
      headers: proxyHeaders,
      body,
      signal,
    });
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (signal?.aborted) throw new Error("请求已取消");
      const resp = await doProxyFetch();
      // Retry on 502 (proxy connection failure) but not other errors
      if (resp.status === 502 && attempt < MAX_RETRIES) {
        const errBody = await resp.text().catch(() => "");
        console.warn(`[proxiedFetch] 代理返回502，第${attempt + 1}次重试 (${RETRY_DELAY_MS}ms后)...`, errBody.slice(0, 150));
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return resp;
    } catch (fetchErr) {
      // Network-level failure (Failed to fetch, timeout, etc.)
      if (signal?.aborted) throw fetchErr;
      if (attempt < MAX_RETRIES) {
        console.warn(`[proxiedFetch] 网络错误，第${attempt + 1}次重试 (${RETRY_DELAY_MS}ms后):`, (fetchErr as Error).message);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw fetchErr;
    }
  }

  // Should not reach here, but TypeScript needs it
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

// ===== Core API Call =====

export async function callGemini(
  model: string,
  contents: any[],
  generationConfig?: Record<string, any>,
  signal?: AbortSignal,
): Promise<any> {
  const { apiKey, baseUrl } = getGeminiEndpoint();
  if (!apiKey) throw new Error("请先在设置中配置 Gemini API Key");

  const { url, headers } = buildGeminiRequest(baseUrl, `/models/${model}:generateContent`, apiKey);
  const body: any = { contents };
  if (generationConfig && Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const jsonBody = JSON.stringify(body);

  if (signal?.aborted) throw new Error("请求已取消");

  const response = await proxiedFetch(url, headers, jsonBody, signal);

  if (response.ok) {
    return response.json();
  }

  const text = await response.text().catch(() => "");
  throw new Error(`模型 ${model} 调用失败 (${response.status}): ${text.slice(0, 200)}`);
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
  if (!apiKey) throw new Error("请先在设置中配置 Gemini API Key");

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