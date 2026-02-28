import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZHANHU_BASE_URL = "http://202.90.21.53:13003/v1beta";

/** Fetch an image URL and return { mimeType, base64 } */
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Chunked base64 encoding to avoid stack overflow
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const contentType = resp.headers.get("content-type") || "image/png";
    return { mimeType: contentType.split(";")[0], data: base64 };
  } catch (e) {
    console.error("Failed to fetch image:", url, e);
    return null;
  }
}

/** Extract base64 from a data URL */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/** Get image inline data from either a data URL or a regular URL */
async function getInlineData(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  if (imageUrl.startsWith("data:")) {
    return parseDataUrl(imageUrl);
  }
  if (imageUrl.startsWith("http")) {
    return fetchImageAsBase64(imageUrl);
  }
  return null;
}

/**
 * Rewrite a shot description to keep only the T=0 initial state.
 * Splits on common Chinese result/consequence connectors and drops everything after.
 * Also removes individual result phrases that describe post-action states.
 */
function rewriteToFirstFrame(desc: string): string {
  if (!desc) return desc;

  // 1. Split at consequence connectors — keep only the part BEFORE the first match
  //    These connectors signal "and then the result is…"
  const splitPatterns = /[，,]?\s*(?:瞬间|顿时|随即|紧接着|突然间|立刻|马上|随后|接着|于是|结果|导致|使得)/;
  const splitMatch = desc.match(splitPatterns);
  let cleaned = splitMatch ? desc.slice(0, splitMatch.index) : desc;

  // 2. Remove residual result/gore phrases that may still be in the kept portion
  const removePatterns = [
    /化[为成].*?(血雾|碎片|粉末|灰烬|废墟|齑粉)/g,
    /鲜血[溅飞洒喷].*?[。，,]/g,
    /血[溅飞洒喷花].*?[。，,]/g,
    /[炸爆]成.*?(碎片|粉末|废墟)/g,
    /倒[地下飞].*?[。，,]/g,
    /身体.*?(?:碎裂|断裂|爆裂|粉碎)/g,
    /尸体/g,
    /惨死/g,
  ];
  for (const pat of removePatterns) {
    cleaned = cleaned.replace(pat, "");
  }

  // 3. Rewrite action verbs to anticipation/pre-action form
  //    "飞来击中X" → "飞向X"   "砍中/刺中/击中" → "朝…挥去/刺去"
  cleaned = cleaned
    .replace(/飞来击中/g, "飞向")
    .replace(/飞来砸中/g, "飞向")
    .replace(/飞来射中/g, "射向")
    .replace(/击中/g, "朝其飞去")
    .replace(/砍中/g, "朝其挥去")
    .replace(/刺中/g, "朝其刺去")
    .replace(/射中/g, "射向")
    .replace(/撞上/g, "冲向")
    .replace(/砸中/g, "砸向")
    .replace(/劈中/g, "朝其劈去");

  // 4. Clean up: remove trailing dangling character references and punctuation
  cleaned = cleaned.replace(/[，,、]+\s*(\[[^\]]*\])\s*$/, "").replace(/[，,、。]+$/, "").replace(/\s+/g, " ").trim();

  return cleaned || desc; // fallback to original if cleaning empties it
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, characters, cameraDirection, sceneName, dialogue, style, characterDescriptions, sceneDescription, mode, characterImages, sceneImageUrl, prevStoryboardUrl, scriptExcerpt, neighborContext, aspectRatio, model } = await req.json();

    const isPanorama = mode === "panorama";

    if (!description && !isPanorama) {
      return new Response(
        JSON.stringify({ error: "缺少分镜描述" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ZHANHU_API_KEY = Deno.env.get("Gemini");
    if (!ZHANHU_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Gemini API Key 未配置" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const styleMap: Record<string, string> = {
      "live-action": "Photorealistic live-action cinematography. Cinema camera look with cinematic lighting, film-grade color grading, real-world textures, shallow depth of field, anamorphic bokeh. Indistinguishable from a real film still.",
      "hyper-cg": "Hyper-realistic CG render, AAA game cinematic quality (UE5-level). PBR materials, ray-traced global illumination, volumetric fog, ultra-detailed surfaces, HDRI environment lighting.",
      "3d-cartoon": "3D cartoon animation, Pixar/Disney feature-film quality. Stylized proportions, smooth subsurface skin, soft volumetric AO, rich saturated colors, appealing shape language.",
      "2.5d-stylized": "2.5D stylized illustration, Spider-Verse / Arcane aesthetic. Hand-painted textures over 3D forms, visible brushstrokes, Ben-Day dots, bold ink outlines, limited color palette, printing misregistration effect.",
      "anime-3d": "3D cel-shaded anime, Genshin Impact / Guilty Gear Strive style. Hard-edge 2-3 step toon shading, crisp uniform outlines, anime facial features, vibrant saturated colors, sharp geometric specular highlights.",
      "cel-animation": "Traditional 2D cel animation, Disney Renaissance / Studio Ghibli style. Crisp ink lineart, flat solid color fills, razor-sharp shadow terminator, no gradients, paper-texture grain overlay.",
      "retro-comic": "Vintage 1960s-70s American comic book style. Bold ink brush outlines, flat CMYK color blocks, mechanical halftone Ben-Day dot patterns, ink bleed, paper yellowing, deep chiaroscuro shadows.",
    };
    const styleDesc = styleMap[style] || styleMap["live-action"];

    let prompt: string;

    if (isPanorama) {
      const charList = (characters || []).join("、");
      const charDescList = (characterDescriptions || [])
        .map((c: { name: string; description: string }) => `${c.name}: ${c.description}`)
        .join("\n");

      prompt = `Create a wide panoramic establishing shot showing character positions in a scene.

Scene: "${sceneName}"
Scene description: ${sceneDescription || sceneName}
Characters present: ${charList}

Character details:
${charDescList || "No specific character details provided."}

Scene content/action: ${description}

Art style: ${styleDesc}

IMPORTANT REQUIREMENTS:
- This is a WIDE PANORAMIC shot (ultra-wide 21:9 or wider aspect ratio)
- Show ALL characters in their relative positions within the scene
- Each character should be clearly identifiable and labeled with their position
- Show the full environment/background
- Characters should be full-body, showing their spatial relationships
- This is a positioning reference chart, like a stage blocking diagram
- Professional concept art quality, clear composition`;
    } else {
      const charList = (characters || []).join("、");
      const charDescList = (characterDescriptions || [])
        .map((c: { name: string; description: string }) => `${c.name}: ${c.description}`)
        .join("\n");

      // Build narrative context from script and neighbors
      let narrativeContext = "";
      if (scriptExcerpt) {
        narrativeContext += `\n[SCRIPT CONTEXT (for tone & atmosphere reference — DO NOT copy verbatim, use to expand details consistently)]\n${scriptExcerpt}\n`;
      }
      if (neighborContext) {
        const nc = neighborContext;
        narrativeContext += `\n[SCENE CONTINUITY — Shot ${nc.currentShotIndex} of ${nc.totalShotsInScene} in this scene]`;
        if (nc.prevDescription) {
          narrativeContext += `\nPrevious shot: ${nc.prevDescription}${nc.prevCamera ? ` (Camera: ${nc.prevCamera})` : ""}`;
          if (nc.prevDialogue) narrativeContext += `\n  Dialogue: ${nc.prevDialogue}`;
        }
        if (nc.nextDescription) {
          narrativeContext += `\nNext shot: ${nc.nextDescription}`;
          if (nc.nextDialogue) narrativeContext += `\n  Dialogue: ${nc.nextDialogue}`;
        }
        narrativeContext += "\n";
      }

      // Rewrite the shot description to keep only T=0 initial state
      const firstFrameDesc = rewriteToFirstFrame(description);
      console.log("Original description:", description);
      console.log("First-frame rewrite:", firstFrameDesc);

      prompt = `You are a professional cinematic storyboard artist. Create a single storyboard frame for the shot described below. Your goal is to produce a frame that feels like a natural part of a continuous film sequence — visually coherent with previous and subsequent shots.

=== CURRENT SHOT ===
Scene: "${sceneName || "Unknown"}"
Shot description: ${firstFrameDesc}
Characters present: ${charList || "None specified"}
${charDescList ? `\nCharacter appearance (MUST follow strictly for visual consistency):\n${charDescList}` : ""}
Camera: ${cameraDirection || "Medium shot"}
${dialogue ? `Dialogue in this shot: ${dialogue}` : ""}
Scene environment: ${sceneDescription || sceneName || "Not specified"}

=== ART STYLE ===
${styleDesc}
${narrativeContext}
=== CRITICAL REQUIREMENTS ===
1. NARRATIVE EXPANSION: Based on the shot description and script context, enrich the visual details — add appropriate environmental elements, lighting mood, character micro-expressions and body language that match the narrative tone. Do NOT invent content that contradicts the script.
2. SPATIAL CONSISTENCY: If previous/next shot context is provided, maintain consistent:
   - Character positions and facing directions (e.g. if character A is on the left in the previous shot, keep them on the left unless the description explicitly states movement)
   - Background elements and environment layout (doors, windows, furniture, props must stay in the same relative positions)
   - Lighting direction and color temperature
3. CHARACTER CONSISTENCY IS THE TOP PRIORITY: each character MUST match their description exactly — hairstyle, hair color, clothing, accessories, body type, facial features. If character reference images are provided below, the generated characters MUST look identical to those references.
4. If a scene environment reference image is provided below, maintain the same environment style, layout, and atmosphere.
5. ${aspectRatio || "16:9"} cinematic composition, professional storyboard quality, cinematic lighting. The image MUST be in ${aspectRatio || "16:9"} aspect ratio.${(aspectRatio === "9:16" || aspectRatio === "2:3") ? `
6. **PORTRAIT / VERTICAL FRAME COMPOSITION (9:16 / 2:3 — CHARACTER-RELATIONSHIP-FIRST PHILOSOPHY):**
   **CORE PRINCIPLE: The vertical frame is a CHARACTER INTIMACY tool, NOT a landscape tool. Every composition decision must prioritize showing the EMOTIONAL RELATIONSHIP between characters.**
   
   **A. FRAMING HIERARCHY (from most preferred to least preferred):**
   - MOST PREFERRED: Two-shot close-ups capturing both characters' faces/expressions in the same frame — stacked vertically (one above, one below) or at diagonal eyelines
   - HIGHLY PREFERRED: Over-the-shoulder shots that show one character's face with the other's shoulder/silhouette framing the edge
   - PREFERRED: Tight medium shots (waist-up) with characters physically close, overlapping personal space
   - ACCEPTABLE: Cowboy shots (thigh-up) with clear interpersonal tension visible in body language
   - AVOID UNLESS SCRIPT DEMANDS: Full-body shots, wide/establishing shots, landscapes, environments without characters filling the frame
   
   **B. SPATIAL COMPRESSION (CRITICAL):**
   - FILL the frame with characters — minimal headroom, minimal space between characters
   - Use SHALLOW depth of field aggressively: background should be a soft bokeh wash, NOT a detailed environment
   - Characters should occupy at least 60-80% of the frame area
   - If two characters are in the shot, their faces should be within the same vertical third of the frame when possible
   - Background is ATMOSPHERE, not geography — convey location through color temperature, light quality, and vague shapes, NOT architectural details
   - NO empty sky, NO wide floor space, NO distant horizon lines
   
   **C. EMOTIONAL MICRO-EXPRESSIONS:**
   - Eyes are the anchor of every frame: catch-lights, tear reflections, narrowed lids, widened pupils
   - Show SUBTLE body language: a tightened jaw, a hand almost-but-not-quite touching someone, fingers curling into a fist, a slight lean toward or away from the other person
   - Skin texture, pores, sweat droplets, tear tracks should be visible in close-ups
   
   **D. VERTICAL COMPOSITION TECHNIQUES:**
   - Stack character eyelines at different heights to create power dynamics (dominant character higher)
   - Use vertical leading lines (a character's arm, a weapon, a doorframe edge) to connect two characters within the frame
   - Dutch angle (10-20° tilt) to heighten tension in confrontation scenes
   - Rack-focus compositions: sharp foreground character, soft background character (or vice versa) to direct emotional attention
   
   **E. LIGHTING FOR INTIMACY:**
   - Prefer dramatic side-lighting (Rembrandt, split lighting) that sculpts facial features
   - Use rim/backlight to separate characters from backgrounds without showing the background in detail
   - Color contrast between characters (warm key on one, cool fill on the other) to visualize emotional opposition` : ""}

${(aspectRatio === "9:16" || aspectRatio === "2:3") ? "7" : "6"}. Ultra high resolution.
${(aspectRatio === "9:16" || aspectRatio === "2:3") ? "8" : "7"}. Depict EXACTLY this single shot as described — show the specific action, character positions, and emotion.
${(aspectRatio === "9:16" || aspectRatio === "2:3") ? "9" : "8"}. **FIRST-FRAME PRINCIPLE (HIGHEST PRIORITY — overrides all other composition rules):**
   This image represents the VERY FIRST FRAME of a video clip — the frame shown at time T=0 before any playback begins.
   - Read the shot description and identify ALL verbs/actions (e.g. "flies", "hits", "falls", "explodes", "runs", "turns into").
   - Then REWIND to the moment JUST BEFORE the FIRST action verb begins. That frozen instant is what you must depict.
   - Characters must be completely static, in anticipation poses — NO motion blur, NO mid-swing limbs, NO objects in mid-flight trajectory.
   - Example: "A huge axe spins toward [Old Soldier] and hits him, turning him into blood mist" → Show the axe STILL IN THE THROWER'S HAND or just leaving the hand. Old Soldier stands unaware/bracing. No axe in the air, no impact, no blood.
   - Example: "Character jumps off the cliff" → Show character standing at cliff edge, about to jump. Both feet on ground.
   - Example: "An explosion destroys the building" → Show the building intact, with perhaps a fuse lit or a projectile approaching from far away.
   - NEVER depict: motion blur, impact moments, deformation, gore, splatter, mid-air objects, falling bodies, or any state that occurs AFTER T=0.
   - If in doubt, choose the EARLIER, more static moment.`;
    }

    // Build multimodal parts: text prompt + reference images
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    parts.push({ text: prompt });

    // Add scene reference image if available (supports both data URLs and storage URLs)
    if (sceneImageUrl && typeof sceneImageUrl === "string") {
      const inlineData = await getInlineData(sceneImageUrl);
      if (inlineData) {
        parts.push({ inlineData });
        parts.push({ text: `Above is a WIDE ESTABLISHING SHOT of this scene's environment — use it ONLY as a reference for the environment style, color palette, architecture, props, and lighting atmosphere. Do NOT replicate the same wide/panoramic framing. Instead, compose this frame according to the camera direction specified: "${cameraDirection || "Medium shot"}". Adjust the shot scale (close-up, medium, wide, etc.) to match the described action and emotion.` });
      }
    }

    // Add character reference images if available
    if (Array.isArray(characterImages)) {
      for (const charImg of characterImages) {
        if (charImg.imageUrl && typeof charImg.imageUrl === "string") {
          const inlineData = await getInlineData(charImg.imageUrl);
          if (inlineData) {
            parts.push({ inlineData });
            parts.push({ text: `Above is the reference sheet for character "${charImg.name}". Keep this character's appearance consistent.` });
          }
        }
      }
    }

    // Add previous storyboard image for visual continuity within the same scene
    if (prevStoryboardUrl && typeof prevStoryboardUrl === "string") {
      const inlineData = await getInlineData(prevStoryboardUrl);
      if (inlineData) {
        parts.push({ inlineData });
        parts.push({ text: "Above is the PREVIOUS SHOT's storyboard frame in the same scene. Maintain visual continuity: keep consistent character positions, background layout, lighting, and spatial relationships. This shot should feel like the natural next frame in the sequence." });
      }
    }

    const selectedModel = model || "gemini-3-pro-image-preview";
    const isSeedream = selectedModel.startsWith("doubao-seedream");

    let imageBase64 = "";
    let mimeType = "image/png";

    if (isSeedream) {
      // Seedream uses OpenAI Images API format: POST /v1/images/generations/
      // Supports multi-image fusion via "image" array parameter
      const jimengKey = Deno.env.get("JIMENG_API_KEY");
      if (!jimengKey) {
        return new Response(
          JSON.stringify({ error: "JIMENG_API_KEY 未配置" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Collect reference image URLs for multi-image fusion
      const refImages: string[] = [];
      let imageDescriptions = "";

      // Add character reference images
      if (Array.isArray(characterImages)) {
        for (const charImg of characterImages) {
          if (charImg.imageUrl && typeof charImg.imageUrl === "string" && !charImg.imageUrl.startsWith("data:")) {
            refImages.push(charImg.imageUrl);
            imageDescriptions += `\n图${refImages.length} 是角色「${charImg.name}」的设计参考图，请保持该角色外观一致。`;
          }
        }
      }

      // Add scene reference image
      if (sceneImageUrl && typeof sceneImageUrl === "string" && !sceneImageUrl.startsWith("data:")) {
        refImages.push(sceneImageUrl);
        imageDescriptions += `\n图${refImages.length} 是场景环境参考图，请保持环境风格一致。`;
      }

      // Add previous storyboard for continuity
      if (prevStoryboardUrl && typeof prevStoryboardUrl === "string" && !prevStoryboardUrl.startsWith("data:")) {
        refImages.push(prevStoryboardUrl);
        imageDescriptions += `\n图${refImages.length} 是上一个镜头的分镜图，请保持视觉连续性。`;
      }

      const fullPrompt = refImages.length > 0
        ? `${prompt}\n\n参考图说明：${imageDescriptions}`
        : prompt;

      const seedreamPayload: Record<string, unknown> = {
        model: selectedModel,
        prompt: fullPrompt,
        size: "2K",
        watermark: false,
      };

      if (refImages.length > 0) {
        seedreamPayload.image = refImages;
        seedreamPayload.sequential_image_generation = "disabled";
      }

      console.log("Calling Seedream API via /v1/images/generations/, model:", selectedModel, "ref images:", refImages.length);

      const seedreamResp = await fetch(`${ZHANHU_BASE_URL.replace("/v1beta", "")}/v1/images/generations/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jimengKey}`,
        },
        body: JSON.stringify(seedreamPayload),
      });

      if (!seedreamResp.ok) {
        const errText = await seedreamResp.text();
        console.error("Seedream API error:", seedreamResp.status, errText);
        return new Response(
          JSON.stringify({ error: `Seedream 生成失败 (${seedreamResp.status})` }),
          { status: seedreamResp.status >= 400 && seedreamResp.status < 500 ? seedreamResp.status : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const seedreamData = await seedreamResp.json();
      console.log("Seedream response keys:", Object.keys(seedreamData));

      // OpenAI Images API response: { data: [{ url: "...", b64_json: "..." }] }
      const imgItem = seedreamData.data?.[0];
      if (imgItem?.b64_json) {
        imageBase64 = imgItem.b64_json;
        mimeType = "image/png";
      } else if (imgItem?.url) {
        // Download image from URL
        console.log("Downloading Seedream image from URL:", imgItem.url.slice(0, 100));
        const imgResp = await fetch(imgItem.url);
        if (!imgResp.ok) {
          return new Response(
            JSON.stringify({ error: "Seedream 图片下载失败" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const imgBuffer = await imgResp.arrayBuffer();
        const imgBytes = new Uint8Array(imgBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < imgBytes.length; i += chunkSize) {
          binary += String.fromCharCode(...imgBytes.subarray(i, i + chunkSize));
        }
        imageBase64 = btoa(binary);
        const contentType = imgResp.headers.get("content-type") || "";
        mimeType = contentType.includes("png") ? "image/png" : "image/jpeg";
      } else {
        console.error("Seedream: no image in response:", JSON.stringify(seedreamData).slice(0, 500));
        return new Response(
          JSON.stringify({ error: "Seedream 未返回图片" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Gemini models: use generateContent API
      const apiUrl = `${ZHANHU_BASE_URL}/models/${selectedModel}:generateContent/`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ZHANHU_API_KEY}` },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageSize: "2K" },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("ZhanHu API error:", response.status, errText);
        return new Response(
          JSON.stringify({ error: `AI 分镜图生成失败 (${response.status})` }),
          { status: response.status >= 400 && response.status < 500 ? response.status : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const responseParts = data.candidates?.[0]?.content?.parts;
      if (responseParts) {
        for (const part of responseParts) {
          if (part.inlineData) {
            mimeType = part.inlineData.mimeType || "image/png";
            imageBase64 = part.inlineData.data;
            break;
          }
        }
      }
    }

    if (!imageBase64) {
      console.error("No image in response");
      return new Response(
        JSON.stringify({ error: "AI 未返回分镜图" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload to Supabase Storage
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ensure bucket exists
    await supabaseAdmin.storage.createBucket("generated-images", { public: true, fileSizeLimit: 52428800 }).catch(() => {});

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const folder = isPanorama ? "panoramas" : "storyboards";
    const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;

    const binaryStr = atob(imageBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    console.log(`Uploading storyboard image: ${fileName}, size: ${bytes.length} bytes`);

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

    console.log("Storyboard image uploaded successfully:", urlData.publicUrl);

    return new Response(
      JSON.stringify({ imageUrl: urlData.publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-storyboard error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
