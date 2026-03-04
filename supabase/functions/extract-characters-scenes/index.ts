import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_GEMINI_BASE_URL = "http://202.90.21.53:13003/v1beta";

/** Build URL and headers based on endpoint type */
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
    // 第三方代理（Apifox 等）使用 query parameter
    url = `${baseUrl}${path}?key=${apiKey}`;
  }
  console.log(`buildGeminiRequest: endpoint=${baseUrl}, keyLen=${apiKey?.length}, authMethod=${isDefaultProxy ? "Bearer" : isGoogleOfficial ? "x-goog-api-key" : "query-param"}`);
  return { url, headers };
}

const EXTRACTION_PROMPT = `你是一位专业影视制作分析师，擅长从剧本中精确提取角色和场景信息。

你的任务是仔细阅读用户提供的剧本，提取所有角色和场景设定。

### 角色提取要求

1. **完整提取**：识别剧本中出现的每一个有名字的角色，包括仅被提及但未出场的角色。
2. **外貌描述**：基于剧本中的直接描述或隐含线索，给出角色的外貌特征（年龄、体型、发型、肤色等）。如果剧本没有明确描写，请根据角色身份和情境做合理推断。
3. **服装变体（costumes）提取规则**：
   - 仔细通读全剧本，查找同一角色是否在不同场景穿着不同的服装/造型。
   - 如果同一角色在剧本中出现了**2套及以上**不同的服装/装扮/造型，则必须提取为 costumes 数组。
   - **年龄×服装交叉**：如果同一角色跨越不同年龄阶段（如少年期→成年期），则每个年龄段的每套服装都必须作为独立变体。label 格式为"年龄段·服装名"，例如"18岁·校服"、"40岁·西装"。
   - 每个服装变体的 description 应包含该装扮下的完整外貌特征描述（含年龄段体态特征）。
   - 如果角色只有1套服装，则将服装描述合并到角色的 description 中，**不要**生成 costumes 字段。
4. **不要遗漏**：即使角色只出现一次或只在旁白中被提及，也必须提取。

### 场景设定提取要求

1. 识别剧本中出现的所有不同场景/地点。
2. 为每个场景提供详细的环境描述（时间、光线、空间特征、氛围等）。
3. 场景名称应简洁明了。

### 输出格式

输出一个合法的 JSON 对象，包含以下字段：

1. "characters" - 角色信息数组，每个包含：
   - name: 角色名称
   - description: 角色基础外貌描述（不含具体服装，除非只有一套服装则合并描述）
   - costumes: 服装变体数组（可选，仅当角色有2套及以上不同服装时才提供）
     每个变体包含：
     - label: 服装名称
     - description: 该服装下的完整外貌描述

2. "sceneSettings" - 场景设定数组，每个包含：
   - name: 场景名称
   - description: 环境详细描述

请严格按此 JSON 格式输出，不要输出任何其他文字。直接输出 JSON。`;

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

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const heartbeat = setInterval(() => {
    writer.write(encoder.encode("\n")).catch(() => {});
  }, 5_000);

  (async () => {
    try {
      const result = await extractCharactersAndScenes(body);
      clearInterval(heartbeat);
      await writer.write(encoder.encode(JSON.stringify(result) + "\n"));
    } catch (e: any) {
      clearInterval(heartbeat);
      console.error("extract-characters-scenes error:", e);
      try {
        await writer.write(encoder.encode(JSON.stringify({ error: e.message || "未知错误" }) + "\n"));
      } catch {}
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});

async function extractCharactersAndScenes(body: any) {
  const { script, model: requestedModel, geminiKey, geminiEndpoint } = body;

  if (!script || typeof script !== "string") {
    throw new Error("缺少剧本内容");
  }

  const apiKey = geminiKey;
  if (!apiKey) {
    throw new Error("API Key 未配置，请在设置中配置 Gemini API Key");
  }

  const baseUrl = geminiEndpoint || DEFAULT_GEMINI_BASE_URL;
  const model = requestedModel || "gemini-3.1-pro-preview";
  const TIMEOUT_MS = 290_000;
  const promptText = `${EXTRACTION_PROMPT}\n\n---\n\n以下是用户的剧本：\n\n${script}`;

  console.log(`extract-characters-scenes using model: ${model}, endpoint: ${baseUrl}`);

  const { url: apiUrl, headers: apiHeaders } = buildGeminiRequest(baseUrl, `/models/${model}:generateContent/`, apiKey);
  const requestBody = JSON.stringify({
    contents: [
      { role: "user", parts: [{ text: promptText }] },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 16384,
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
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && (err.message.includes("abort") || err.name === "AbortError");
    throw new Error(isTimeout ? "AI 服务连接超时，请稍后重试" : `模型调用失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const responseText = await geminiResponse.text();
  console.log(`Gemini response status=${geminiResponse.status}, contentType=${geminiResponse.headers.get("content-type")}, bodyPreview=${responseText.substring(0, 300)}`);

  if (!geminiResponse.ok) {
    console.error(`Model ${model} returned ${geminiResponse.status}:`, responseText);
    throw new Error(`模型 ${model} 调用失败 (${geminiResponse.status})`);
  }

  let geminiData;
  try {
    geminiData = JSON.parse(responseText);
  } catch {
    throw new Error(`模型返回非 JSON 响应 (status=${geminiResponse.status}): ${responseText.substring(0, 200)}`);
  }
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const textContent = parts
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || "")
    .join("");

  if (!textContent) {
    throw new Error("AI 返回格式异常");
  }

  let cleanedText = textContent.trim();
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    const match = cleanedText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error("无法解析 AI 返回的 JSON");
    }
  }

  const characters = parsed.characters || [];
  const sceneSettings = parsed.sceneSettings || [];

  return { characters, sceneSettings };
}
