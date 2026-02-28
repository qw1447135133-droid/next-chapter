// generate-character v3 — Storage upload + 2K resolution
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_VERSION = "v3-storage-2k";

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
      return new Response(JSON.stringify({ error: "缺少角色名称" }), {
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

    const characterDesc = description || name;

    const styleMap: Record<string, string> = {
      "live-action": "Photorealistic live-action cinematography. Shot on high-end cinema camera (ARRI Alexa / RED V-Raptor). Cinematic lighting with motivated key light, soft fill, and subtle rim light. Film-grade color grading with natural skin tones, accurate subsurface scattering on skin, pore-level detail, real fabric weave and stitching on clothing. Shallow depth of field with anamorphic bokeh. No post-processing glow or bloom. The image must look indistinguishable from a real film still.",
      "hyper-cg": "Hyper-realistic CG render at AAA game cinematic quality (Unreal Engine 5 / Nanite-level detail). Physically-based rendering (PBR) with ray-traced global illumination, accurate subsurface scattering on skin, micro-detail normal maps on all surfaces. Ultra-high polygon count with no visible faceting. Realistic hair strand simulation, cloth physics folds, and specular response on metals and wet surfaces. Studio-quality three-point lighting setup with HDRI environment reflections.",
      "3d-cartoon": "3D cartoon animation style matching Pixar / Disney / Illumination feature-film quality. Smooth subdivided surfaces with appealing stylized proportions (slightly oversized head, expressive eyes). Soft volumetric ambient occlusion, subsurface scattering on skin for a warm translucent feel. Rim lighting for silhouette readability. Rich saturated color palette with complementary accent colors. Clean topology with no artifacts. The character should feel like a frame from a theatrical animated feature.",
      "2.5d-stylized": "2.5D stylized illustration blending hand-painted 2D textures over 3D geometry, inspired by Spider-Man: Into the Spider-Verse and Arcane: League of Legends. Visible artistic brushstrokes, Ben-Day dots, and cross-hatching layered on top of three-dimensional forms. Graphic novel panel aesthetic with strong ink outlines of varying weight. Limited but bold color palette with intentional color holds on linework. Slight printing misregistration effect. Mixed frame-rate feel captured in a still image.",
      "anime-3d": "3D cel-shaded anime style inspired by Genshin Impact, Honkai: Star Rail, and Guilty Gear Strive. Hard-edge toon shading with exactly 2-3 shadow steps and no smooth gradients. Crisp black outlines of uniform weight rendered over clean 3D geometry. Anime-proportioned facial features: large luminous eyes with detailed iris highlights, small nose and mouth. Vibrant highly-saturated color palette. Specular highlights rendered as sharp geometric shapes. Hair rendered as stylized chunky planes with clear silhouette.",
      "cel-animation": "Traditional 2D hand-drawn cel animation style evoking classic Disney Renaissance, Studio Ghibli, and golden-age theatrical shorts. Crisp confident ink lineart with consistent line weight and occasional taper. Large areas of flat solid color fills with no gradients. Shadow rendered as a single flat darker tone with a razor-sharp terminator line (no soft falloff). Highlight as a single lighter shape. Clean negative space. Slight paper-texture grain overlay. The image should feel like a hand-inked and hand-painted animation cel photographed on a rostrum camera.",
      "retro-comic": "Vintage American comic book style evoking 1960s-1970s Marvel / DC print era and pulp illustration. Bold, confident ink outlines with dramatic thick-to-thin brush strokes. High-contrast flat color blocks using a limited CMYK print palette. Mechanical halftone Ben-Day dot patterns for all mid-tones, shadows, and gradients (visible dot grid, not smooth). Slight ink bleed and paper yellowing. Strong chiaroscuro lighting with deep black shadows. Dynamic poses with foreshortening. Speech-balloon-ready composition. The image must feel like a freshly printed newsprint comic page.",
    };
    const styleDesc = styleMap[style] || styleMap["live-action"];

    const prompt = `Create a professional character design reference sheet for an animated character: "${name}" - ${characterDesc}.

Art style: ${styleDesc}.

The image should be a clean character turnaround sheet with 4 views arranged in a 2x2 grid on a plain white background:
- Top-left: FRONT VIEW (full body, facing camera)
- Top-right: SIDE VIEW (full body, profile view from the right)
- Bottom-left: BACK VIEW (full body, facing away)
- Bottom-right: FACE CLOSE-UP (detailed head/face portrait)

Each view should be labeled clearly. The character design must be consistent across all 4 views. The entire image MUST be in ${styleDesc} style.`;

    console.log(`[${FUNCTION_VERSION}] Calling API for character:`, name, "style:", style, "model:", model || "gemini-3-pro-image-preview");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 170000);

    const selectedModel = model || "gemini-3-pro-image-preview";
    const isSeedream = selectedModel.startsWith("doubao-seedream");

    let imageBase64 = "";
    let mimeType = "image/png";

    if (isSeedream) {
      const jimengKey = Deno.env.get("JIMENG_API_KEY");
      if (!jimengKey) {
        clearTimeout(timeout);
        return new Response(JSON.stringify({ error: "JIMENG_API_KEY 未配置" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const seedreamResp = await fetch(`${ZHANHU_BASE_URL.replace("/v1beta", "")}/v1/images/generations/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jimengKey}` },
          signal: controller.signal,
          body: JSON.stringify({ model: selectedModel, prompt, size: "1920x1080", watermark: false }),
        });
        clearTimeout(timeout);

        if (!seedreamResp.ok) {
          const errText = await seedreamResp.text();
          console.error("Seedream API error:", seedreamResp.status, errText);
          return new Response(JSON.stringify({ error: `Seedream 生成失败 (${seedreamResp.status})` }), {
            status: seedreamResp.status >= 400 && seedreamResp.status < 500 ? seedreamResp.status : 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const seedreamData = await seedreamResp.json();
        const imgItem = seedreamData.data?.[0];
        if (imgItem?.b64_json) {
          imageBase64 = imgItem.b64_json;
        } else if (imgItem?.url) {
          const imgResp = await fetch(imgItem.url);
          if (!imgResp.ok) {
            return new Response(JSON.stringify({ error: "Seedream 图片下载失败" }), {
              status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const imgBuffer = await imgResp.arrayBuffer();
          const imgBytes = new Uint8Array(imgBuffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < imgBytes.length; i += chunkSize) {
            binary += String.fromCharCode(...imgBytes.subarray(i, i + chunkSize));
          }
          imageBase64 = btoa(binary);
          const ct = imgResp.headers.get("content-type") || "";
          mimeType = ct.includes("png") ? "image/png" : "image/jpeg";
        }
      } catch (fetchErr) {
        clearTimeout(timeout);
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("Seedream fetch failed:", msg);
        const isTimeout = msg.includes("abort");
        return new Response(JSON.stringify({ error: isTimeout ? "AI 生成超时，请重试" : `网络错误: ${msg}` }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Gemini models
      let response: Response;
      try {
        response = await fetch(
          `${ZHANHU_BASE_URL}/models/${selectedModel}:generateContent/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ZHANHU_API_KEY}` },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
                imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
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
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clearTimeout(timeout);
      console.log("ZhanHu API response status:", response.status);

      if (!response.ok) {
        const errText = await response.text();
        console.error("ZhanHu API error:", response.status, errText);
        return new Response(JSON.stringify({ error: `AI 图像生成失败 (${response.status})` }), {
          status: response.status >= 400 && response.status < 500 ? response.status : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
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
    }

    // Upload to Supabase Storage
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ensure bucket exists
    await supabaseAdmin.storage.createBucket("generated-images", { public: true, fileSizeLimit: 52428800 }).catch(() => {});

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const fileName = `characters/${crypto.randomUUID()}.${ext}`;

    // Decode base64 to binary
    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`Uploading character image: ${fileName}, size: ${bytes.length} bytes`);

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

    const { data: urlData } = supabaseAdmin.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    console.log("Image uploaded successfully:", urlData.publicUrl);

    return new Response(JSON.stringify({ imageUrl: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-character error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
