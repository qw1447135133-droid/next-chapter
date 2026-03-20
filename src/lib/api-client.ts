/**
 * API Client - 使用本地配置的端点和密钥
 * 替代 Supabase Edge Functions 直接调用 AI API
 */

import { getApiConfig } from "@/pages/Settings";

const DEFAULT_TIMEOUT = 300_000;

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * 调用 AI 模型 API
 */
export async function callAiApi<T = any>(
  body: Record<string, unknown>,
  options: {
    endpoint?: string;
    path?: string;
    timeout?: number;
  } = {}
): Promise<T> {
  const config = getApiConfig();
  const endpoint = options.endpoint || "https://api.zhanhu.ai/v1";
  const path = options.path || "/chat/completions";
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  if (!config.zhanhuKey) {
    throw new Error("请先在设置中配置站狐 API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.zhanhuKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用视频生成 API
 */
export async function callVideoApi<T = any>(
  body: Record<string, unknown>,
  options: {
    timeout?: number;
  } = {}
): Promise<T> {
  const config = getApiConfig();
  const endpoint = "https://api.zhanhu.ai/v1";
  const timeout = options.timeout || 600_000; // 视频生成可能需要更长时间

  if (!config.seedance) {
    throw new Error("请先在设置中配置 Seedance API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${endpoint}/video/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.seedance}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式调用 AI API (带心跳)
 */
export async function* callAiStreamingApi(
  body: Record<string, unknown>,
  options: {
    endpoint?: string;
    path?: string;
    timeout?: number;
  } = {}
): AsyncGenerator<string> {
  const config = getApiConfig();
  const endpoint = options.endpoint || "https://api.zhanhu.ai/v1";
  const path = options.path || "/chat/completions";
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  if (!config.zhanhuKey) {
    throw new Error("请先在设置中配置站狐 API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.zhanhuKey}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Yield complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.trim()) {
          yield line;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
