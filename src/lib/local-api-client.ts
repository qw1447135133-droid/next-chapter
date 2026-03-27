/**
 * 本地 AI API 客户端（Gemini / 即梦视频网关）
 */

import { getApiConfig } from "@/pages/Settings";
import { smartDirectOrProxyFetch } from "@/lib/gemini-client";

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
  } = {},
): Promise<T> {
  const config = getApiConfig();
  const baseUrl =
    options.endpoint ||
    config.geminiEndpoint ||
    "http://202.90.21.53:13003/v1beta";
  const path = options.path || "/chat/completions";
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  if (!config.geminiKey?.trim()) {
    throw new Error("请先在设置中配置 Gemini API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await smartDirectOrProxyFetch(
      `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`,
      {
        "Content-Type": "application/json",
      },
      JSON.stringify(body),
      controller.signal,
      "gemini",
    );

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
    endpoint?: string;
    timeout?: number;
  } = {},
): Promise<T> {
  const config = getApiConfig();
  const base =
    options.endpoint ||
    config.jimengEndpoint ||
    config.geminiEndpoint ||
    "http://202.90.21.53:13003/v1beta";
  const timeout = options.timeout || 600_000;

  if (!config.jimengKey?.trim() && !config.geminiKey?.trim()) {
    throw new Error("请先在设置中配置即梦视频或 Gemini API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await smartDirectOrProxyFetch(
      `${base.replace(/\/$/, "")}/v1/video/generate`,
      {
        "Content-Type": "application/json",
      },
      JSON.stringify(body),
      controller.signal,
      "jimeng",
    );

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
