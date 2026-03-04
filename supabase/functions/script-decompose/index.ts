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
    url = `${baseUrl}${path}?key=${apiKey}`;
  }
  console.log(`buildGeminiRequest: endpoint=${baseUrl}, keyLen=${apiKey?.length}, authMethod=${isDefaultProxy ? "Bearer" : isGoogleOfficial ? "x-goog-api-key" : "query-param"}`);
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

  // Use streamGenerateContent for real-time token streaming
  const { url: apiUrl, headers: apiHeaders } = buildGeminiRequest(baseUrl, `/models/${model}:streamGenerateContent?alt=sse`, apiKey);
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
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

  // Stream SSE from Gemini → forward text tokens to client as raw text chunks
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    const reader = geminiResponse.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      await writer.write(encoder.encode(JSON.stringify({ error: "无响应流" }) + "\n"));
      await writer.close();
      return;
    }

    const decoder = new TextDecoder();
    let sseBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        let newlineIdx: number;
        while ((newlineIdx = sseBuffer.indexOf("\n")) !== -1) {
          const line = sseBuffer.slice(0, newlineIdx).trim();
          sseBuffer = sseBuffer.slice(newlineIdx + 1);

          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const parts = chunk?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.thought) continue; // skip thinking tokens
              if (part.text) {
                // Forward raw text token to client
                await writer.write(encoder.encode(part.text));
              }
            }
          } catch {
            // Incomplete JSON in SSE, skip
          }
        }
      }
    } catch (err) {
      console.error("Stream read error:", err);
      try {
        await writer.write(encoder.encode("\n" + JSON.stringify({ error: "流读取异常" })));
      } catch {}
    } finally {
      clearTimeout(timeoutId);
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});
