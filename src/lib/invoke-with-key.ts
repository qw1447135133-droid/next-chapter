/**
 * 封装 Edge Function 调用，自动从 Settings 注入对应的 API Key
 * Edge Function 优先使用请求体中的 apiKey，若无则回退到服务端 Secret
 */
import { supabase } from "@/integrations/supabase/client";
import { getApiConfig } from "@/pages/Settings";

/** 根据函数名自动选择合适的 API Key */
function getKeysForFunction(functionName: string): Record<string, string> {
  const config = getApiConfig();
  const keys: Record<string, string> = {};

  // Gemini Key (站狐) — 用于 AI 文本生成类函数
  if (config.zhanhuKey) {
    keys.geminiKey = config.zhanhuKey;
  }

  // Seedance Key (站狐) — 用于视频生成和图像生成 (seedream)
  if (config.seedance) {
    keys.seedanceKey = config.seedance;
  }

  // Vidu Key — 用于 Vidu 视频生成
  if (config.viduKey) {
    keys.viduKey = config.viduKey;
  }

  return keys;
}

/**
 * 调用 Edge Function，自动注入本地配置的 API Key
 */
export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  const keys = getKeysForFunction(functionName);
  const mergedBody = { ...body, ...keys };

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: mergedBody,
  });

  if (error) return { data: null, error };
  if (data?.error) return { data: null, error: new Error(typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error)) };
  return { data: data as T, error: null };
}

/**
 * 使用 fetch 调用 Edge Function（用于需要流式响应的场景），自动注入 API Key
 */
export function buildFetchBodyWithKeys(
  functionName: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const keys = getKeysForFunction(functionName);
  return { ...body, ...keys };
}
