/**
 * 本地函数调用 - 直接调用 AI API，不经过 Supabase Edge Functions
 */
import { getApiConfig } from "@/pages/Settings";
import {
  callGemini, extractText, extractImageBase64, getInlineData, fetchImageAsBase64,
  uploadImageToStorage, callSeedreamImage, rewriteToFirstFrame, proxiedFetch,
  CHAR_STYLE_MAP, SCENE_STYLE_MAP, STORYBOARD_STYLE_MAP,
  getSeedanceConfig, getViduConfig,
} from "@/lib/gemini-client";
import { compressImage } from "@/lib/image-compress";

// ===== PROMPTS =====

const EXTRACTION_PROMPT = `你是一位专业影视制作分析师，擅长从剧本中精确提取角色和场景信息。

你的任务是仔细阅读用户提供的剧本，提取所有角色和场景设定。

### ⚠️ 最重要原则：零遗漏 + 严格分类

**【严禁混淆角色与场景】**
- "角色"是指**有名字的人物**（人、动物、AI等有行为主体）。
- "场景设定"是指**地点、环境、空间**（如"实验室"、"城市废墟"、"宇宙飞船内部"）。
- 地名、建筑名、组织名、物品名 **绝对不是角色**，严禁放入 characters 数组。
- 判定标准：该名称是否能"说话"、"行动"、"穿衣服"？如果不能，它就是场景或道具，不是角色。

你必须执行以下两步流程：

**第一步：全文扫描，列出所有角色名**
- 从头到尾逐行扫描剧本，记录每一个出现过的角色名称。
- 角色名可能出现在以下位置：方括号标注如[角色名]或[角色名·年龄·服装]、对白前缀如"角色名："、叙述文本中直接提及。
- **任何有名字的人物都算角色**，哪怕只出现一次。
- 群众演员/无名路人不需要提取，但有称谓的（如"老板"、"医生张"）需要提取。
- **角色名统一**：无论剧本中角色名后缀如何变化，name 字段统一为角色的基础名称（不含年龄和服装后缀），例如 [NATHAN COLE·32岁·探险装备] 的 name 应为 "NATHAN COLE"。

**第二步：逐个角色填写详细信息**
- 确认第一步列出的每个角色都在最终输出中，不允许遗漏任何一个。

### 角色提取要求

1. **外貌描述**：基于剧本中的直接描述或隐含线索，给出角色的外貌特征（年龄、体型、发型、肤色等）。如果剧本没有明确描写，请根据角色身份和情境做合理推断。
2. **不要提取服装变体**：本阶段只关注角色身份和外貌，不需要分析具体服装。服装信息将在后续阶段处理。

### 场景设定提取要求

1. 识别剧本中出现的所有不同场景/地点。
2. 为每个场景提供详细的环境描述（时间、光线、空间特征、氛围等）。
3. 场景名称应简洁明了。

### 输出格式

输出一个合法的 JSON 对象，包含以下字段：

1. "characters" - 角色信息数组（**只包含人物角色，严禁包含场景/地点/物品**），每个包含：
   - name: 角色名称（基础名称，不含年龄/服装后缀）
   - description: 角色外貌描述

2. "sceneSettings" - 场景设定数组（**只包含地点/环境，严禁包含人物角色**），每个包含：
   - name: 场景名称
   - description: 环境详细描述

3. "characterNameList" - 字符串数组，列出所有提取到的角色名称（用于交叉验证，确保零遗漏）

请严格按此 JSON 格式输出，不要输出任何其他文字。直接输出 JSON。`;

const DECOMPOSE_PROMPT = `你是专业电影分镜师。将剧本拆解为AI视频生成用的15秒分段分镜脚本。

规则：
1. 每集8~10个片段，每片段15秒
2. **【最重要】每个片段必须包含3~5个分镜（即3~5个scene对象共享同一个segmentLabel）。严禁每个片段只有1个分镜！** 例如片段"1-1"必须拆成3~5个不同画面的scene对象，每个scene描述该片段内的一个具体镜头/画面。
3. 台词容量：正常语速≤30字/片段，快速≤45字/片段，超出则拆到下一片段
4. 基于原文拆分，人名地名用[]包裹，禁止加戏、禁止镜头术语、对白完整保留
5. 在场但未提及的角色补充简短站位描述
6. 敏感描述替换（对白原样保留）
7. **服装匹配**：如果提供了角色服装变体信息，必须为每个分镜中的多服装角色指定当前穿着的服装label。根据剧本上下文（场景、时间线、剧情发展、年龄阶段）精确判断角色在该分镜中应穿哪套服装。
8. **角色名与服装解析**：剧本中角色名可能以 [角色名·年龄·服装名] 格式出现（如 [NATHAN COLE·32岁·探险装备]）。在 characters 数组中只填写基础角色名（如 "NATHAN COLE"），服装信息填入 characterCostumes 字段（如 {"NATHAN COLE": "32岁·探险装备"}）。同一角色在不同分镜的服装后缀变化即为服装切换的直接依据。

输出JSON，仅含"scenes"数组。每个对象：
- sceneNumber: 全局序号(整数递增，从1开始连续编号)
- segmentLabel: 片段编号如"1-1","1-2"(按15秒重新划分，同片段内的多个分镜必须共享相同的segmentLabel)
- sceneName: 场景名
- description: 画面描述（每个分镜描述一个具体的镜头画面，同一片段内不同分镜应有不同的画面角度或动作）
- characters: 出场角色数组
- dialogue: "角色：台词"格式，多条换行，无则空串（台词只分配给该分镜对应的画面时刻）
- cameraDirection: 固定"无字幕、无水印、无背景音"
- duration: 固定15
- characterCostumes: 对象，key为角色名，value为该角色在此分镜中穿着的服装label（仅对有多套服装的角色填写，无多套服装的角色不填）

示例结构（片段1-1包含3个分镜）：
[
  {"sceneNumber":1,"segmentLabel":"1-1","sceneName":"战场","description":"远景：荒野上两军对峙","characters":["角色A"],"dialogue":"","cameraDirection":"无字幕、无水印、无背景音","duration":15,"characterCostumes":{"角色A":"青年·战甲"}},
  {"sceneNumber":2,"segmentLabel":"1-1","sceneName":"战场","description":"中景：角色A举刀冲锋","characters":["角色A"],"dialogue":"角色A：冲啊！","cameraDirection":"无字幕、无水印、无背景音","duration":15,"characterCostumes":{"角色A":"青年·战甲"}},
  {"sceneNumber":3,"segmentLabel":"1-1","sceneName":"战场","description":"特写：刀刃碰撞火花四溅","characters":["角色A","角色B"],"dialogue":"","cameraDirection":"无字幕、无水印、无背景音","duration":15,"characterCostumes":{"角色A":"青年·战甲"}}
]

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

export interface InvokeOptions {
  onProgress?: (partialData: any) => void;
}

export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  options?: InvokeOptions,
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  try {
    const data = await routeFunction(functionName, body, options);
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

async function routeFunction(functionName: string, body: any, options?: InvokeOptions): Promise<any> {
  switch (functionName) {
    case "extract-characters-scenes": return localExtract(body);
    case "script-decompose": return localDecompose(body, options?.onProgress);
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

  // Pre-scan: extract CONFIRMED character names from costume-annotated brackets
  // These are highly reliable — only brackets with · separator like [Name·Age·Costume]
  const confirmedNames = new Set<string>();
  // Hint names from dialogue prefixes — used for AI prompt only, NOT for post-verification
  const hintNames = new Set<string>();

  const costumePattern = /\[([^\]·]+)[·・]([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = costumePattern.exec(script)) !== null) {
    const baseName = m[1].trim();
    if (baseName && baseName.length <= 30) confirmedNames.add(baseName);
  }

  // Dialogue prefixes — hints only, may include scene headings
  const dialoguePattern = /^[\s]*([^\s:：（(\[/]{1,20})[：:]\s*[""「\S]/gm;
  while ((m = dialoguePattern.exec(script)) !== null) {
    const name = m[1].trim();
    if (name && name.length <= 20 && !/^[\d第片段场景分镜EP]/.test(name)) {
      hintNames.add(name);
    }
  }

  // Remove confirmed names from hints (no duplication)
  for (const n of confirmedNames) hintNames.delete(n);

  // Filter out obvious locations from hints
  const locationSuffixes = /(办公室|实验室|会议室|休息室|控制室|大厅|走廊|基地|总部|废墟|遗迹|空间站|飞船|星球|广场|码头|港口|机场|车站|公寓|医院|学校|教堂|监狱|工厂|仓库|酒吧|餐厅|咖啡馆|修车厂|拍卖[会行]|博物馆|图书馆|甲板|沙滩|海滩|丛林|悬崖|深潭|岩壁|巷道?|街道|特写|游艇|海中|海上)[\s\-/]*[\u4e00-\u9fff]*$/;
  const locationPrefixes = /^(第.+集|EP\s*\d|场景|分镜|片段)/i;
  for (const name of hintNames) {
    if (locationSuffixes.test(name) || locationPrefixes.test(name) || name.includes('/')) {
      hintNames.delete(name);
    }
  }

  // Combine all names for the AI prompt hint (but only confirmedNames trigger post-verification)
  const allHintNames = new Set([...confirmedNames, ...hintNames]);

  // Build pre-scan hints
  let preScanHint = "";
  if (allHintNames.size > 0) {
    preScanHint = `\n\n---\n\n【系统预扫描提示】以下名称在剧本中被检测到可能是角色名，请核实后将真正的角色包含在输出中（注意区分角色与场景/物品）：\n${[...allHintNames].join('、')}\n`;
  }

  const promptText = `${EXTRACTION_PROMPT}\n\n---\n\n以下是用户的剧本：\n\n${script}${preScanHint}`;

  const extractSignal = AbortSignal.timeout(3 * 60_000); // 3 min timeout for extraction
  const data = await callGemini(model,
    [{ role: "user", parts: [{ text: promptText }] }],
    { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json" },
    extractSignal,
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

  // === Post-filter: remove scene/location entries misclassified as characters ===
  const sceneNames = new Set((parsed.sceneSettings || []).map((s: any) => s.name?.trim().toLowerCase()));
  if (parsed.characters) {
    const before = parsed.characters.length;
    parsed.characters = parsed.characters.filter((c: any) => {
      const name = c.name?.trim() || "";
      if (sceneNames.has(name.toLowerCase())) {
        console.warn(`[localExtract] 过滤掉被误归为角色的场景: "${name}"`);
        return false;
      }
      const isLikelyLocation = locationSuffixes.test(name) || locationPrefixes.test(name) || name.includes('/');
      if (isLikelyLocation) {
        console.warn(`[localExtract] 过滤掉疑似场景名的角色: "${name}"`);
        if (!parsed.sceneSettings) parsed.sceneSettings = [];
        parsed.sceneSettings.push({ name, description: c.description || "" });
        return false;
      }
      return true;
    });
    if (parsed.characters.length < before) {
      console.log(`[localExtract] 已过滤 ${before - parsed.characters.length} 个被误归为角色的条目`);
    }
  }

  // === Post-verification: only for CONFIRMED names (from · brackets), not dialogue hints ===
  const extractedNames = new Set((parsed.characters || []).map((c: any) => c.name?.trim()));
  const missingConfirmed = [...confirmedNames].filter(n => !extractedNames.has(n));
  
  if (missingConfirmed.length > 0) {
    console.warn(`[localExtract] AI 遗漏了 ${missingConfirmed.length} 个确认角色，正在补充:`, missingConfirmed);
    for (const name of missingConfirmed) {
      parsed.characters.push({ name, description: `（AI 未提取到该角色的详细描述，请根据剧本手动补充）` });
    }
  }

  // Remove any costume data that AI might have returned (we don't want it in this phase)
  for (const char of (parsed.characters || [])) {
    delete char.costumes;
  }

  return { characters: parsed.characters || [], sceneSettings: parsed.sceneSettings || [] };
}

async function localDecompose(body: any, onProgress?: (partialData: any) => void) {
  const { script, systemPrompt, model: requestedModel, costumeInfo } = body;
  if (!script) throw new Error("缺少剧本内容");

  const model = requestedModel || "gemini-3.1-pro-preview";
  const prompt = (systemPrompt && typeof systemPrompt === "string") ? systemPrompt : DECOMPOSE_PROMPT;
  
  // Build costume context if available
  let costumeContext = "";
  if (costumeInfo && Array.isArray(costumeInfo) && costumeInfo.length > 0) {
    costumeContext = "\n\n---\n\n以下是阶段一识别到的角色服装变体信息（仅列出有多套服装的角色）：\n\n";
    for (const char of costumeInfo) {
      costumeContext += `【${char.name}】的服装变体：\n`;
      for (const cos of char.costumes) {
        costumeContext += `  - "${cos.label}"：${cos.description}\n`;
      }
      costumeContext += "\n";
    }
    costumeContext += "请在每个分镜的 characterCostumes 字段中，为上述角色指定当前穿着的服装label。务必根据剧本上下文精确判断。\n";
  }

  // Split by episodes if script is large to reduce per-request payload
  const episodes = splitScriptByEpisodes(script);
  
  if (episodes.length > 1) {
    console.log(`[localDecompose] 检测到 ${episodes.length} 集剧本，将分集拆解`);
    const allScenes: any[] = [];
    let globalSceneNumber = 1;

    for (let epIdx = 0; epIdx < episodes.length; epIdx++) {
      const ep = episodes[epIdx];
      console.log(`[localDecompose] 正在拆解第 ${epIdx + 1}/${episodes.length} 集...`);
      const epPrefix = episodes.length > 1 ? `${epIdx + 1}-` : "";
      const userText = `${prompt}\n\n---\n\n以下是第${epIdx + 1}集剧本：\n\n${ep}${costumeContext}`;

      const chunkSignal = AbortSignal.timeout(5 * 60_000); // 5 min timeout per chunk
      const data = await callGemini(model,
        [{ role: "user", parts: [{ text: userText }] }],
        { temperature: 0.3, maxOutputTokens: 65536 },
        chunkSignal,
      );

      const resultText = extractText(data);
      if (!resultText) throw new Error(`第${epIdx + 1}集拆解失败：AI 未返回内容`);

      const epScenes = parseDecomposeResult(resultText);
      // Re-number scenes and prefix segmentLabels for multi-episode
      for (const scene of epScenes) {
        scene.sceneNumber = globalSceneNumber++;
        if (epPrefix) {
          scene.segmentLabel = `${epPrefix}${scene.segmentLabel || ''}`;
        }
      }
      allScenes.push(...epScenes);

      // Progressive callback: send accumulated scenes after each chunk
      if (onProgress) {
        onProgress({ scenes: allScenes, chunkIndex: epIdx, totalChunks: episodes.length });
      }
    }

    return { scenes: allScenes };
  }

  // Single episode or couldn't split - send as one request
  const userText = `${prompt}\n\n---\n\n以下是用户的剧本：\n\n${script}${costumeContext}`;

  const decomposeSignal = AbortSignal.timeout(5 * 60_000); // 5 min timeout for decomposition
  const data = await callGemini(model,
    [{ role: "user", parts: [{ text: userText }] }],
    { temperature: 0.3, maxOutputTokens: 65536 },
    decomposeSignal,
  );

  const resultText = extractText(data);
  if (!resultText) throw new Error("AI 未返回内容");

  const scenes = parseDecomposeResult(resultText);
  return { scenes };
}

const MAX_CHUNK_CHARS = 8000;
const MIN_CHUNK_CHARS = 4000;

/** Split a multi-episode script into chunks. Only splits if script > 8000 chars, each chunk 4000~8000 chars */
function splitScriptByEpisodes(script: string): string[] {
  // Don't split short scripts
  if (script.length <= MAX_CHUNK_CHARS) return [script];

  // First try to split by episode markers
  const epPattern = /(?:^|\n)\s*(?:EP\s*(\d+)|第\s*(\d+)\s*[集话期章]|Episode\s+(\d+))\b/gi;
  const markers: { index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = epPattern.exec(script)) !== null) {
    markers.push({ index: m.index });
  }

  let rawChunks: string[];
  if (markers.length > 1) {
    rawChunks = [];
    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].index;
      const end = i < markers.length - 1 ? markers[i + 1].index : script.length;
      const ep = script.slice(start, end).trim();
      if (ep.length > 100) rawChunks.push(ep);
    }
    if (rawChunks.length <= 1) rawChunks = [script];
  } else {
    rawChunks = [script];
  }

  // Further split any chunk exceeding MAX_CHUNK_CHARS, targeting 4000~8000 per chunk
  const finalChunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length <= MAX_CHUNK_CHARS) {
      finalChunks.push(chunk);
      continue;
    }
    // Split by paragraph boundaries (double newline) targeting MIN~MAX range
    const paragraphs = chunk.split(/\n{2,}/);
    let current = "";
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const wouldBe = current.length + (current ? 2 : 0) + para.length;
      // If adding this paragraph would exceed MAX and we already have enough content (>= MIN), flush
      if (wouldBe > MAX_CHUNK_CHARS && current.length >= MIN_CHUNK_CHARS) {
        finalChunks.push(current.trim());
        current = para;
      } else {
        current += (current ? "\n\n" : "") + para;
      }
    }
    if (current.trim()) {
      // If last chunk is too small, merge with previous
      if (current.trim().length < MIN_CHUNK_CHARS && finalChunks.length > 0) {
        finalChunks[finalChunks.length - 1] += "\n\n" + current.trim();
      } else {
        finalChunks.push(current.trim());
      }
    }
  }

  return finalChunks.length > 1 ? finalChunks : [script];
}

/** Parse decompose JSON result from AI text */
function parseDecomposeResult(resultText: string): any[] {
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

  return Array.isArray(parsed) ? parsed : (parsed?.scenes || []);
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
      const { apiKey, endpoint } = getViduConfig();
      if (!apiKey) throw new Error("Vidu API Key 未配置");
      const res = await proxiedFetch(`${endpoint}/tasks/${taskId}/creations`, {
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
    const { apiKey, endpoint } = getViduConfig();
    if (!apiKey) throw new Error("Vidu API Key 未配置，请在设置中配置");
    const viduUrl = body.imageUrl ? `${endpoint}/img2video` : `${endpoint}/text2video`;
    const truncatedPrompt = (body.prompt || "").length > 4900 ? body.prompt.substring(0, 4900) : body.prompt;
    const payload: any = {
      model: model || "viduq3-pro",
      prompt: truncatedPrompt,
      duration: Math.max(1, Math.min(16, body.duration || 5)),
      resolution: "1080p",
      audio: true,
    };
    if (body.imageUrl) payload.images = [body.imageUrl];

    const res = await proxiedFetch(viduUrl, {
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
    const textFields: Record<string, string> = {
      model: model || "doubao-seedance-1-5-pro_1080p",
      prompt: body.prompt,
      seconds: String(Math.max(4, Math.min(15, Number(body.duration) || 5))),
      size: body.aspectRatio || "16:9",
    };

    // Prepare image binary data if available
    let imageBlob: Blob | null = null;
    let imageMimeType = "image/jpeg";

    if (body.imageUrl && typeof body.imageUrl === "string") {
      let imageDataUri: string | null = null;
      if (body.imageUrl.startsWith("data:")) {
        imageDataUri = body.imageUrl;
      } else {
        const fetched = await fetchImageAsBase64(body.imageUrl);
        if (fetched) {
          imageDataUri = `data:${fetched.mimeType};base64,${fetched.data}`;
        }
      }
      if (imageDataUri) {
        // Compress using configurable parameters from settings
        const cfg = getApiConfig();
        const maxBytes = (cfg.firstFrameMaxKB || 800) * 1024;
        const maxDim = cfg.firstFrameMaxDim || 720;
        try {
          imageDataUri = await compressImage(imageDataUri, maxBytes, { maxDim, minQuality: 0.3 });
        } catch (e) {
          console.warn("图片压缩失败，使用原图:", e);
        }
        // Convert data URI to binary Blob
        const match = imageDataUri.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          imageMimeType = match[1];
          const binaryStr = atob(match[2]);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          imageBlob = new Blob([bytes], { type: imageMimeType });
        }
      }
    }

    // Build proper multipart/form-data using FormData for binary file support
    const formData = new FormData();
    for (const [key, value] of Object.entries(textFields)) {
      formData.append(key, value);
    }
    if (imageBlob) {
      const ext = imageMimeType === "image/png" ? "png" : "jpeg";
      formData.append("first_frame_image", imageBlob, `frame.${ext}`);
    }

    // Use direct fetch through proxy with FormData (browser sets boundary automatically)
    const config = getApiConfig();
    const targetUrl = `${endpoint}/videos`;
    const targetHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };

    // For FormData, we need to use the proxy differently - send as binary through proxy
    const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy`;
    
    let res: Response;
    if (config.directMode) {
      try {
        res = await fetch(targetUrl, {
          method: "POST",
          headers: targetHeaders,
          body: formData,
        });
      } catch {
        // Fallback to proxy - but proxy can't handle binary FormData well,
        // so try without image as last resort
        console.warn("直连失败，通过代理重试（不含首帧图片）");
        const fallbackFields = { ...textFields };
        const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
        let fallbackBody = "";
        for (const [key, value] of Object.entries(fallbackFields)) {
          fallbackBody += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
        }
        fallbackBody += `--${boundary}--\r\n`;
        res = await proxiedFetch(targetUrl, {
          ...targetHeaders,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        }, fallbackBody);
      }
    } else {
      // Through proxy: if we have an image, try sending without it to avoid buffer issues
      // The proxy text-based approach can't handle large binary data
      if (imageBlob) {
        // Try direct fetch first for image support
        try {
          res = await fetch(targetUrl, {
            method: "POST",
            headers: targetHeaders,
            body: formData,
          });
        } catch {
          // If direct fails (mixed content), send via proxy without image
          console.warn("直连失败（混合内容），通过代理发送（不含首帧图片）");
          const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
          let fallbackBody = "";
          for (const [key, value] of Object.entries(textFields)) {
            fallbackBody += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
          }
          fallbackBody += `--${boundary}--\r\n`;
          res = await proxiedFetch(targetUrl, {
            ...targetHeaders,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          }, fallbackBody);
        }
      } else {
        const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
        let formBody = "";
        for (const [key, value] of Object.entries(textFields)) {
          formBody += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
        }
        formBody += `--${boundary}--\r\n`;
        res = await proxiedFetch(targetUrl, {
          ...targetHeaders,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        }, formBody);
      }
    }

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
