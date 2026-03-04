/**
 * 封装 AI API 调用
 * 支持两种模式：
 * 1. Supabase Edge Functions 模式（需要配置 Supabase）
 * 2. 直接 API 调用模式（推荐本地模式使用）
 */
import { supabase } from "@/integrations/supabase/client";
import { getApiConfig } from "@/pages/Settings";
import { callLocalAiApi, callLocalVideoApi } from "@/lib/local-api-client";

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

  // Vidu API — 独立的视频生成 API（需单独配置）
  if (config.viduKey) {
    keys.viduKey = config.viduKey;
  }

  // 端点配置 — 传递给 Edge Functions
  if (config.zhanhuEndpoint) {
    keys.geminiEndpoint = config.zhanhuEndpoint;
  }
  if (config.seedanceEndpoint) {
    keys.seedanceEndpoint = config.seedanceEndpoint;
  }

  return keys;
}

/**
 * 判断是否配置了 Supabase
 */
function hasSupabaseConfig(): boolean {
  // Lovable Cloud 项目始终有 Supabase 可用（通过环境变量自动配置）
  // 不再依赖 localStorage 中的手动配置
  return true;
}

/**
 * 调用 AI API - 智能选择调用方式
 * 如果配置了 Supabase，使用 Edge Functions
 * 否则直接调用外部 API
 */
export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  const keys = getKeysForFunction(functionName);
  const mergedBody = { ...body, ...keys };
  const config = getApiConfig();

  // 如果配置了 Supabase，使用 Edge Functions
  if (hasSupabaseConfig()) {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: mergedBody,
      });

      if (error) return { data: null, error };
      if (data?.error) return { data: null, error: new Error(typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error)) };
      return { data: data as T, error: null };
    } catch (e) {
      // Supabase 调用失败，尝试直接调用
      console.warn("Supabase 调用失败，尝试直接调用 API:", e);
    }
  }

  // 直接调用外部 API
  return invokeDirectApi<T>(functionName, mergedBody);
}

/**
 * 直接调用外部 AI API（不经过 Supabase Edge Functions）
 */
async function invokeDirectApi<T = any>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  const config = getApiConfig();
  const endpoint = config.zhanhuEndpoint || "http://202.90.21.53:13003/v1beta";

  // 判断端点类型：Google Gemini 使用 generateContent，MiniMax 使用 chat/completions
  const isGoogleEndpoint = endpoint.includes("googleapis.com") || endpoint.includes("generativelanguage.googleapis.com") || endpoint.includes(":13003/v1beta");

  try {
    switch (functionName) {
      case "script-decompose": {
        // 剧本拆解
        if (isGoogleEndpoint) {
          // Google Gemini 格式
          const response = await fetch(`${endpoint}/models/gemini-2.0-flash:generateContent?key=${config.zhanhuKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: body.systemPrompt + "\n\n" + body.script }] }],
              generationConfig: { temperature: 0.7 }
            })
          });
          const data = await response.json();
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
          return { data: { choices: [{ message: { content: data.candidates?.[0]?.content?.parts?.[0]?.text || "" } }] } as T, error: null };
        } else {
          // MiniMax 格式
          const response = await callLocalAiApi({
            model: "MiniMax-M2.5",
            messages: [
              { role: "system", content: body.systemPrompt as string || "你是一个专业的剧本分析助手。请根据用户提供的剧本，识别出所有角色和场景，并拆解成详细的分镜列表。" },
              { role: "user", content: body.script as string }
            ],
            temperature: 0.7,
          });
          return { data: response as T, error: null };
        }
      }

      case "enhance-video-prompt": {
        // 增强视频提示词
        const response = await callLocalAiApi({
          model: "MiniMax-M2.5",
          messages: [
            { role: "system", content: "你是一个视频提示词优化专家。请根据场景描述生成详细的视频生成提示词。" },
            { role: "user", content: `场景名称: ${body.sceneName}\n场景描述: ${body.description}` }
          ],
          temperature: 0.7,
        });
        return { data: response as T, error: null };
      }

      case "generate-storyboard": {
        // 生成分镜图
        const response = await callLocalAiApi({
          model: "MiniMax-M2.5",
          messages: [
            { role: "system", content: "你是一个分镜图生成专家。请根据剧本内容生成分镜图描述。" },
            { role: "user", content: body.script as string }
          ],
          temperature: 0.7,
        });
        return { data: response as T, error: null };
      }

      case "generate-video": {
        // 生成视频 - 使用 Seedance API
        const response = await callLocalVideoApi({
          model: "seedance-01",
          prompt: body.prompt,
        });
        return { data: response as T, error: null };
      }

      default:
        return { data: null, error: new Error(`未知函数: ${functionName}`) };
    }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * 构建带 Key 的请求体
 */
export function buildFetchBodyWithKeys(body: Record<string, unknown>) {
  const keys = getKeysForFunction("");
  return { ...body, ...keys };
}
