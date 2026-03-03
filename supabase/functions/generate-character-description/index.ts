import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZHANHU_BASE_URL = "http://202.90.21.53:13003/v1beta";

const ETHNICITY_RULE = `### Ethnicity & Cultural Consistency (HIGHEST PRIORITY)
You MUST first determine the cultural/geographical setting of the script (e.g., Western/European, East Asian, Middle Eastern, African, Latin American, etc.).
- ALL characters MUST default to the ethnicity, skin tone, and facial features typical of that setting UNLESS the script explicitly states otherwise for a specific character.
- For a Western/European story: characters should have Caucasian features by default. Do NOT insert East Asian or other non-matching ethnic features unless the script explicitly describes that character as such.
- For an East Asian story: characters should have East Asian features by default.
- Apply the same logic for any other cultural setting.
- If the script explicitly describes a character's ethnicity or origin differently from the setting, follow the script.
This rule overrides any other inference. Ethnicity must be explicitly stated in every description.`;

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
      const result = await generateCharacterDescription(body);
      clearInterval(heartbeat);
      await writer.write(encoder.encode(JSON.stringify(result) + "\n"));
    } catch (e: any) {
      clearInterval(heartbeat);
      console.error("generate-character-description error:", e);
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

async function generateCharacterDescription(body: any) {
  const { characterName, script, costumes, model: requestedModel, geminiKey } = body;

  if (!characterName || !script) {
    throw new Error("缺少角色名称或剧本内容");
  }

  const ZHANHU_API_KEY = geminiKey || Deno.env.get("Gemini");
  if (!ZHANHU_API_KEY) {
    throw new Error("Gemini API Key 未配置，请在设置中配置");
  }

  const hasCostumes = Array.isArray(costumes) && costumes.length > 0;

  const systemPrompt = hasCostumes
    ? `You are a professional film character designer and AI image-prompt expert. Based on the script and character name, produce:

1. A brief base character description (gender, age, build, facial features, hairstyle, skin tone — NO clothing).
2. For EACH costume variant listed, produce a detailed AI-ready appearance description designed to generate a **standard character design sheet** showing the character wearing that specific outfit.

${ETHNICITY_RULE}

### Critical Layout Constraints
1. Each costume description must depict a Character Design Sheet with multiple angles (front, side, back) and face close-up.
2. NO text labels, annotations, or captions in the image.
3. Pure white background.
4. Neutral expression, upright standing pose.

### Required Elements per Costume
- Full character appearance with the specific outfit
- Fabric material, layering, accessories specific to this costume
- Maintain consistent facial features and body proportions across all costumes

### Output Format
Return a JSON object with:
- "description": base character description (appearance only, no clothing)
- "costumeDescriptions": array of objects, each with "label" and "description" fields, in the SAME ORDER as the input costumes list

Return ONLY valid JSON. No markdown, no code blocks.`
    : `You are a professional film character designer and AI image-prompt expert. Your core task is: based on the script provided by the user and a specified character name, produce a detailed AI-ready appearance description designed to generate a **standard character design sheet**.

${ETHNICITY_RULE}

### Critical Layout Constraints (must be translated into drawing instructions)

These constraints have the HIGHEST priority in your output:

1. **Layout & Views**: The image must be a single **Character Design Sheet** showing the character from **multiple angles** (front, side, back) and including a face close-up, arranged in a clear and organized layout.
   - **DO NOT** include any text labels, annotations, or captions in the image. No "FRONT VIEW", "SIDE VIEW", or any other text overlays. The image must be purely visual with zero text elements.

2. **Cross-view Consistency**: Clothing structure, weapons, accessories, body proportions, and facial features must remain absolutely identical across all views.

3. **Background**: Pure white background, solid white, absolutely clean — no scene elements, lighting shadows, or environmental clutter.

4. **Expression & Pose**: The character must have a neutral expression (emotionless, blank stare) and maintain a rigid, upright standing pose. No emotional expressions allowed — this is an objective industrial design reference.

### Character Design Reasoning

Even if the script does not directly describe the character's appearance, you MUST infer concrete visual details from contextual clues: era/setting, story genre, character role, personality traits, social status, and approximate age.

### Required Description Elements

Your description must cover ALL of the following so it can be directly converted into a high-quality AI image prompt:

- Gender and approximate age
- Height and build (e.g., lean, muscular, hunched)
- Facial features (face shape, distinctive features, skin texture, scars or blemishes)
- Hairstyle and hair color
- Skin tone and ethnicity (MUST match the script's cultural setting)
- Clothing style and specific garments (must detail fabric material, layering structure, wear/tear level, weathering)
- Accessories and handheld props (e.g., canteen, spear, leg wraps — specific design details)

### Output Format

Write in vivid, visually precise English that can be used directly as an AI image generation prompt. Explicitly state "no text, no labels, no annotations, no captions anywhere in the image". Return ONLY plain text character description. **ABSOLUTELY DO NOT** return JSON, code blocks, or any other formatting. Begin the description immediately upon receiving the script and character name.`;

  const userContent = hasCostumes
    ? `Script content:\n${script}\n\nCharacter: "${characterName}"\nCostume variants to describe (in order): ${JSON.stringify(costumes)}\n\nGenerate the base description and per-costume descriptions as specified.`
    : `Script content:\n${script}\n\nGenerate a detailed appearance and design description for the character "${characterName}".`;

  const useModel = requestedModel || "gemini-3-pro-preview";
  const isThinking = useModel.toLowerCase().includes("thinking");

  const generationConfig: any = {
    ...(hasCostumes ? { responseMimeType: "application/json" } : {}),
    ...(isThinking ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
  };
  const TIMEOUT_MS = 290_000;

  console.log(`generate-character-description using model: ${useModel}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(
      `${ZHANHU_BASE_URL}/models/${useModel}:generateContent/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZHANHU_API_KEY}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
          ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && (err.message.includes("abort") || err.name === "AbortError");
    throw new Error(isTimeout ? "AI 生成超时，请重试" : `网络错误: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const t = await response.text();
    console.error("ZhanHu API error:", response.status, t);
    throw new Error(`AI 调用失败 (${response.status})`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought) || [];
  const rawText = parts.map((p: any) => p.text || "").join("").trim();

  if (hasCostumes) {
    try {
      const parsed = JSON.parse(rawText);
      return {
        description: parsed.description || "",
        costumeDescriptions: parsed.costumeDescriptions || [],
      };
    } catch (parseErr) {
      console.error("Failed to parse costume JSON:", parseErr, "Raw:", rawText.slice(0, 500));
      return { description: rawText };
    }
  } else {
    return { description: rawText };
  }
}
