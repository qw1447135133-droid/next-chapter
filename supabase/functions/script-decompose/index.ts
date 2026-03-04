import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_GEMINI_BASE_URL = "http://202.90.21.53:13003/v1beta";

function buildGeminiRequest(baseUrl: string, path: string, apiKey: string) {
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
  console.log(`buildGeminiRequest: endpoint=${baseUrl}, keyLen=${apiKey?.length}, authMethod=${isDefaultProxy ? "Bearer" : isGoogleOfficial ? "x-goog-api-key" : "query-param"}, url=${url}`);
  return { url, headers };
}

const SYSTEM_PROMPT = `你是专业电影分镜师。将剧本拆解为AI视频生成用的15秒分段分镜脚本。

规则：
1. 每集8~10个片段，每片段15秒，含3~5个分镜
2. 台词容量：正常语速≤30字/片段，快速≤45字/片段，超出则拆到下一片段
3. 基于原文拆分，人名地名用[]包裹，禁止加戏、禁止镜头术语、对白完整保留
4. 在场但未提及的角色补充简短站位描述
5. 敏感描述替换（对白原样保留）

输出JSON，仅含"scenes"数组。每个对象：
- sceneNumber: 全局序号(整数递增)
- segmentLabel: 片段编号如"1-1","1-2"(按15秒重新划分，同片段多分镜共享)
- sceneName: 场景名
- description: 画面描述
- characters: 出场角色数组
- dialogue: "角色：台词"格式，多条换行，无则空串
- cameraDirection: 固定"无字幕、无水印、无背景音"
- duration: 固定15

直接输出JSON，无思考过程。`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "无效的请求体" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { script, systemPrompt, model: requestedModel, geminiKey, geminiEndpoint } = body;

  if (!script || typeof script !== "string") {
    return new Response(
      JSON.stringify({ error: "缺少剧本内容" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = geminiKey;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API Key 未配置，请在设置中配置 Gemini API Key" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const baseUrl = geminiEndpoint || DEFAULT_GEMINI_BASE_URL;
  const prompt = (systemPrompt && typeof systemPrompt === "string") ? systemPrompt : SYSTEM_PROMPT;
  const model = requestedModel || "gemini-3.1-pro-preview";
  const TIMEOUT_MS = 290_000;

  const userText = `${prompt}\n\n---\n\n以下是用户的剧本：\n\n${script}`;

  console.log(`script-decompose streaming, model: ${model}, endpoint: ${baseUrl}`);

  // Use generateContent instead of streamGenerateContent for faster response
  const { url: apiUrl, headers: apiHeaders } = buildGeminiRequest(baseUrl, `/models/${model}:generateContent`, apiKey);
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 40960, // 减少到合理范围
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: apiHeaders,
      body: requestBody,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && (err.message.includes("abort") || err.name === "AbortError");
    return new Response(
      JSON.stringify({ error: isTimeout ? "AI 服务连接超时" : `模型调用失败: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!geminiResponse.ok) {
    clearTimeout(timeoutId);
    const errText = await geminiResponse.text();
    console.error(`Model ${model} returned ${geminiResponse.status}:`, errText);
    return new Response(
      JSON.stringify({ error: `模型 ${model} 调用失败 (${geminiResponse.status})` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Non-streaming response - get full text at once
  clearTimeout(timeoutId);
  const geminiData = await geminiResponse.json();
  const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return new Response(resultText, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
          sseBuffer = sseBuffer.slice(newlineIdx + 1);
        }
      }
    } catch (err) {
      console.error("Stream read error:", err);
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  return new Response(resultText, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});
