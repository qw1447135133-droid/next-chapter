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
    const { sceneName, script } = await req.json();

    if (!sceneName || !script) {
      return new Response(JSON.stringify({ error: "缺少场景名称或剧本内容" }), {
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

    const systemPrompt = `You are a professional film production designer. Your core task is: based on the script provided by the user and a specified scene name, produce a detailed environment description for AI image generation, aimed at creating a grand **Panoramic View** scene concept design.

### Core Generation Principles

1. **Panoramic Perspective**: The description must establish a sweeping panoramic viewpoint, emphasizing depth of field, vast spatial scale, and overall grandeur.

2. **Pure Environment / No Active Characters (Critical Constraint)**:
   - The image must be a pure establishing shot — **absolutely no** active, moving, or narrative-driven characters (e.g., charging warriors, conversing protagonists, walking pedestrians).
   - **Static scene elements are allowed**: only objects that are part of the objective environment — corpses, abandoned vehicles, sculptures, scattered weapons, etc. These serve only as background accents and must never dominate the frame.

3. **Reasonable Inference**: Even if the script does not directly describe the environment, you MUST infer concrete details from contextual clues: era/setting, story genre, geographic location, season, time of day, and character activities.

### Required Description Elements

Your description must be well-structured and cover ALL of the following, specific enough to convert directly into a high-quality AI image prompt:

- **Perspective & Composition**: Explicitly label as Panorama / Wide establishing shot.
- **Spatial Layout & Scale**: Macro terrain/topography or interior/exterior spatial structure.
- **Architectural / Natural & Decorative Style**: Aesthetic style consistent with the era and setting.
- **Lighting Direction & Intensity**: Light source position, warm/cool contrast, light-shadow atmosphere (e.g., Tyndall effect, backlit silhouette).
- **Mood & Color Palette**: Core emotional tone and dominant color scheme.
- **Time of Day & Weather**: Day/dusk/night, and specific natural conditions (e.g., mist, heavy snow, sandstorm).
- **Key Props & Scene Elements**: Emphasize static remnants (consistent with the no-active-characters rule).
- **Ground / Wall / Surface Materials**: Specific textures (e.g., muddy scorched earth, moss-covered flagstones).

### Output Format

Write in vivid, detail-rich English that can be used directly as an AI image generation prompt. Return ONLY plain text scene description. **ABSOLUTELY DO NOT** return JSON, code blocks, or any other formatting. Begin the description immediately upon receiving the script and scene name.`;

    const userContent = `Script content:\n${script}\n\nGenerate a detailed environment description for the scene "${sceneName}".`;

    const response = await fetch(
      `${ZHANHU_BASE_URL}/models/gemini-3-pro-preview:generateContent?key=${ZHANHU_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    console.error("generate-scene-description error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
