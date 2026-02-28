import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FALLBACK_PROMPT = `你现在是一位拥有20年经验的专业电影分镜师及AI视频生成专家。你的核心任务是将用户输入的剧本，在不改变原意和过度调整内容的前提下，拆解为适合AI视频生成的15秒分段脚本。



### 核心任务流程



1.  **结构拆分**：将剧本按逻辑拆分为"集"。每集内部包含8~10个"片段"（具体数量根据剧本内容长度灵活调整），每个片段对应视频时长固定为15秒。

2.  **语速与台词容量控制（核心约束）**：严格根据对话文字长度估算15秒的物理时长限制，避免台词过载：

    * **正常语速/旁白**：15秒片段最多容纳约 **30字** 左右。

    * **快速对话/情绪激动**：15秒片段最多容纳约 **45字** 左右。

    * 若某段对白超过该字数限制，必须将其顺延拆分到下一个15秒片段中，绝不能强行堆叠。

3.  **内容切片与分镜弹性调整**：结合上述台词字数，将每个15秒片段灵活拆解为3~5个具体的"分镜"。

    * *对白密集型片段*（字数接近上限）：分镜数量可适当减少（3个左右），确保说话主体明确。

    * *动作/情绪展示型片段*（字数极少或无）：分镜数量可适当增加（4~5个），用多视角填补画面。

4.  **原汁原味与格式化**：

    * **极简干预**：严禁过度调整剧本内容。仅进行断句、拆分、文字纠错（修正错别字及明显语病）和必要的去敏化。

    * 分镜内容必须**基于原剧本文字**进行直接拆分。

    * 将原剧本中出现的所有人名、地名用\`[]\`包裹。

    * **严禁**添加原剧本中没有的人物外貌、服装、性格或多余的动作描述。

5.  **空间逻辑补全**：

    * **幽灵位（站位）**：如果某人物在当前15秒片段的剧情逻辑中应当在场，但原剧本文字未提及（无对话或动作），**必须**在合适的分镜中仅以最简练的文字补充其站位描述（例如："[张三]正站在[李四]身后"）。

6.  **去敏化**：若剧本旁白或描述中涉及敏感、暴力或违规词汇，请在保留原意的前提下替换该词汇（注：人物对白保持绝对原样，不作删减）。



### 禁忌事项



* **严禁镜头术语**：禁止出现"特写"、"全景"、"推拉摇移"、"俯视"等专业术语。只描述画面中发生了什么。

* **严禁遗漏对话**：所有对白必须完整保留在对应分镜中。

* **严禁擅自加戏**：禁止一切偏离原剧本走向的主观创作。



### 输出格式规范（严格执行）



**【第X集】**



**片段 X-1 (时长: 15s)**

* **场景/人物标签**：[场景名] [角色A] [角色B]

* **分镜脚本**：

    分镜1：[角色A]……（直接引用原剧本动作/对话，人名加方括号）

    分镜2：[角色B]……（若涉及未提及角色的站位，在此处融合描述，如：[角色C]默默站在角落）

    分镜3：……

    分镜4：……（注：根据该片段台词密度，动态输出3~5个分镜）

* **通用后缀**：无字幕、无水印、无背景音



---



**片段 X-2 (时长: 15s)**

* **前情提要**：（50字以内，简述上个片段发生的关键剧情）

* **场景/人物标签**：[场景名] [角色A] [角色C]

* **分镜脚本**：

    分镜1：……

    ...

    分镜3：……

* **通用后缀**：无字幕、无水印、无背景音



*(以此类推，按8~10个片段的节奏直至本集拆解结束)*



请等待用户输入剧本。收到剧本后，直接开始按上述格式输出，无需寒暄。`;

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

  // Use streaming response with heartbeats to prevent gateway timeout
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const heartbeat = setInterval(() => {
    writer.write(encoder.encode("\n")).catch(() => {});
  }, 10_000);

  (async () => {
    try {
      const result = await decomposeScript(body);
      clearInterval(heartbeat);
      await writer.write(encoder.encode(JSON.stringify(result) + "\n"));
    } catch (e: any) {
      clearInterval(heartbeat);
      console.error("script-decompose error:", e);
      await writer.write(encoder.encode(JSON.stringify({ error: e.message || "未知错误" }) + "\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});

async function decomposeScript(body: any) {
  const { script, systemPrompt } = body;

  if (!script || typeof script !== "string") {
    throw new Error("缺少剧本内容");
  }

  const apiKey = Deno.env.get("Gemini");
  if (!apiKey) {
    throw new Error("API Key 未配置");
  }

  const basePrompt = (systemPrompt && typeof systemPrompt === "string") ? systemPrompt : FALLBACK_PROMPT;
  
  // Always inject JSON output and segmentLabel requirements
  const jsonEnforcement = `\n\n【重要：输出格式强制要求】
无论上面的提示词如何描述输出格式，你的最终输出必须是一个合法的JSON对象（不要包含任何其他文字），包含以下字段：

1. "scenes" - 分镜数组。注意：每个15秒片段包含3~5个分镜，每集包含8~10个片段。因此scenes数组的总长度应为 (8~10片段) × (3~5分镜/片段) = 24~50个元素。
   同一个片段内的多个分镜共享相同的 segmentLabel。例如片段1-1包含3个分镜，则这3个分镜的segmentLabel都是"1-1"。
   
   每个分镜对象包含：
   - sceneNumber: 分镜全局序号（从1开始的整数，在整个scenes数组中递增）
   - segmentLabel: 该分镜所属片段的编号标签，由你根据每集8~10个片段的节奏自行计算（如"1-1"、"1-2"……"1-10"、"2-1"等），格式为"集-片段"。不要照搬剧本原文中的场景编号，而是按15秒一段重新划分。同一片段内的多个分镜必须使用相同的segmentLabel。必填项。
   - sceneName: 场景名称
   - description: 该分镜的画面描述（一个分镜对应一个具体画面动作）
   - characters: 该分镜出场角色名称数组
   - dialogue: 该分镜的对白，格式"角色名：台词"，多条用换行分隔，无对白则为空字符串
   - cameraDirection: 通用后缀（固定为"无字幕、无水印、无背景音"）
   - duration: 时长秒数（固定为15，表示该分镜所属片段的总时长）

   【关键约束】：每个segmentLabel必须对应3~5个分镜对象，绝不能1个片段只有1个分镜！

2. "characters" - 角色信息数组，每个包含 name 和 description

3. "sceneSettings" - 场景设定数组，每个包含 name 和 description（环境详细描述，不能为空）

请严格按此JSON格式输出，不要输出文本格式的分镜脚本。不要输出任何思考过程。直接输出JSON。`;
  
  const prompt = basePrompt + jsonEnforcement;

  const model = "gemini-3.1-pro-preview";
  const TIMEOUT_MS = 180_000;

  let geminiResponse: Response | null = null;
  let lastError: Error | null = null;

  const apiUrl = `http://202.90.21.53:13003/v1beta/models/${model}:generateContent/`;
  const requestBody = JSON.stringify({
    contents: [
      { role: "user", parts: [{ text: `${prompt}\n\n---\n\n以下是用户的剧本：\n\n${script}` }] },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    geminiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: requestBody,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!geminiResponse.ok) {
      const statusCode = geminiResponse.status;
      const errText = await geminiResponse.text();
      console.error(`Model ${model} returned ${statusCode}:`, errText);
      geminiResponse = null;
    } else {
      console.log(`Successfully using model: ${model}`);
    }
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    console.error(`Model ${model} failed:`, lastError.message);
    geminiResponse = null;
  }

  if (!geminiResponse) {
    const isTimeout = lastError?.message?.includes("abort") || lastError?.message?.includes("timed out") || lastError?.name === "AbortError";
    throw new Error(isTimeout ? "AI 服务连接超时，请稍后重试" : "所有模型均不可用，请稍后重试");
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text();
    console.error("Gemini API error:", geminiResponse.status, errText);
    throw new Error(`Gemini API 调用失败 (${geminiResponse.status})`);
  }

  const geminiData = await geminiResponse.json();
  const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    console.error("Unexpected Gemini response:", JSON.stringify(geminiData));
    throw new Error("Gemini 返回格式异常");
  }

  // Clean markdown code blocks if present
  let cleanedText = textContent.trim();
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed;
  const parseAttempts: (() => unknown)[] = [
    () => JSON.parse(cleanedText),
    () => {
      const match = cleanedText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("no object");
      return JSON.parse(match[0]);
    },
    () => {
      const match = cleanedText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("no array");
      return JSON.parse(match[0]);
    },
    () => {
      for (let i = cleanedText.length - 1; i >= 0; i--) {
        const ch = cleanedText[i];
        if (ch === '}' || ch === ']') {
          const startCh = ch === '}' ? '{' : '[';
          const startIdx = cleanedText.indexOf(startCh);
          if (startIdx >= 0) {
            return JSON.parse(cleanedText.substring(startIdx, i + 1));
          }
        }
      }
      throw new Error("no json bounds");
    },
  ];

  let lastErr: unknown;
  for (const attempt of parseAttempts) {
    try {
      parsed = attempt();
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (parsed === undefined) {
    console.error("All JSON parse attempts failed. Raw text:", cleanedText.substring(0, 500));
    throw new Error("无法解析 Gemini 返回的 JSON: " + (lastErr instanceof Error ? lastErr.message : String(lastErr)));
  }

  let scenes, characters, sceneSettingsData;
  if (Array.isArray(parsed)) {
    scenes = parsed;
    characters = [];
    sceneSettingsData = [];
  } else {
    scenes = (parsed as any).scenes || [];
    characters = (parsed as any).characters || [];
    sceneSettingsData = (parsed as any).sceneSettings || [];
  }

  if (scenes.length > 0 && !Array.isArray(scenes[0]) && scenes[0].scenes && Array.isArray(scenes[0].scenes)) {
    const nested = scenes[0];
    scenes = nested.scenes;
    if ((!characters || characters.length === 0) && nested.characters) characters = nested.characters;
    if ((!sceneSettingsData || sceneSettingsData.length === 0) && nested.sceneSettings) sceneSettingsData = nested.sceneSettings;
  }

  return { scenes, characters, sceneSettings: sceneSettingsData };
}