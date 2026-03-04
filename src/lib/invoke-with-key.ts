/**
 * 本地函数调用 - 直接调用 AI API，不经过 Supabase Edge Functions
 */
import { getApiConfig } from "@/pages/Settings";
import {
  callGemini, extractText, extractImageBase64, getInlineData, fetchImageAsBase64,
  uploadImageToStorage, callSeedreamImage, rewriteToFirstFrame, proxiedFetch,
  CHAR_STYLE_MAP, SCENE_STYLE_MAP, STORYBOARD_STYLE_MAP,
  getSeedanceConfig, getViduConfig, VIDU_BASE_URL,
} from "@/lib/gemini-client";

// ===== PROMPTS =====

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

const DECOMPOSE_PROMPT = `你是专业电影分镜师。将剧本拆解为AI视频生成用的15秒分段分镜脚本。

规则：
1. 每集8~10个片段，每片段15秒，含3~5个分镜
2. 台词容量：正常语速≤30字/片段，快速≤45字/片段，超出则拆到下一片段
3. 基于原文拆分，人名地名用[]包裹，禁止加戏、禁止镜头术语、对白完整保留
4. 在场但未提及的角色补充简短站位描述
5. 敏感描述替换（对白原样保留）

输出JSON，仅含"scenes"数组。每个对象：
- sceneNumber: 全局序号(整数递增)
- segmentLabel: 片段编号如"1-1","1-2"(按15秒重新划分，同片段多分镜共享)
- sceneName: 场景名
- description: 画面描述
- characters: 出场角色数组
- dialogue: "角色：台词"格式，多条换行，无则空串
- cameraDirection: 固定"无字幕、无水印、无背景音"
- duration: 固定15

直接输出JSON，无思考过程。`;

const ENHANCE_PROMPT = `你是一位专业的影视视频生成提示词工程师。你的任务是将简短的分镜描述扩展为丰富、具体、富有画面感的视频生成提示词。

## 核心原则

1. **动态感**：明确描述运动轨迹、速度变化、力量冲击。
2. **空间感**：描述前景、中景、背景的层次关系，营造纵深。
3. **画面细节**：补充材质质感、光照效果。
4. **镜头语言**：根据内容暗示合适的镜头运动。
5. **情绪氛围**：通过色调、节奏强化情绪。

## 约束

- 输出只包含增强后的提示词文本，不要任何解释
- 保持原文核心叙事不变
- 控制在600字以内
- 使用中文输出
- 不要添加原文没有的角色或剧情事件

## 输出格式

请严格按以下 JSON 格式输出：
{"enhanced":"增强后的提示词","duration":秒数(整数,4到8),"durationReason":"简短说明时长判定理由"}

## duration 判定规则（整数，范围4~8秒）

### 维度1：动作复杂度（权重最高）
- 无动作/静态画面 → 基准4秒
- 单一简单动作 → 基准4~5秒
- 中等动作 → 基准5~6秒
- 复杂动作 → 基准6~7秒
- 极复杂多阶段动作 → 基准7~8秒

### 维度2：对白长度
- 无对白 → +0秒
- 短对白（≤10字） → +0秒
- 中对白（11~25字） → +1秒
- 长对白（>25字） → +1~2秒

### 维度3：情绪节奏
- 快节奏 → -1秒
- 正常节奏 → +0秒
- 慢节奏 → +1秒

最终时长 = clamp(基准 + 对白加成 + 情绪调整, 4, 8)`;

const ETHNICITY_RULE = `### Ethnicity & Cultural Consistency (HIGHEST PRIORITY)
You MUST first determine the cultural/geographical setting of the script (e.g., Western/European, East Asian, Middle Eastern, African, Latin American, etc.).
- ALL characters MUST default to the ethnicity, skin tone, and facial features typical of that setting UNLESS the script explicitly states otherwise.
- For a Western/European story: characters should have Caucasian features by default.
- For an East Asian story: characters should have East Asian features by default.
- Apply the same logic for any other cultural setting.
This rule overrides any other inference. Ethnicity must be explicitly stated in every description.`;

// ===== MAIN INTERFACE =====

export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  try {
    const data = await routeFunction(functionName, body);
    return { data: data as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function buildFetchBodyWithKeys(body: Record<string, unknown>) {
  // No longer needed for Edge Functions, but kept for backward compatibility
  return { ...body };
}

// ===== ROUTER =====

async function routeFunction(functionName: string, body: any): Promise<any> {
  switch (functionName) {
    case "extract-characters-scenes": return localExtract(body);
    case "script-decompose": return localDecompose(body);
    case "generate-character": return localGenerateCharacter(body);
    case "generate-scene": return localGenerateScene(body);
    case "generate-storyboard": return localGenerateStoryboard(body);
    case "generate-video": return localGenerateVideo(body);
    case "enhance-video-prompt": return localEnhancePrompt(body);
    case "generate-character-description": return localCharDesc(body);
    case "generate-scene-description": return localSceneDesc(body);
    default: throw new Error(`未知函数: ${functionName}`);
  }
}

// ===== IMPLEMENTATIONS =====

async function localExtract(body: any) {
  const { script, model: requestedModel } = body;
  if (!script) throw new Error("缺少剧本内容");

  const model = requestedModel || "gemini-3.1-pro-preview";
  const promptText = `${EXTRACTION_PROMPT}\n\n---\n\n以下是用户的剧本：\n\n${script}`;

  const data = await callGemini(model,
    [{ role: "user", parts: [{ text: promptText }] }],
    { temperature: 0.2, maxOutputTokens: 16384, responseMimeType: "application/json" },
  );

  const textContent = extractText(data);
  if (!textContent) throw new Error("AI 返回格式异常");

  let cleanedText = textContent;
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    const match = cleanedText.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("无法解析 AI 返回的 JSON");
  }

  return { characters: parsed.characters || [], sceneSettings: parsed.sceneSettings || [] };
}

async function localDecompose(body: any) {
  const { script, systemPrompt, model: requestedModel } = body;
  if (!script) throw new Error("缺少剧本内容");

  const model = requestedModel || "gemini-3.1-pro-preview";
  const prompt = (systemPrompt && typeof systemPrompt === "string") ? systemPrompt : DECOMPOSE_PROMPT;
  const userText = `${prompt}\n\n---\n\n以下是用户的剧本：\n\n${script}`;

  const data = await callGemini(model,
    [{ role: "user", parts: [{ text: userText }] }],
    { temperature: 0.3, maxOutputTokens: 40960 },
  );

  const resultText = extractText(data);
  if (!resultText) throw new Error("AI 未返回内容");

  // Parse the JSON response
  let cleanedText = resultText.trim();
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    const match = cleanedText.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error("无法解析返回的 JSON");
  }

  const scenes = Array.isArray(parsed) ? parsed : (parsed?.scenes || []);
  return { scenes };
}

async function localGenerateCharacter(body: any) {
  const { name, description, style, model, referenceImageUrl } = body;
  if (!name) throw new Error("缺少角色名称");

  const characterDesc = description || name;
  const styleDesc = CHAR_STYLE_MAP[style] || CHAR_STYLE_MAP["live-action"];

  const refImageNote = referenceImageUrl
    ? `\n\nCRITICAL: The attached reference image shows the SAME character in a different costume. You MUST preserve the EXACT same face, facial features, bone structure, eye shape, nose, lips, skin tone, hair color, hairstyle, body proportions, and build. ONLY change the clothing/outfit as described. The character's identity must be unmistakably the same person.`
    : "";

  const prompt = `Create a professional character design reference sheet for an animated character: "${name}" - ${characterDesc}.

Art style: ${styleDesc}.

The image should be a clean character turnaround sheet with 4 views arranged in a 2x2 grid on a plain white background:
- Top-left: FRONT VIEW (full body, facing camera)
- Top-right: SIDE VIEW (full body, profile view from the right)
- Bottom-left: BACK VIEW (full body, facing away)
- Bottom-right: FACE CLOSE-UP (detailed head/face portrait)

Each view should be labeled clearly. The character design must be consistent across all 4 views. The entire image MUST be in ${styleDesc} style.${refImageNote}`;

  const selectedModel = model || "gemini-3-pro-image-preview";
  const isSeedream = selectedModel.startsWith("doubao-seedream");

  let imageBase64: string;
  let mimeType: string;

  if (isSeedream) {
    const result = await callSeedreamImage(prompt, { model: selectedModel, size: "2560x1440" });
    imageBase64 = result.base64;
    mimeType = result.mimeType;
  } else {
    // Build multimodal parts
    const parts: any[] = [{ text: prompt }];

    // Add reference image if provided
    if (referenceImageUrl) {
      const inlineData = await getInlineData(referenceImageUrl);
      if (inlineData && inlineData.data.length < 2 * 1024 * 1024) {
        parts.unshift({ inlineData: { mimeType: inlineData.mimeType, data: inlineData.data } });
      }
    }

    const data = await callGemini(selectedModel,
      [{ role: "user", parts }],
      { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "16:9", imageSize: "2K" } },
    );

    const img = await extractImageBase64(data);
    if (!img) throw new Error("AI 未返回角色图");
    imageBase64 = img.base64;
    mimeType = img.mimeType;
  }

  const imageUrl = await uploadImageToStorage(imageBase64, mimeType, "characters");
  return { imageUrl };
}

async function localGenerateScene(body: any) {
  const { name, description, style, model } = body;
  if (!name) throw new Error("缺少场景名称");

  const sceneDesc = description || name;
  const styleDesc = SCENE_STYLE_MAP[style] || SCENE_STYLE_MAP["live-action"];

  const prompt = `Create a detailed, high-quality background/environment concept art for a scene called "${name}".

Scene description: ${sceneDesc}

Art style: ${styleDesc}.

This is a wide establishing shot showing the full environment. Focus on atmosphere, lighting, and mood. No characters or people in the scene - only the environment/location itself. Professional concept art quality.`;

  const selectedModel = model || "gemini-3-pro-image-preview";
  const isSeedream = selectedModel.startsWith("doubao-seedream");

  let imageBase64: string;
  let mimeType: string;

  if (isSeedream) {
    const result = await callSeedreamImage(prompt, { model: selectedModel, size: "2560x1440" });
    imageBase64 = result.base64;
    mimeType = result.mimeType;
  } else {
    const data = await callGemini(selectedModel,
      [{ role: "user", parts: [{ text: prompt }] }],
      { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "16:9", imageSize: "2K" } },
    );

    const img = await extractImageBase64(data);
    if (!img) throw new Error("AI 未返回场景图");
    imageBase64 = img.base64;
    mimeType = img.mimeType;
  }

  const imageUrl = await uploadImageToStorage(imageBase64, mimeType, "scenes");
  return { imageUrl };
}

async function localGenerateStoryboard(body: any) {
  const {
    description, characters, cameraDirection, sceneName, dialogue, style,
    characterDescriptions, sceneDescription, mode, characterImages, sceneImageUrl,
    prevStoryboardUrl, scriptExcerpt, neighborContext, aspectRatio, model,
  } = body;

  const isPanorama = mode === "panorama";
  if (!description && !isPanorama) throw new Error("缺少分镜描述");

  const styleDesc = STORYBOARD_STYLE_MAP[style] || STORYBOARD_STYLE_MAP["live-action"];
  let prompt: string;

  if (isPanorama) {
    const charList = (characters || []).join("、");
    const charDescList = (characterDescriptions || [])
      .map((c: any) => `${c.name}: ${c.description}`).join("\n");

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
- Each character should be clearly identifiable
- Show the full environment/background
- Characters should be full-body, showing their spatial relationships
- Professional concept art quality, clear composition`;
  } else {
    const charList = (characters || []).join("、");
    const charDescList = (characterDescriptions || [])
      .map((c: any) => `${c.name}: ${c.description}`).join("\n");

    let narrativeContext = "";
    if (scriptExcerpt) {
      narrativeContext += `\n[SCRIPT CONTEXT]\n${scriptExcerpt}\n`;
    }
    if (neighborContext) {
      const nc = neighborContext;
      narrativeContext += `\n[SCENE CONTINUITY — Shot ${nc.currentShotIndex} of ${nc.totalShotsInScene}]`;
      if (nc.prevDescription) narrativeContext += `\nPrevious shot: ${nc.prevDescription}`;
      if (nc.nextDescription) narrativeContext += `\nNext shot: ${nc.nextDescription}`;
      narrativeContext += "\n";
    }

    const firstFrameDesc = rewriteToFirstFrame(description);

    prompt = `You are a professional cinematic storyboard artist. Create a single storyboard frame for the shot described below.

=== TWO CO-EQUAL TOP PRIORITIES ===

⚠️ **PRIORITY A — CHARACTER CONSISTENCY** ⚠️
Every character MUST be an EXACT visual clone of their reference image. FACE, HAIR, CLOTHING, BODY must match exactly.

⚠️ **PRIORITY B — FIRST-FRAME PRINCIPLE** ⚠️
This image is the STARTING FRAME (T=0). Depict the moment JUST BEFORE action begins. NO motion blur, mid-swing limbs, impact effects.

=== CURRENT SHOT ===
Scene: "${sceneName || "Unknown"}"
Shot description: ${firstFrameDesc}
Characters present: ${charList || "None specified"}
${charDescList ? `\nCharacter appearance:\n${charDescList}` : ""}
Camera: ${cameraDirection || "Medium shot"}
${dialogue ? `Dialogue: ${dialogue}` : ""}
Scene environment: ${sceneDescription || sceneName || "Not specified"}

=== ART STYLE ===
${styleDesc}
Every element MUST be rendered in this EXACT art style.
${narrativeContext}
=== ADDITIONAL REQUIREMENTS ===
1. Enrich visual details based on context.
2. Maintain spatial consistency with previous/next shots. VARY composition (change angle, shot size, framing).
3. ${aspectRatio || "16:9"} cinematic composition.
4. Ultra high resolution.`;
  }

  // Build multimodal parts
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  parts.push({ text: prompt });

  const curProtagonistName = (characters || [])[0] || "";

  // Add scene reference image
  if (sceneImageUrl && typeof sceneImageUrl === "string") {
    const inlineData = await getInlineData(sceneImageUrl);
    if (inlineData) {
      parts.push({ inlineData });
      parts.push({ text: `[SCENE ENVIRONMENT REFERENCE IMAGE]\nUse for environment style, color palette, architecture, props, and lighting.` });
    }
  }

  // Add character reference images — protagonist last
  let charRefCount = 0;
  if (Array.isArray(characterImages)) {
    const sorted = [...characterImages].sort((a: any, b: any) => {
      return (a.name === curProtagonistName ? 1 : 0) - (b.name === curProtagonistName ? 1 : 0);
    });
    for (const charImg of sorted) {
      if (charImg.imageUrl && typeof charImg.imageUrl === "string") {
        const inlineData = await getInlineData(charImg.imageUrl);
        if (inlineData) {
          charRefCount++;
          const isProtagonist = charImg.name === curProtagonistName;
          parts.push({ inlineData });
          if (isProtagonist) {
            parts.push({ text: `[★★★ VISUAL PROTAGONIST — ${charImg.name} ★★★]\nThis character's face, hair, clothing MUST be an EXACT clone of this reference.` });
          } else {
            parts.push({ text: `[CHARACTER REFERENCE — ${charImg.name}]\nReproduce their appearance faithfully.` });
          }
        }
      }
    }
  }

  if (charRefCount > 0) {
    parts.push({ text: `[ART STYLE ENFORCEMENT]\nALL characters and environments MUST be rendered in: ${styleDesc}` });
  }

  // Previous storyboard for continuity
  if (prevStoryboardUrl && typeof prevStoryboardUrl === "string") {
    const prevChars: string[] = neighborContext?.prevCharacters || [];
    const curChars = characters || [];
    const prevProtagonist = prevChars[0] || "";
    const sameProtagonist = curProtagonistName && prevProtagonist && curProtagonistName === prevProtagonist;

    if (sameProtagonist) {
      const inlineData = await getInlineData(prevStoryboardUrl);
      if (inlineData) {
        parts.push({ inlineData });
        parts.push({ text: `[PREVIOUS SHOT — ENVIRONMENT & SPATIAL CONTINUITY]\nMaintain environment consistency. Character "${curProtagonistName}" appears in both shots.` });
      }
    }
  }

  // Double anchor: re-send protagonist reference
  if (curProtagonistName && Array.isArray(characterImages)) {
    const protagonistImg = characterImages.find((c: any) => c.name === curProtagonistName);
    if (protagonistImg?.imageUrl) {
      const anchorData = await getInlineData(protagonistImg.imageUrl);
      if (anchorData) {
        parts.push({ inlineData: anchorData });
        parts.push({ text: `[★ FINAL ANCHOR — ${curProtagonistName} ★]\nFINAL REMINDER: protagonist MUST have THIS EXACT face, hair, and clothing.` });
      }
    }
  }

  const selectedModel = model || "gemini-3-pro-image-preview";
  const isSeedream = selectedModel.startsWith("doubao-seedream");

  let imageBase64: string;
  let mimeType: string;

  if (isSeedream) {
    // Build Seedream prompt with image URLs
    const refImages: string[] = [];
    let imageDescriptions = "";
    if (Array.isArray(characterImages)) {
      for (const charImg of characterImages) {
        if (charImg.imageUrl && typeof charImg.imageUrl === "string" && !charImg.imageUrl.startsWith("data:")) {
          refImages.push(charImg.imageUrl);
          imageDescriptions += `\n图${refImages.length} 是角色「${charImg.name}」的外观设计参考图。`;
        }
      }
    }
    if (sceneImageUrl && typeof sceneImageUrl === "string" && !sceneImageUrl.startsWith("data:")) {
      refImages.push(sceneImageUrl);
      imageDescriptions += `\n图${refImages.length} 是场景环境参考图。`;
    }
    if (prevStoryboardUrl && typeof prevStoryboardUrl === "string" && !prevStoryboardUrl.startsWith("data:")) {
      refImages.push(prevStoryboardUrl);
      imageDescriptions += `\n图${refImages.length} 是上一个镜头的分镜图，仅用于保持环境连续性。`;
    }

    const fullPrompt = refImages.length > 0 ? `${prompt}\n\n参考图说明：${imageDescriptions}` : prompt;
    const result = await callSeedreamImage(fullPrompt, {
      model: selectedModel,
      size: "2K",
      image: refImages.length > 0 ? refImages : undefined,
    });
    imageBase64 = result.base64;
    mimeType = result.mimeType;
  } else {
    const data = await callGemini(selectedModel,
      [{ role: "user", parts }],
      { responseModalities: ["IMAGE", "TEXT"], imageSize: "2K" },
    );

    const img = await extractImageBase64(data);
    if (!img) throw new Error("AI 未返回分镜图");
    imageBase64 = img.base64;
    mimeType = img.mimeType;
  }

  const folder = isPanorama ? "panoramas" : "storyboards";
  const imageUrl = await uploadImageToStorage(imageBase64, mimeType, folder);
  return { imageUrl };
}

async function localGenerateVideo(body: any) {
  const { action, model, taskId, provider } = body;
  const isVidu = model?.startsWith("viduq") || model?.startsWith("vidu2");

  if (action === "status") {
    if (!taskId) throw new Error("缺少 taskId");
    if (provider === "vidu") {
      const { apiKey } = getViduConfig();
      if (!apiKey) throw new Error("Vidu API Key 未配置");
      const res = await proxiedFetch(`${VIDU_BASE_URL}/ent/v2/tasks/${taskId}/creations`, {
        Authorization: `Token ${apiKey}`,
      });
      if (!res.ok) throw new Error(`查询 Vidu 状态失败 (${res.status})`);
      const data = await res.json();
      let status = data.state === "success" ? "succeeded" : data.state === "failed" ? "failed" : "processing";
      let videoUrl = data.state === "success" && data.creations?.length > 0 ? data.creations[0]?.url : undefined;
      return { status, video_url: videoUrl, state: data.state };
    } else {
      const { apiKey, endpoint } = getSeedanceConfig();
      if (!apiKey) throw new Error("Seedance API Key 未配置");
      const res = await proxiedFetch(`${endpoint}/videos/${taskId}`, {
        Authorization: `Bearer ${apiKey}`,
      });
      if (!res.ok) throw new Error(`查询视频状态失败 (${res.status})`);
      return await res.json();
    }
  }

  if (action === "models") {
    const { apiKey, endpoint } = getSeedanceConfig();
    if (!apiKey) throw new Error("Seedance API Key 未配置");
    const res = await proxiedFetch(`${endpoint}/models`, {
      Authorization: `Bearer ${apiKey}`,
    });
    if (!res.ok) throw new Error(`查询模型列表失败 (${res.status})`);
    return await res.json();
  }

  // Create video
  if (!body.prompt) throw new Error("缺少视频描述 (prompt)");

  if (isVidu) {
    const { apiKey } = getViduConfig();
    if (!apiKey) throw new Error("Vidu API Key 未配置，请在设置中配置");
    const endpoint = body.imageUrl ? `${VIDU_BASE_URL}/ent/v2/img2video` : `${VIDU_BASE_URL}/ent/v2/text2video`;
    const truncatedPrompt = (body.prompt || "").length > 4900 ? body.prompt.substring(0, 4900) : body.prompt;
    const payload: any = {
      model: model || "viduq3-pro",
      prompt: truncatedPrompt,
      duration: Math.max(4, Math.min(16, body.duration || 5)),
      resolution: "1080p",
      aspect_ratio: body.aspectRatio || "16:9",
      audio: true,
    };
    if (body.imageUrl) payload.images = [body.imageUrl];

    const res = await proxiedFetch(endpoint, {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    }, JSON.stringify(payload));
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Vidu 视频生成任务创建失败 (${res.status}): ${errText}`);
    }
    const data = await res.json();
    return { task_id: data.task_id, status: data.state || "created", provider: "vidu" };
  } else {
    const { apiKey, endpoint } = getSeedanceConfig();
    if (!apiKey) throw new Error("Seedance API Key 未配置，请在设置中配置");

    // Build multipart/form-data as the API requires
    const fields: Record<string, string> = {
      model: model || "doubao-seedance-1-5-pro_1080p",
      prompt: body.prompt,
      seconds: String(Math.max(4, Math.min(15, Number(body.duration) || 5))),
      size: body.aspectRatio || "16:9",
    };

    if (body.imageUrl && typeof body.imageUrl === "string") {
      if (body.imageUrl.startsWith("data:")) {
        const [, b64] = body.imageUrl.split(",");
        fields.first_frame_image = b64;
      } else {
        fields.first_frame_image = body.imageUrl;
      }
    }

    const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    let formBody = "";
    for (const [key, value] of Object.entries(fields)) {
      formBody += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
    }
    formBody += `--${boundary}--\r\n`;

    const res = await proxiedFetch(`${endpoint}/videos`, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    }, formBody);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`视频生成任务创建失败 (${res.status}): ${errText}`);
    }
    const data = await res.json();
    return { task_id: data.id, status: data.status, progress: data.progress, provider: "seedance" };
  }
}

async function localEnhancePrompt(body: any) {
  const { description, sceneName, characters, dialogue, prevDescription, nextDescription, hasRefImage } = body;
  if (!description) throw new Error("缺少分镜描述");

  const config = getApiConfig();
  if (!config.zhanhuKey) return { enhanced: description, fallback: true };

  const promptParts: string[] = [];
  if (sceneName) promptParts.push(`【场景】${sceneName}`);
  if (characters?.length) promptParts.push(`【人物】${characters.join("、")}（共${characters.length}人）`);
  if (prevDescription) promptParts.push(`【上一个分镜】${prevDescription}`);
  promptParts.push(`【当前分镜描述】${description}`);
  if (nextDescription) promptParts.push(`【下一个分镜】${nextDescription}`);
  if (dialogue) promptParts.push(`【对白】${dialogue}（${dialogue.length}字）`);
  if (hasRefImage) promptParts.push(`（注意：此分镜已有参考图，重点描述动态变化和运动过程）`);

  const userPrompt = promptParts.join("\n");

  const data = await callGemini("gemini-3-flash-preview",
    [{ role: "user", parts: [{ text: `${ENHANCE_PROMPT}\n\n${userPrompt}` }] }],
  );

  const rawText = extractText(data);
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

  const finalPrompt = enhanced.length > 2500 ? enhanced.substring(0, 2500) : enhanced;
  return { enhanced: finalPrompt, duration, durationReason };
}

async function localCharDesc(body: any) {
  const { characterName, script, costumes, model: requestedModel } = body;
  if (!characterName || !script) throw new Error("缺少角色名称或剧本内容");

  const hasCostumes = Array.isArray(costumes) && costumes.length > 0;

  const systemPrompt = hasCostumes
    ? `You are a professional film character designer. Based on the script and character name, produce:
1. A brief base character description (gender, age, build, facial features, hairstyle, skin tone — NO clothing).
2. For EACH costume variant, produce a detailed AI-ready appearance description for a character design sheet.

${ETHNICITY_RULE}

### Layout Constraints
- Character Design Sheet with multiple angles (front, side, back) and face close-up.
- NO text labels. Pure white background. Neutral expression, upright standing pose.

### Output Format
Return JSON: {"description": "base description", "costumeDescriptions": [{"label": "...", "description": "..."}]}
Return ONLY valid JSON.`
    : `You are a professional film character designer. Based on the script and character name, produce a detailed AI-ready appearance description for a character design sheet.

${ETHNICITY_RULE}

### Layout Constraints
- Character Design Sheet with multiple angles (front, side, back) and face close-up.
- NO text labels. Pure white background. Neutral expression.

### Output Format
Return ONLY plain text character description. NO JSON, NO code blocks.`;

  const userContent = hasCostumes
    ? `Script:\n${script}\n\nCharacter: "${characterName}"\nCostumes: ${JSON.stringify(costumes)}`
    : `Script:\n${script}\n\nGenerate appearance description for "${characterName}".`;

  const useModel = requestedModel || "gemini-3-pro-preview";
  const isThinking = useModel.toLowerCase().includes("thinking");
  const generationConfig: any = {
    ...(hasCostumes ? { responseMimeType: "application/json" } : {}),
    ...(isThinking ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
  };

  const data = await callGemini(useModel,
    [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
    generationConfig,
  );

  const rawText = extractText(data);

  if (hasCostumes) {
    try {
      const parsed = JSON.parse(rawText);
      return { description: parsed.description || "", costumeDescriptions: parsed.costumeDescriptions || [] };
    } catch {
      return { description: rawText };
    }
  }
  return { description: rawText };
}

async function localSceneDesc(body: any) {
  const { sceneName, script, model: requestedModel } = body;
  if (!sceneName || !script) throw new Error("缺少场景名称或剧本内容");

  const systemPrompt = `You are a professional film production designer. Based on the script and scene name, produce a detailed environment description for AI image generation — a grand Panoramic View scene concept.

### Core Principles
1. Panoramic perspective with depth and grandeur.
2. Pure environment — NO active characters. Static scene elements only.
3. Infer details from context: era, genre, geography, season, time of day.

### Required Elements
- Perspective & composition, spatial layout, architectural style
- Lighting, mood & color palette, time of day & weather
- Key props, ground/surface materials

### Output Format
Return ONLY plain text description in English. NO JSON.`;

  const userContent = `Script:\n${script}\n\nGenerate environment description for scene "${sceneName}".`;

  const useModel = requestedModel || "gemini-3-pro-preview";
  const isThinking = useModel.toLowerCase().includes("thinking");
  const generationConfig: any = isThinking ? { thinkingConfig: { thinkingBudget: 2048 } } : {};

  const data = await callGemini(useModel,
    [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
    generationConfig,
  );

  return { description: extractText(data) };
}
