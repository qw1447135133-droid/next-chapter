/**
 * 本地 AI API 客户端
 * 直接调用外部 AI API，不依赖 Supabase Edge Functions
 */

import { getApiConfig } from "@/pages/Settings";

const DEFAULT_TIMEOUT = 300_000;

/**
 * 调用 AI 模型 API (用于剧本拆解、分镜图生成)
 */
export async function callLocalAiApi<T = any>(
  body: Record<string, unknown>,
  options: {
    endpoint?: string;
    path?: string;
    timeout?: number;
  } = {}
): Promise<T> {
  const config = getApiConfig();
  
  // 使用站狐 API 端点
  const endpoint = config.zhanhuEndpoint || "http://202.90.21.53:13003/v1beta";
  const path = options.path || "/chat/completions";
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  if (!config.zhanhuKey) {
    throw new Error("请先在设置中配置 API Key");
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
export async function callLocalVideoApi<T = any>(
  body: Record<string, unknown>,
  options: {
    timeout?: number;
  } = {}
): Promise<T> {
  const config = getApiConfig();
  const endpoint = config.seedanceEndpoint || "http://202.90.21.53:13003/v1";
  const timeout = options.timeout || 600_000;

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
