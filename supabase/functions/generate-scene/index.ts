import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { name, description, style, model } = await req.json();

    if (!name) {
      return new Response(JSON.stringify({ error: "缺少场景名称" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ZHANHU_API_KEY = Deno.env.get("Gemini");
    if (!ZHANHU_API_KEY) {
      return new Response(JSON.stringify({ error: "Gemini API Key 未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneDesc = description || name;

    const styleMap: Record<string, string> = {
      "live-action": "Photorealistic live-action cinematography of an environment / location. Shot on high-end cinema camera with cinematic lighting, motivated practical light sources, film-grade color grading, real-world material textures (concrete, wood, metal, fabric), atmospheric haze and depth fog, shallow depth of field with anamorphic bokeh. The image must look indistinguishable from a real film location scout photograph.",
      "hyper-cg": "Hyper-realistic CG environment render at AAA game cinematic quality (Unreal Engine 5 / Nanite-level). Physically-based rendering with ray-traced global illumination, accurate material PBR responses, volumetric fog and god rays, ultra-detailed environment props with micro-surface detail. HDRI sky lighting with realistic time-of-day atmosphere. No visible LOD pop-in or texture stretching.",
      "3d-cartoon": "3D cartoon environment matching Pixar / Disney / Illumination feature-film quality. Stylized but detailed world-building with appealing shape language (rounded edges, exaggerated proportions). Soft volumetric lighting with warm ambient occlusion. Rich saturated color palette with clear color storytelling. Clean modular set design that feels like a miniature stage set brought to life.",
      "2.5d-stylized": "2.5D stylized environment illustration blending hand-painted 2D textures over 3D geometry, inspired by Spider-Man: Into the Spider-Verse and Arcane: League of Legends. Visible artistic brushstrokes and cross-hatching on architectural surfaces. Graphic novel aesthetic with strong ink outlines of varying weight. Bold limited color palette with intentional color holds. Slight printing misregistration effect. Atmospheric depth achieved through layered parallax planes.",
      "anime-3d": "3D cel-shaded anime environment inspired by Genshin Impact and Honkai: Star Rail open-world landscapes. Hard-edge toon shading with 2-3 shadow steps on all surfaces. Clean outlines on major architectural forms. Vibrant highly-saturated color palette with stylized foliage and sky. Specular highlights as sharp geometric shapes on water and metal. Anime-style clouds and atmospheric perspective.",
      "cel-animation": "Traditional 2D hand-painted background art in the style of classic Disney, Studio Ghibli, and golden-age animation. Lush painterly environment with visible gouache / watercolor brushwork. Flat perspective with subtle depth layering for multiplane camera effect. Warm natural color palette with soft atmospheric gradients in sky and distance. No lineart on backgrounds — shapes defined by color and value changes. Slight paper-texture grain overlay.",
      "retro-comic": "Vintage American comic book environment evoking 1960s-1970s Marvel / DC print era. Bold ink outlines on architecture and props with dramatic thick-to-thin brushwork. High-contrast flat color blocks using limited CMYK palette. Mechanical halftone Ben-Day dot patterns for skies, shadows, and gradients. Slight ink bleed and paper yellowing. Strong chiaroscuro lighting with deep black shadow areas. The environment must feel like a freshly printed comic panel background.",
    };
    const styleDesc = styleMap[style] || styleMap["live-action"];

    const prompt = `Create a detailed, high-quality background/environment concept art for a scene called "${name}".

Scene description: ${sceneDesc}

Art style: ${styleDesc}.

This is a wide establishing shot showing the full environment. Focus on atmosphere, lighting, and mood. No characters or people in the scene - only the environment/location itself. Professional concept art quality.`;

    console.log("Calling ZhanHu API for scene:", name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 280000);

    let response: Response;
    try {
      response = await fetch(
        `${ZHANHU_BASE_URL}/models/${model || "gemini-3-pro-image-preview"}:generateContent/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ZHANHU_API_KEY}` },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              imageConfig: {
                aspectRatio: "16:9",
                imageSize: "4K",
              },
            },
          }),
        },
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error("Fetch failed:", msg);
      const isTimeout = msg.includes("abort");
      return new Response(JSON.stringify({ error: isTimeout ? "AI 生成超时，请重试" : `网络错误: ${msg}` }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timeout);
    console.log("ZhanHu API response status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error("ZhanHu API error:", response.status, errText);
      return new Response(JSON.stringify({ error: `AI 场景图生成失败 (${response.status})` }), {
        status: response.status >= 400 && response.status < 500 ? response.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    let imageBase64 = "";
    let mimeType = "image/png";
    const parts = data.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          mimeType = part.inlineData.mimeType || "image/png";
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI 未返回场景图" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to Supabase Storage
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Ensure bucket exists
    await supabaseAdmin.storage
      .createBucket("generated-images", { public: true, fileSizeLimit: 52428800 })
      .catch(() => {});

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const fileName = `scenes/${crypto.randomUUID()}.${ext}`;

    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`Uploading scene image: ${fileName}, size: ${bytes.length} bytes`);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("generated-images")
      .upload(fileName, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: `图片上传失败: ${uploadError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabaseAdmin.storage.from("generated-images").getPublicUrl(fileName);

    console.log("Scene image uploaded successfully:", urlData.publicUrl);

    return new Response(JSON.stringify({ imageUrl: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-scene error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
