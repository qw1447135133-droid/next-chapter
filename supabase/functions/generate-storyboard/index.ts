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
    .replace(/劈中/g, "朝其劈去")
    // More action → anticipation rewrites
    .replace(/一拳砸在/g, "举拳准备砸向")
    .replace(/一拳打在/g, "举拳准备打向")
    .replace(/一拳击在/g, "举拳准备击向")
    .replace(/踹开/g, "准备踹向")
    .replace(/踢中/g, "踢向")
    .replace(/摔在/g, "即将摔向")
    .replace(/重重摔/g, "即将摔")
    .replace(/按在.*?地面/g, "按向地面")
    .replace(/反复捶打/g, "举拳准备捶打")
    .replace(/拖向/g, "准备拖向")
    .replace(/架住/g, "准备架住")
    .replace(/将其/g, "准备将其")
    .replace(/渗出鲜血/g, "")
    .replace(/嘴角渗出/g, "")
    .replace(/痛苦地倒地/g, "即将倒地")
    .replace(/倒地咳嗽/g, "即将倒地");

  // 4. Clean up: remove trailing dangling character references and punctuation
  cleaned = cleaned.replace(/[，,、]+\s*(\[[^\]]*\])\s*$/, "").replace(/[，,、。]+$/, "").replace(/\s+/g, " ").trim();

  return cleaned || desc; // fallback to original if cleaning empties it
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse request body first (fast, no streaming needed for errors)
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "无效的请求体" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use streaming response with heartbeats to prevent gateway timeout
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Heartbeat: send a newline every 10s to keep connection alive
  const heartbeat = setInterval(() => {
    writer.write(encoder.encode("\n")).catch(() => {});
  }, 10_000);

  // Run the actual generation in the background
  (async () => {
    try {
      const result = await generateStoryboard(body);
      clearInterval(heartbeat);
      await writer.write(encoder.encode(JSON.stringify(result) + "\n"));
    } catch (e: any) {
      clearInterval(heartbeat);
      console.error("generate-storyboard error:", e);
      await writer.write(encoder.encode(JSON.stringify({ error: e.message || "未知错误" }) + "\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });

async function generateStoryboard(body: any): Promise<{ imageUrl: string }> {
    const { description, characters, cameraDirection, sceneName, dialogue, style, characterDescriptions, sceneDescription, mode, characterImages, sceneImageUrl, prevStoryboardUrl, scriptExcerpt, neighborContext, aspectRatio, model } = body;

    const isPanorama = mode === "panorama";

    if (!description && !isPanorama) {
      throw new Error("缺少分镜描述");
    }

    const ZHANHU_API_KEY = Deno.env.get("Gemini");
    if (!ZHANHU_API_KEY) {
      throw new Error("Gemini API Key 未配置");
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

      const firstFrameDesc = rewriteToFirstFrame(description);
      console.log("Original description:", description);
      console.log("First-frame rewrite:", firstFrameDesc);

      prompt = `You are a professional cinematic storyboard artist. Create a single storyboard frame for the shot described below.

=== TWO CO-EQUAL TOP PRIORITIES (BOTH MUST BE SATISFIED SIMULTANEOUSLY) ===

⚠️ **PRIORITY A — CHARACTER CONSISTENCY (ABSOLUTE GROUND TRUTH)** ⚠️
Every character MUST be an EXACT visual clone of their reference image. This is NON-NEGOTIABLE:
- **FACE**: Reproduce the EXACT same facial structure, eye shape, eye color, nose shape, lip shape, jawline, skin tone, scars, and facial hair from the reference image. The face must be RECOGNIZABLY THE SAME PERSON across all shots.
- **HAIR**: EXACT same hairstyle, hair color, hair length, and hair texture. No changes allowed.
- **CLOTHING**: EXACT same outfit — same colors, same layers, same accessories (belts, holsters, pendants, bandages). No substitutions.
- **BODY**: Same build, height proportion, and posture tendencies.
- **RULE**: If a reference image is provided, it is the GROUND TRUTH. Text description is secondary. When in doubt, copy the reference image pixel-for-pixel.
- **ANTI-HALLUCINATION**: Do NOT invent new clothing, change hair color, add/remove accessories, or alter facial features. Every detail must trace back to the reference.

⚠️ **PRIORITY B — FIRST-FRAME PRINCIPLE (VIDEO T=0 STARTING FRAME)** ⚠️
This image will be used as the STARTING FRAME of a video clip at time T=0 before playback starts.
- Depict the moment JUST BEFORE the first action begins. Characters are in ANTICIPATION POSES — tensed, ready, but NOT yet moving.
- ABSOLUTELY NO: motion blur, mid-swing limbs, mid-air objects, impact deformation, splash effects, falling bodies.
- Characters should look like they are ABOUT TO act, not already acting.
- Example: "A punches B" → show A with fist raised, ABOUT TO swing — NOT the punch landing.
- Example: "A falls to the ground" → show A losing balance, ABOUT TO fall — NOT already on the ground.

=== CURRENT SHOT ===
Scene: "${sceneName || "Unknown"}"
Shot description: ${firstFrameDesc}
Characters present: ${charList || "None specified"}
${charDescList ? `\nCharacter appearance (ABSOLUTE REQUIREMENT — every detail must match exactly):\n${charDescList}` : ""}
Camera: ${cameraDirection || "Medium shot"}
${dialogue ? `Dialogue in this shot: ${dialogue}` : ""}
Scene environment: ${sceneDescription || sceneName || "Not specified"}

=== ART STYLE (MANDATORY — APPLIES TO ENTIRE IMAGE) ===
${styleDesc}
IMPORTANT: Every element in the image (characters, environment, lighting, textures) MUST be rendered in this EXACT art style. Do NOT default to photorealism unless "live-action" is specified. Do NOT mix styles.
${narrativeContext}
=== ADDITIONAL REQUIREMENTS ===
1. NARRATIVE EXPANSION: Based on the shot description and script context, enrich the visual details — add appropriate environmental elements, lighting mood, character micro-expressions and body language that match the narrative tone. Do NOT invent content that contradicts the script.
2. SPATIAL CONSISTENCY & VISUAL CONTINUITY: If previous/next shot context or a previous storyboard image is provided, maintain consistent:
   - **Character appearance MUST match reference images exactly** (reiterated — this is the most common failure)
   - Character positions and facing directions
   - Background elements and environment layout
   - Lighting direction and color temperature
   **BUT VARY THE COMPOSITION**: Each consecutive shot MUST use a DISTINCTLY DIFFERENT composition:
   - CHANGE the camera angle (e.g., eye-level → high angle → low angle → over-the-shoulder → Dutch angle)
   - CHANGE the shot size (e.g., medium shot → close-up → wide shot → extreme close-up on hands/eyes)
   - CHANGE the framing (e.g., center-framed → rule-of-thirds left → negative space right → foreground framing)
   - NEVER produce two adjacent shots with the same angle + distance + framing combination
3. If a scene environment reference image is provided below, maintain the same environment style, layout, and atmosphere.
4. ${aspectRatio || "16:9"} cinematic composition, professional storyboard quality, cinematic lighting. The image MUST be in ${aspectRatio || "16:9"} aspect ratio.${(aspectRatio === "9:16" || aspectRatio === "2:3") ? `
5. **PORTRAIT / VERTICAL FRAME COMPOSITION (9:16 / 2:3 — CHARACTER-RELATIONSHIP-FIRST PHILOSOPHY):**
   **CORE PRINCIPLE: The vertical frame is a CHARACTER INTIMACY tool, NOT a landscape tool.**
   - MOST PREFERRED: Two-shot close-ups capturing both characters' faces/expressions
   - Use SHALLOW depth of field aggressively: background should be soft bokeh
   - Characters should occupy at least 60-80% of the frame area
   - Eyes are the anchor: catch-lights, tear reflections, narrowed lids
   - Stack character eyelines at different heights to create power dynamics
   - Prefer dramatic side-lighting that sculpts facial features` : ""}

${(aspectRatio === "9:16" || aspectRatio === "2:3") ? "6" : "5"}. Ultra high resolution.
${(aspectRatio === "9:16" || aspectRatio === "2:3") ? "7" : "6"}. Depict EXACTLY this single shot — show the specific anticipation moment, character positions, and emotion. Characters MUST look identical to their reference images.`;
    }

    // Build multimodal parts: text prompt + reference images
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    parts.push({ text: prompt });

    console.log("[DEBUG] characterImages received:", Array.isArray(characterImages) ? characterImages.length : "not array",
      Array.isArray(characterImages) ? characterImages.map((c: any) => ({ name: c.name, hasUrl: !!c.imageUrl, urlPrefix: c.imageUrl?.slice(0, 50) })) : "N/A");
    console.log("[DEBUG] sceneImageUrl received:", sceneImageUrl ? sceneImageUrl.slice(0, 80) : "none");
    console.log("[DEBUG] prevStoryboardUrl received:", prevStoryboardUrl ? prevStoryboardUrl.slice(0, 80) : "none");

    // Add scene reference image
    if (sceneImageUrl && typeof sceneImageUrl === "string") {
      const inlineData = await getInlineData(sceneImageUrl);
      console.log("[DEBUG] Scene image inlineData:", inlineData ? `OK (${inlineData.mimeType}, ${inlineData.data.length} chars)` : "FAILED to fetch");
      if (inlineData) {
        parts.push({ inlineData });
        parts.push({ text: `[SCENE ENVIRONMENT REFERENCE IMAGE]\nAbove is this scene's environment — use it for environment style, color palette, architecture, props, and lighting.` });
      }
    }

    // Add character reference images
    let charRefCount = 0;
    if (Array.isArray(characterImages)) {
      for (const charImg of characterImages) {
        if (charImg.imageUrl && typeof charImg.imageUrl === "string") {
          const inlineData = await getInlineData(charImg.imageUrl);
          console.log(`[DEBUG] Character "${charImg.name}" inlineData:`, inlineData ? `OK (${inlineData.mimeType}, ${inlineData.data.length} chars)` : "FAILED to fetch");
          if (inlineData) {
            charRefCount++;
            parts.push({ inlineData });
            const charDescEntry = (characterDescriptions || []).find(
              (c: { name: string; description: string }) => c.name === charImg.name
            );
            const descReinforcement = charDescEntry ? `\nCharacter description: ${charDescEntry.description}` : "";
            parts.push({ text: `[CHARACTER REFERENCE — ${charImg.name}] (ABSOLUTE GROUND TRUTH — MUST CLONE EXACTLY)\nThis is the DEFINITIVE visual reference for ${charImg.name}. You MUST reproduce:\n• IDENTICAL face structure, eye shape/color, skin tone, scars, facial hair\n• IDENTICAL hairstyle, hair color, hair length\n• IDENTICAL clothing colors, layers, accessories (pendants, belts, holsters, bandages)\nAny deviation from this reference image is a CRITICAL ERROR.\n${descReinforcement}` });
          }
        }
      }
    }

    if (charRefCount > 0) {
      parts.push({ text: `[ART STYLE ENFORCEMENT]\nALL characters and environments MUST be rendered in: ${styleDesc}\nDo NOT mix art styles.` });
    }

    // Add previous storyboard for continuity
    if (prevStoryboardUrl && typeof prevStoryboardUrl === "string") {
      const inlineData = await getInlineData(prevStoryboardUrl);
      if (inlineData) {
        // Determine which characters were in the previous vs current shot
        const prevChars: string[] = neighborContext?.prevCharacters || [];
        // Fallback: if prevCharacters not provided, try matching from description
        const effectivePrevChars = prevChars.length > 0 ? prevChars
          : (neighborContext?.prevDescription ? (characters || []).filter((c: string) => neighborContext.prevDescription.includes(c)) : []);
        const curChars = characters || [];
        const sharedChars = curChars.filter((c: string) => effectivePrevChars.includes(c));
        const newChars = curChars.filter((c: string) => !effectivePrevChars.includes(c));

        let continuityInstruction = `[PREVIOUS SHOT — ENVIRONMENT & SPATIAL CONTINUITY ONLY]
Above is the PREVIOUS shot in the same scene. Use it ONLY for:
• Background / environment layout, props, architecture — keep them CONSISTENT
• Lighting direction, color temperature, time of day — keep them CONSISTENT
• Overall atmosphere and color palette — keep them CONSISTENT

⚠️ CRITICAL — CHARACTER IDENTITY RULES FOR THIS TRANSITION:`;

        if (sharedChars.length > 0) {
          continuityInstruction += `\n• Characters appearing in BOTH shots (${sharedChars.join("、")}): maintain their EXACT position continuity and appearance from the previous shot AND their character reference images.`;
        }
        if (newChars.length > 0) {
          continuityInstruction += `\n• Characters NEW in this shot (${newChars.join("、")}): DO NOT copy any character appearance from the previous shot image. Their appearance MUST come EXCLUSIVELY from their own CHARACTER REFERENCE IMAGES above. They are DIFFERENT people.`;
        }
        if (effectivePrevChars.length > 0 && newChars.length > 0) {
          continuityInstruction += `\n• The previous shot featured ${effectivePrevChars.join("、")} — the current shot features ${curChars.join("、")}. These may be ENTIRELY DIFFERENT characters. Do NOT transfer facial features, hair, or clothing between different characters.`;
        }

        parts.push({ inlineData });
        parts.push({ text: continuityInstruction });
      }
    }

    const selectedModel = model || "gemini-3-pro-image-preview";
    const isSeedream = selectedModel.startsWith("doubao-seedream");

    let imageBase64 = "";
    let mimeType = "image/png";

    if (isSeedream) {
      const jimengKey = Deno.env.get("JIMENG_API_KEY");
      if (!jimengKey) throw new Error("JIMENG_API_KEY 未配置");

      const refImages: string[] = [];
      let imageDescriptions = "";

      if (Array.isArray(characterImages)) {
        for (const charImg of characterImages) {
          if (charImg.imageUrl && typeof charImg.imageUrl === "string" && !charImg.imageUrl.startsWith("data:")) {
            refImages.push(charImg.imageUrl);
            imageDescriptions += `\n图${refImages.length} 是角色「${charImg.name}」的外观设计参考图（必须严格匹配）。`;
          }
        }
      }
      if (sceneImageUrl && typeof sceneImageUrl === "string" && !sceneImageUrl.startsWith("data:")) {
        refImages.push(sceneImageUrl);
        imageDescriptions += `\n图${refImages.length} 是场景环境参考图。`;
      }
      if (prevStoryboardUrl && typeof prevStoryboardUrl === "string" && !prevStoryboardUrl.startsWith("data:")) {
        refImages.push(prevStoryboardUrl);
        const sPrevChars: string[] = neighborContext?.prevCharacters || [];
        const sEffectivePrevChars = sPrevChars.length > 0 ? sPrevChars
          : (neighborContext?.prevDescription ? (characters || []).filter((c: string) => neighborContext.prevDescription.includes(c)) : []);
        const sCurChars = characters || [];
        const sNewChars = sCurChars.filter((c: string) => !sEffectivePrevChars.includes(c));
        let seedreamContinuity = `\n图${refImages.length} 是上一个镜头的分镜图，仅用于保持背景环境、灯光、氛围的连续性。`;
        if (sNewChars.length > 0) {
          seedreamContinuity += `当前镜头的角色（${sNewChars.join("、")}）与上一镜头不同，请勿从上一镜头图片中复制任何角色外观，角色外观必须严格参照各自的设定参考图。`;
        }
        imageDescriptions += seedreamContinuity;
      }

      const fullPrompt = refImages.length > 0 ? `${prompt}\n\n参考图说明：${imageDescriptions}` : prompt;

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

      console.log("Calling Seedream API, ref images:", refImages.length);

      const seedreamResp = await fetch(`${ZHANHU_BASE_URL.replace("/v1beta", "")}/v1/images/generations/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jimengKey}` },
        body: JSON.stringify(seedreamPayload),
      });

      if (!seedreamResp.ok) {
        const errText = await seedreamResp.text();
        console.error("Seedream API error:", seedreamResp.status, errText);
        throw new Error(`Seedream 生成失败 (${seedreamResp.status})`);
      }

      const seedreamData = await seedreamResp.json();
      const imgItem = seedreamData.data?.[0];
      if (imgItem?.b64_json) {
        imageBase64 = imgItem.b64_json;
        mimeType = "image/png";
      } else if (imgItem?.url) {
        console.log("Downloading Seedream image from URL:", imgItem.url.slice(0, 100));
        const imgResp = await fetch(imgItem.url);
        if (!imgResp.ok) throw new Error("Seedream 图片下载失败");
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
        throw new Error("Seedream 未返回图片");
      }
    } else {
      // Gemini models
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
        throw new Error(`AI 分镜图生成失败 (${response.status})`);
      }

      const data = await response.json();
      const responseParts = data.candidates?.[0]?.content?.parts;

      // Debug: log what the API actually returned
      console.log("[DEBUG] Gemini response keys:", JSON.stringify(Object.keys(data)));
      console.log("[DEBUG] Gemini candidates count:", data.candidates?.length);
      if (responseParts) {
        console.log("[DEBUG] Response parts count:", responseParts.length);
        for (let i = 0; i < responseParts.length; i++) {
          const keys = Object.keys(responseParts[i]);
          console.log(`[DEBUG] Part ${i} keys:`, keys,
            keys.includes("text") ? `text: ${responseParts[i].text?.slice(0, 200)}` : "",
            keys.includes("fileData") ? `fileData mime: ${responseParts[i].fileData?.mimeType}` : "");
        }
      } else {
        console.log("[DEBUG] No response parts found. Full response (truncated):", JSON.stringify(data).slice(0, 500));
      }

      // Extract image: try inlineData first
      if (responseParts) {
        for (const part of responseParts) {
          if (part.inlineData) {
            mimeType = part.inlineData.mimeType || "image/png";
            imageBase64 = part.inlineData.data;
            break;
          }
        }
      }

      // Fallback 1: fileData (Gemini file URI)
      if (!imageBase64 && responseParts) {
        for (const part of responseParts) {
          if (part.fileData?.fileUri) {
            console.log("[DEBUG] Trying fileData fallback:", part.fileData.fileUri.slice(0, 100));
            const fetched = await fetchImageAsBase64(part.fileData.fileUri);
            if (fetched) {
              mimeType = fetched.mimeType;
              imageBase64 = fetched.data;
              break;
            }
          }
        }
      }

      // Fallback 2: Markdown image link or plain URL in text
      if (!imageBase64 && responseParts) {
        for (const part of responseParts) {
          if (part.text) {
            const mdMatch = part.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            const urlMatch = mdMatch?.[1] || part.text.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif))/i)?.[1];
            if (urlMatch) {
              console.log("[DEBUG] Trying URL fallback from text:", urlMatch.slice(0, 100));
              const fetched = await fetchImageAsBase64(urlMatch);
              if (fetched) {
                mimeType = fetched.mimeType;
                imageBase64 = fetched.data;
                break;
              }
            }
          }
        }
      }
    }

    if (!imageBase64) {
      throw new Error("AI 未返回分镜图");
    }

    // Upload to Supabase Storage
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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
      throw new Error(`图片上传失败: ${uploadError.message}`);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    console.log("Storyboard image uploaded successfully:", urlData.publicUrl);
    return { imageUrl: urlData.publicUrl };
}

});
