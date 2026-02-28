import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZHANHU_BASE_URL = "http://202.90.21.53:13003/v1beta";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { characterName, script } = await req.json();

    if (!characterName || !script) {
      return new Response(JSON.stringify({ error: "缺少角色名称或剧本内容" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ZHANHU_API_KEY = Deno.env.get("ZHANHU_API_KEY");
    if (!ZHANHU_API_KEY) {
      return new Response(JSON.stringify({ error: "ZHANHU_API_KEY 未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a professional film character designer and AI image-prompt expert. Your core task is: based on the script provided by the user and a specified character name, produce a detailed AI-ready appearance description designed to generate a **standard character design sheet**.

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
- Skin tone
- Clothing style and specific garments (must detail fabric material, layering structure, wear/tear level, weathering)
- Accessories and handheld props (e.g., canteen, spear, leg wraps — specific design details)

### Output Format

Write in vivid, visually precise English that can be used directly as an AI image generation prompt. Explicitly state "no text, no labels, no annotations, no captions anywhere in the image". Return ONLY plain text character description. **ABSOLUTELY DO NOT** return JSON, code blocks, or any other formatting. Begin the description immediately upon receiving the script and character name.`;

    const userContent = `Script content:\n${script}\n\nGenerate a detailed appearance and design description for the character "${characterName}".`;

    const response = await fetch(
      `${ZHANHU_BASE_URL}/models/gemini-3.1-pro-preview:generateContent/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZHANHU_API_KEY}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
        }),
      },
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("ZhanHu API error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI 调用失败 (${response.status})` }), {
        status: response.status >= 400 && response.status < 500 ? response.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-character-description error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
