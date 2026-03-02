import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  }, 10_000);

  (async () => {
    try {
      const result = await extractCharactersAndScenes(body);
      clearInterval(heartbeat);
      await writer.write(encoder.encode(JSON.stringify(result) + "\n"));
    } catch (e: any) {
      clearInterval(heartbeat);
      console.error("extract-characters-scenes error:", e);
      await writer.write(encoder.encode(JSON.stringify({ error: e.message || "未知错误" }) + "\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});

async function extractCharactersAndScenes(body: any) {
  const { script } = body;

  if (!script || typeof script !== "string") {
    throw new Error("缺少剧本内容");
  }

  const apiKey = Deno.env.get("Gemini");
  if (!apiKey) {
    throw new Error("API Key 未配置");
  }

  const models = ["gemini-3-flash-preview", "gemini-3-pro-preview"];
  const TIMEOUT_MS = 120_000;
  const promptText = `${EXTRACTION_PROMPT}\n\n---\n\n以下是用户的剧本：\n\n${script}`;

  let geminiResponse: Response | null = null;
  let lastError: Error | null = null;

  for (const model of models) {
    const apiUrl = `http://202.90.21.53:13003/v1beta/models/${model}:generateContent/`;
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        console.log(`extract-characters-scenes using model: ${model}`);
        geminiResponse = resp;
        break;
      } else {
        const errText = await resp.text();
        console.error(`Model ${model} returned ${resp.status}:`, errText);
        lastError = new Error(`${model} failed (${resp.status})`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Model ${model} failed:`, lastError.message);
    }
  }

  if (!geminiResponse) {
    const isTimeout = lastError?.message?.includes("abort") || lastError?.name === "AbortError";
    throw new Error(isTimeout ? "AI 服务连接超时，请稍后重试" : "所有模型均不可用，请稍后重试");
  }

  const response = geminiResponse;

  const geminiData = await response.json();
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
