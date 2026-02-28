import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZHANHU_BASE_URL = "http://202.90.21.53:13003/v1beta";

const SYSTEM_PROMPT = `你是一位专业的影视视频生成提示词工程师。你的任务是将简短的分镜描述扩展为丰富、具体、富有画面感的视频生成提示词。

## 核心原则

1. **动态感**：明确描述运动轨迹、速度变化、力量冲击。例如"飞斧击中"要扩展为旋转速度、击中瞬间的冲击波、碎片飞溅方向等。
2. **空间感**：描述前景、中景、背景的层次关系，营造纵深。补充环境细节如烟尘、光影、粒子效果。
3. **画面细节**：补充材质质感（金属光泽、血液粘稠度、布料飘动）、光照效果（逆光、火光映照、阴影投射）。
4. **镜头语言**：根据内容暗示合适的镜头运动（推拉摇移跟、升降、手持晃动等），但用画面描述表达而非术语。
5. **情绪氛围**：通过色调、节奏、声效暗示来强化情绪。

## 约束

- 输出只包含增强后的提示词文本，不要任何解释、标题或标记
- 保持原文核心叙事不变，只做画面细节的扩展和动态描述的强化
- 控制在600字以内
- 使用中文输出
- 不要添加原文没有的角色或剧情事件
- 如果有参考图（img2video模式），侧重描述动态变化、运动过程和力量感，而非静态外观

## 输出格式

请严格按以下 JSON 格式输出，不要添加任何其他文字或 markdown 标记：
{"enhanced":"增强后的提示词","duration":秒数(整数,4到8),"durationReason":"简短说明时长判定理由"}

## duration 判定规则（整数，范围4~8秒）

由于每个分镜的内容较精简，时长必须严格控制在4~8秒，保证整体节奏紧凑。

### 维度1：动作复杂度（权重最高）
- 无动作/静态画面/空镜头 → 基准4秒
- 单一简单动作（转头、举手、走路） → 基准4~5秒
- 中等动作（挥剑、跑步、推开门） → 基准5~6秒
- 复杂动作（格斗、飞斧击中+碎片飞溅、追逐） → 基准6~7秒
- 极复杂多阶段动作（连续招式、多回合攻防） → 基准7~8秒

### 维度2：对白长度
- 无对白 → +0秒
- 短对白（≤10字） → +0秒
- 中对白（11~25字） → +1秒
- 长对白（>25字） → +1~2秒

### 维度3：情绪节奏
- 快节奏（紧张、战斗、追逐、冲击） → -1秒（快切更有冲击力，战斗画面宜短不宜长）
- 正常节奏 → +0秒
- 慢节奏（抒情、回忆、渲染） → +1秒

### 计算方法
最终时长 = clamp(基准 + 对白加成 + 情绪调整, 4, 8)

关键原则：
- 战斗/冲击类镜头控制在5~6秒，快切保持冲击力和节奏感
- 宁可偏短不要偏长，紧凑的节奏比拖沓更有感染力
- 只有带长对白或慢节奏抒情镜头才允许7~8秒`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      description,
      sceneName,
      characters,
      dialogue,
      prevDescription,
      nextDescription,
      hasRefImage,
    } = await req.json();

    if (!description) {
      return new Response(
        JSON.stringify({ error: "缺少分镜描述" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ZHANHU_API_KEY = Deno.env.get("Gemini");
    if (!ZHANHU_API_KEY) {
      console.warn("Gemini API Key not configured, returning original");
      return new Response(
        JSON.stringify({ enhanced: description, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user prompt with context
    const parts: string[] = [];
    if (sceneName) parts.push(`【场景】${sceneName}`);
    if (characters?.length) parts.push(`【人物】${characters.join("、")}（共${characters.length}人）`);
    if (prevDescription) parts.push(`【上一个分镜】${prevDescription}`);
    parts.push(`【当前分镜描述】${description}`);
    if (nextDescription) parts.push(`【下一个分镜】${nextDescription}`);
    if (dialogue) {
      const dialogueLen = dialogue.length;
      parts.push(`【对白】${dialogue}（${dialogueLen}字）`);
    }
    if (hasRefImage) parts.push(`（注意：此分镜已有参考图，重点描述动态变化和运动过程，而非静态外观）`);

    const userPrompt = parts.join("\n");

    const response = await fetch(
      `${ZHANHU_BASE_URL}/models/gemini-3-flash-preview:generateContent/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ZHANHU_API_KEY}` },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ZhanHu AI error:", response.status, errText);
      return new Response(
        JSON.stringify({ enhanced: description, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    // Try to parse as JSON to extract enhanced + duration
    let enhanced = description;
    let duration = 5;
    let durationReason = "";
    try {
      const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.enhanced) enhanced = parsed.enhanced;
      if (typeof parsed.duration === "number" && parsed.duration >= 4 && parsed.duration <= 8) duration = Math.round(parsed.duration);
      if (parsed.durationReason) durationReason = parsed.durationReason;
    } catch {
      enhanced = rawText || description;
    }

    // Safety: truncate to 2500 chars
    const finalPrompt = enhanced.length > 2500 ? enhanced.substring(0, 2500) : enhanced;

    console.log("Enhanced prompt (duration:", duration, "s, reason:", durationReason, "):", finalPrompt.substring(0, 200));

    return new Response(
      JSON.stringify({ enhanced: finalPrompt, duration, durationReason }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enhance-video-prompt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
