// 短剧创作各阶段 Prompt 模板
// 从 short-drama 仓库提取并优化

import type { DramaSetup, EpisodeEntry } from "@/types/drama";

/** 目标市场描述与创作语言指令 */
function getMarketDirective(setup: DramaSetup): string {
  const market = setup.targetMarket || "cn";
  if (market === "jp") {
    return `## 🌏 目標市場：日本
- **創作言語：日本語** —— すべての出力は日本語で記述すること。
- **美学傾向**：物哀（もののあわれ）、幽玄（ゆうげん）、侘び寂び（わびさび）
- **叙事スタイル**：内向的で繊細な感情描写を重視。キャラクターの内面独白と微妙な関係変化に注力。余白を多用し、直叙よりも暗示を優先。テンポは緩やかでも感情密度は高く保つ。
- **文化適応**：キャラクター名・場面設定・社会関係・敬語体系は日本文化に準拠すること。中国語表現の直訳を避ける。`;
  }
  if (market === "west") {
    return `## 🌏 Target Market: Western (US/EU)
- **Writing Language: English** — All output must be written in English.
- **Style**: Hollywood high-concept format. Think YA blockbusters like *Harry Potter*, *Twilight*, *The Hunger Games* — punchy hooks, visceral stakes, and propulsive pacing.
- **Narrative approach**: External conflict drives internal change. Favor direct plot propulsion, satisfying twists, and "page-turner" cliffhangers. Lean into spectacle and wish-fulfillment.
- **Cultural fit**: Names, settings, social norms should feel authentic to a Western audience. Use standard screenplay/novel conventions.`;
  }
  if (market === "kr") {
    return `## 🌏 목표 시장: 한국
- **창작 언어: 한국어** — 모든 출력은 한국어로 작성할 것.
- **미학 경향**: 한국 드라마(K-Drama) 특유의 섬세한 감정선과 운명적 서사. 캐릭터 간의 밀고 당기는 관계 역학, 비밀과 오해에서 비롯된 갈등, 그리고 극적인 반전(plot twist)을 중시.
- **서사 스타일**: 감정의 밀도를 높이되 전개는 긴박하게 유지. 주인공의 성장과 복수·사랑·운명의 교차를 핵심 축으로 삼는다. "밀당"과 "떡밥 회수"를 구조적으로 설계. 시청자의 감정 이입과 공감을 최우선.
- **문화 적응**: 캐릭터명·장소·사회관계·존대어 체계는 한국 문화에 부합해야 한다. 재벌·신분 격차·가족 갈등 등 한국 드라마 특유의 소재를 적극 활용.`;
  }
  if (market === "sea") {
    return `## 🌏 Target Market: Southeast Asia
- **Writing Language: English** — All output must be written in English (universally accessible across SEA markets).
- **Style**: Melodramatic storytelling with high emotional stakes. Blend family honor, social class conflict, and passionate romance. Think Philippine teleserye or Thai lakorn intensity — every emotion is felt deeply and expressed openly.
- **Narrative approach**: Strong moral undercurrents with clear hero/villain dynamics. Favor rags-to-riches arcs, family loyalty vs. personal desire, and justice prevailing after prolonged suffering. Heavy use of dramatic irony and coincidence as plot devices.
- **Cultural fit**: Reflect Southeast Asian social dynamics — extended family hierarchy, economic disparity, spiritual/superstitious elements. Names and settings should feel authentic to a multi-cultural SEA audience.`;
  }
  return `## 🌏 目标市场：国内（中文）
- **创作语言：中文** —— 全部输出内容使用中文撰写。
- 符合国内短剧平台的节奏与审美。`;
}

/** 创作方案 Prompt */
export function buildCreativePlanPrompt(setup: DramaSetup): string {
  const genreStr = setup.genres.join(" + ");
  return `你是一位专业的微短剧编剧，精通短视频平台的爆款短剧创作方法论。

${getMarketDirective(setup)}

## 当前项目配置
- 题材组合：${genreStr}
- 目标受众：${setup.audience}
- 故事基调：${setup.tone}
- 结局类型：${setup.ending}
- 总集数：${setup.totalEpisodes}集
${setup.customTopic ? `- 用户补充描述：${setup.customTopic}` : ""}

## 参考知识：节奏曲线
微短剧节奏公式：紧张蓄力 → 爽点释放 → 短暂喘息 → 新一轮蓄力
四段式结构：
- 起势段（前15%集数）：建立世界观和人物关系，制造第一个爽点
- 攀升段（15-45%）：冲突升级，多条线并行推进
- 风暴段（45-80%）：高潮迭起，反转频出
- 决战段（最后20%）：终极对决，结局收束

## 参考知识：付费卡点设计
三大设计原则：情绪峰值原则、悬念未解原则、沉没成本原则
黄金卡点位置：
- 首个卡点：第8-12集（最强悬念）
- 第二卡点：第18-25集（身份揭露/反转）
- 第三卡点：第35-45集（感情线高潮）
- 终极卡点：倒数3-5集（终极对决前）
付费卡点总占比 10-15%

## 参考知识：爽点矩阵
5大爽点类型：身份碾压、逆袭打脸、甜宠撒糖、虐心催泪、悬疑反转
爽点本质：压抑 → 释放。压抑越深，释放越爽。

## 你的任务
请生成完整的创作方案，包含以下 8 个板块：

1. **剧名备选**（3个），每个附一句话说明
2. **时空背景**：时代、地点、社会环境、阶层关系
3. **一句话故事线** + **核心冲突**
4. **三幕结构拆解**：
   - 第一幕（建置）：集数范围、核心事件、人物关系建立
   - 第二幕（对抗）：集数范围、冲突升级、转折点
   - 第三幕（高潮/结局）：集数范围、终极对决、结局处理
5. **全剧节奏波形描述**：标注高潮点、低谷点位置
6. **付费卡点规划**：具体集数 + 卡点类型 + 悬念设计
7. **爽感矩阵**：规划全剧各类爽点分布和配比
8. **结局设计**：主线结局 + 感情线结局 + 伏笔回收

用 Markdown 格式输出，清晰分区。`;
}

/** 角色开发 Prompt */
export function buildCharactersPrompt(setup: DramaSetup, creativePlan: string): string {
  const genreStr = setup.genres.join(" + ");
  return `你是一位专业的微短剧编剧。

${getMarketDirective(setup)}

## 当前项目
- 题材：${genreStr}
- 受众：${setup.audience}
- 基调：${setup.tone}
- 总集数：${setup.totalEpisodes}集

## 已有创作方案
${creativePlan}

## 参考知识：四层反派体系
反派设计三原则：可恨原则、可信原则、递进原则
- 第一层·小反派（前15%集数）：身份不高的小人物，嚣张但无实力，被打脸后迅速退场
- 第二层·中反派（前2/3集数）：有一定权势的对手，能给主角造成真正威胁
- 第三层·大反派（中后期）：终极Boss，实力和资源远超主角
- 第四层·隐藏反派（后1/3揭露）：身边最信任的人，反转冲击力最大

## 你的任务
生成完整角色体系，包含：

1. **主要角色档案**（每个角色包含）：
   - 姓名、年龄、外貌特征（2-3句）
   - 性格关键词（3-5个）
   - 公开身份 vs 真实身份
   - 核心动机
   - 爽点功能（承担什么爽点）
   - 口头禅或语言特征
   - 人物弧光（从开始到结局的变化轨迹）

2. **角色关系图**（使用 Mermaid graph TD 格式输出，用中文标注关系类型）

请在 \`\`\`mermaid 和 \`\`\` 之间输出关系图代码，示例：
\`\`\`mermaid
graph TD
    A[苏念·女主] -->|暗恋| B[陆景琛·男主]
    B -->|保护| A
    C[赵婉儿·反派] -->|嫉妒| A
    D[陆母] -->|反对| A
\`\`\`

3. **感情线弧线**：男女主关系发展的关键节点（标注集数）

4. **四层反派体系**：
   - 每层反派的身份、动机、行为模式、击败/揭露过程

5. **关键互动场景预设**：
   - 第一次冲突场景
   - 身份揭露场景
   - 感情转折场景
   - 终极对决场景

用 Markdown 格式输出。`;
}

/** 分集目录 Prompt */
export function buildDirectoryPrompt(setup: DramaSetup, creativePlan: string, characters: string): string {
  return `你是一位专业的微短剧编剧。

${getMarketDirective(setup)}

## 已有创作方案
${creativePlan}

## 已有角色档案
${characters}

## 参考知识：钩子设计
5种钩子类型：
- 悬念钩（20-30%）：抛出关键疑问，答案留到下集
- 反转钩（5-15%）：在观众以为知道答案时，突然推翻
- 情绪钩（30-40%）：把情绪推到顶点然后截断
- 信息钩（10-20%）：释放一个关键信息，但只给一半
- 危机钩（10-20%）：主角陷入即时危险

## 参考知识：节奏曲线
四段式结构（${setup.totalEpisodes}集）：
- 起势段（约前${Math.round(setup.totalEpisodes * 0.15)}集）
- 攀升段（约${Math.round(setup.totalEpisodes * 0.15) + 1}-${Math.round(setup.totalEpisodes * 0.45)}集）
- 风暴段（约${Math.round(setup.totalEpisodes * 0.45) + 1}-${Math.round(setup.totalEpisodes * 0.8)}集）
- 决战段（约${Math.round(setup.totalEpisodes * 0.8) + 1}-${setup.totalEpisodes}集）

## 你的任务
生成完整的 ${setup.totalEpisodes} 集分集目录。

每集一行，格式：
第{N}集：{集标题} —— {核心冲突或爽点一句话描述} [钩子类型] {标记}

标记说明：
- 🔥 关键剧情集（重大转折、揭秘），占比 25-35%
- ⚡ 高潮卡点集（情绪最高峰、终极对决、命运转折等全剧最震撼的高潮时刻），占比 10-15%
- 一集可以同时标 🔥⚡
- 无标记 = 常规推进集

要求：
- 必须覆盖全部 ${setup.totalEpisodes} 集
- 前 10 集必须包含至少 3 个 🔥
- ⚡ 高潮卡点建议分布在以下位置：
  · 第8-12集（首个高潮）
  · 第18-25集（身份揭露/重大反转）
  · 第35-45集（感情线高潮）
  · 倒数3-5集（终极对决）
- 目录必须体现三幕结构的节奏变化
- 每集标注钩子类型（悬念钩/反转钩/情绪钩/信息钩/危机钩）
- 按段落分组显示（起势段/攀升段/风暴段/决战段）

末尾附统计信息：🔥数量、⚡数量、各钩子类型占比。`;
}

/** 获取市场对应的剧本格式模板 */
function getScriptFormatTemplate(setup: DramaSetup, episodeNumber: number, hookType: string): string {
  const market = setup.targetMarket || "cn";

  if (market === "jp") {
    return `## 脚本フォーマット（日本市場向け）

\`\`\`
# 第${episodeNumber}話：{エピソードタイトル}

> キーワード：{3つのキーワード}
> 感情テーマ：{感情の核心}
> 前回のあらすじ：{前話の余韻、1-2文}

---

## シーン1

**場面：** 屋内/屋外 · {場所} · 昼/夜
**登場人物：** {人物リスト}

△ （ロングショット）{情景描写 — 季節感・空気感を重視}
△ （ミディアムショット）{人物の所作・微細な表情変化}

**{キャラクター名}**（{口調/動作指示}）：「{台詞}」

△ （クローズアップ）{象徴的ディテール — 物哀の瞬間}

♪ 音楽：{和楽器・アンビエント系の雰囲気}

---

> 🎣 引き：{余韻と暗示}
> 📺 次回予告：{次話の核心}
\`\`\`

## 品質基準
- 各話 3-5 シーン
- 各話 800文字以上
- カメラワーク：ロング・ミディアム・アップ・クローズアップ（最低3種使用）
- 台詞には口調・動作指示を付記
- 物哀・余韻を意識した描写を各シーンに1箇所以上
- 結末は${hookType || "余韻"}で締める`;
  }

  if (market === "west") {
    return `## Script Format (Western Market)

\`\`\`
# Episode ${episodeNumber}: {Episode Title}

> Keywords: {3 keywords}
> Hook Type: {satisfaction/thrill type}
> Previously: {Last episode's cliffhanger, 1-2 sentences}

---

## SCENE 1

**INT./EXT. {LOCATION} — DAY/NIGHT**
**CHARACTERS: {character list}**

△ (WIDE) {Scene description — visceral, cinematic}
△ (MEDIUM) {Character action — body language, tension}

**{CHARACTER NAME}** ({tone/action direction}): "{Dialogue}"

△ (CLOSE-UP) {Key detail — plot-critical visual}

♪ Score: {Music/sound design cue}

---

> 🎣 Cliffhanger: {hook description}
> 📺 Next Episode: {teaser}
\`\`\`

## Quality Standards
- 3-5 scenes per episode
- Minimum 800 words per episode
- Camera directions: WIDE, MEDIUM, CLOSE-UP, EXTREME CLOSE-UP (use at least 3)
- Dialogue must include tone/action parentheticals
- End with a strong ${hookType || "cliffhanger"} hook
- High-concept pacing: open with a bang, escalate fast, end on a twist`;
  }

  if (market === "kr") {
    return `## 대본 형식 (한국 시장)

\`\`\`
# 제${episodeNumber}화: {에피소드 제목}

> 키워드: {3개 키워드}
> 감정 테마: {핵심 감정}
> 이전 줄거리: {지난 화 클리프행어, 1-2문장}

---

## 씬 1

**장소:** 실내/실외 · {장소} · 낮/밤
**등장인물:** {인물 목록}

△ (풀샷) {장면 묘사 — 분위기와 공간감}
△ (미디엄샷) {인물의 표정·동작 — 감정 변화에 집중}

**{캐릭터명}** ({말투/동작 지시}): "{대사}"

△ (클로즈업) {핵심 디테일 — 감정 폭발의 순간}

♪ OST: {배경음악 분위기 지시}

---

> 🎣 떡밥: {다음 화 궁금증 유발}
> 📺 차회 예고: {다음 화 핵심}
\`\`\`

## 품질 기준
- 각 화 3-5개 씬
- 각 화 최소 800자 이상
- 카메라 워크: 풀샷·미디엄샷·클로즈업·익스트림클로즈업 (최소 3종 사용)
- 대사에 말투·동작 지시 포함
- 감정 밀당과 반전을 각 씬에 배치
- 결말은 ${hookType || "클리프행어"}로 마무리`;
  }

  if (market === "sea") {
    return `## Script Format (Southeast Asian Market)

\`\`\`
# Episode ${episodeNumber}: {Episode Title}

> Keywords: {3 keywords}
> Emotional Core: {dominant emotion}
> Previously: {Last episode's dramatic moment, 1-2 sentences}

---

## SCENE 1

**INT./EXT. {LOCATION} — DAY/NIGHT**
**CHARACTERS: {character list}**

△ (WIDE) {Scene description — lush, atmospheric, emotionally charged}
△ (MEDIUM) {Character interaction — body language conveying unspoken tension}

**{CHARACTER NAME}** ({tone/action direction}): "{Dialogue}"

△ (CLOSE-UP) {Emotional reaction — tears, rage, revelation}

♪ Music: {Dramatic underscore or emotional ballad cue}

---

> 🎣 Drama Hook: {emotional cliffhanger}
> 📺 Next Episode: {teaser}
\`\`\`

## Quality Standards
- 3-5 scenes per episode
- Minimum 800 words per episode
- Camera directions: WIDE, MEDIUM, CLOSE-UP, EXTREME CLOSE-UP (use at least 3)
- Dialogue must include tone/action parentheticals
- Maximize emotional intensity — confrontation, confession, betrayal moments
- End with a powerful ${hookType || "dramatic revelation"} hook
- Melodramatic pacing: slow emotional build → explosive climax per episode`;
  }

  // 国内默认
  return `## 剧本格式要求（国内模式）

\`\`\`
# 第${episodeNumber}集：{集标题}

> 本集关键词：{3个关键词}
> 本集爽点：{爽点类型}
> 前情提要：{上集结尾悬念，1-2句}

---

## 场次一

**场景：** 内景/外景 · {地点} · 日/夜
**出场人物：** {人物列表}

△ （全景）{场景描写}
△ （中景）{人物动作描写}

**{角色名}**（{语气/动作指示}）："{台词}"

△ （特写）{关键细节描写}

♪ 音乐提示：{音乐氛围描述}

---

> 🎣 本集钩子：{悬念描述}
> 📺 下集预告：{下集核心看点}
\`\`\`

## 质量要求
- 每集 3-5 个场次
- 每集至少 800 字
- 景别提示：全景、中景、近景、特写（至少使用3种）
- 台词带语气或动作指示
- 结尾必须有悬念钩子（${hookType || "悬念钩"}）`;
}

/** 分集撰写 Prompt */
export function buildEpisodePrompt(
  setup: DramaSetup,
  characters: string,
  directory: EpisodeEntry[],
  episodeNumber: number,
  previousEpisodes: string,
  customInstruction?: string,
): string {
  const ep = directory.find((e) => e.number === episodeNumber);
  const prevEp = directory.find((e) => e.number === episodeNumber - 1);
  const nextEp = directory.find((e) => e.number === episodeNumber + 1);
  const isFirstEp = episodeNumber === 1;

  return `你是一位专业的微短剧编剧。

${getMarketDirective(setup)}

## 项目配置
- 题材：${setup.genres.join(" + ")}
- 基调：${setup.tone}
- 总集数：${setup.totalEpisodes}

## 角色档案（摘要）
${characters.slice(0, 3000)}

## 当前集信息
- 第 ${episodeNumber} 集：${ep?.title || ""}
- 梗概：${ep?.summary || ""}
- 钩子类型：${ep?.hookType || ""}
- ${ep?.isKey ? "🔥 关键剧情集" : ""}${ep?.isClimax ? " ⚡ 高潮卡点集" : ""}
${prevEp ? `- 上一集：第${prevEp.number}集 ${prevEp.title} —— ${prevEp.summary}` : ""}
${nextEp ? `- 下一集：第${nextEp.number}集 ${nextEp.title} —— ${nextEp.summary}` : ""}

${previousEpisodes ? `## 前集回顾\n${previousEpisodes.slice(-2000)}` : ""}

${isFirstEp ? `## 重要：开篇黄金法则
- 第1秒：画面冲击或悬念抛出
- 第3秒：核心冲突或身份反差建立
- 第5秒：观众必须产生"接下来会怎样"的好奇心
- 前30秒必须完成：建立核心冲突、展示主角处境、抛出第一个钩子
- 禁止：大段旁白、慢节奏空镜、流水账、平铺直叙` : ""}

${getScriptFormatTemplate(setup, episodeNumber, ep?.hookType || "")}

- 确保角色行为与档案一致
- 确保剧情推进与分集目录一致

${customInstruction ? `\n## 用户重写指令\n${customInstruction}\n请在撰写时重点体现以上指令要求。\n` : ""}
请直接输出完整的第 ${episodeNumber} 集剧本。`;
}

/** 单场次重写 Prompt */
export function buildSceneRegenPrompt(
  setup: DramaSetup,
  characters: string,
  episodeNumber: number,
  episodeContent: string,
  sceneIndex: number,
  sceneContent: string,
  customInstruction?: string,
): string {
  const instructionBlock = customInstruction
    ? `\n\n## 用户重写指令\n${customInstruction}\n请在重写时重点体现以上指令要求，但不得违反下方"连贯性铁律"。`
    : "";

  // --- Extract adjacent scenes as anchors ---
  const sceneRegex = /^(##\s*场次.*)$/gm;
  const matches = [...episodeContent.matchAll(sceneRegex)];
  const extractScene = (idx: number): string | null => {
    if (idx < 0 || idx >= matches.length) return null;
    const start = matches[idx].index!;
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : episodeContent.length;
    return episodeContent.slice(start, end).trim();
  };

  const prevScene = extractScene(sceneIndex - 1);
  const nextScene = extractScene(sceneIndex + 1);

  const anchorBlock = [
    prevScene
      ? `### 前一场次（场次${sceneIndex}）— 剧情锚点\n${prevScene}\n\n**衔接约束**：重写后的场次开头必须自然承接上述场次的结尾状态（角色位置、情绪、已知信息）。`
      : `（本场次为该集首场，需承接集标题/前情提要中的状态。）`,
    nextScene
      ? `### 后一场次（场次${sceneIndex + 2}）— 剧情锚点\n${nextScene}\n\n**衔接约束**：重写后的场次结尾必须保证后续场次的开头仍然成立（角色去向、情绪转折、信息揭示均不可断裂）。`
      : `（本场次为该集末场，结尾需保留原有的悬念/钩子设计。）`,
  ].join("\n\n");

  return `你是一位专业的微短剧编剧，擅长在不改变核心剧情的前提下提升场次的表现力。

${getMarketDirective(setup)}

## 项目配置
- 题材：${setup.genres.join(" + ")}
- 基调：${setup.tone}

## 角色档案（摘要）
${characters.slice(0, 2000)}

## 当前集完整内容
${episodeContent}

---

## 前后场次剧情锚点
${anchorBlock}
${instructionBlock}

---

## 连贯性铁律（最高优先级）

1. **核心剧情不可变更**：本场次的关键事件（信息揭示、角色决策、冲突升级/降级）必须与原场次完全一致。禁止新增、删除或替换任何影响后续剧情的事件。
2. **角色情感弧线约束**：
   - 场次开头的角色情绪状态必须匹配前一场次（或集开头）的结束状态；
   - 场次结尾的角色情绪状态必须能自然过渡到后一场次（或集结尾悬念）的起始状态；
   - 角色在本场次中的情绪变化轨迹（如：隐忍→爆发、怀疑→确认）必须保持原有方向，仅允许在表达强度上调整。
3. **结尾状态衔接检查**：重写完成后，自检以下三项，若任一项不满足则必须修正：
   - ✅ 角色的物理位置与后续场次一致
   - ✅ 已揭示/未揭示的信息与后续场次一致
   - ✅ 角色间关系状态（敌对/信任/误解等）与后续场次一致
4. **禁止跨场次副作用**：不得引入新角色、新道具、新地点，除非原场次中已存在。

---

## 你的任务
请重新撰写上述第 ${episodeNumber} 集中的 **场次${sceneIndex + 1}** 部分。

原场次内容：
${sceneContent}

**允许优化的维度**：
- 台词的表现力与潜台词层次
- 镜头语言（△ 景别切换、运镜节奏）
- 场景氛围描写与感官细节
- 节奏感（停顿、沉默、反应镜头的运用）
- ♪ 音效/音乐提示的精准度

**输出格式要求**：
- 使用与原文相同的格式（场景描述、△ 镜头、角色台词、♪ 音乐等）
- 仅输出该场次的内容，不要输出其他场次
- 不要输出自检过程，仅输出最终场次内容

请直接输出重写后的场次内容。`;
}

/** 导出整合 Prompt */
export function buildExportPrompt(
  setup: DramaSetup,
  dramaTitle: string,
  creativePlan: string,
  characters: string,
  episodes: { number: number; title: string; content: string }[],
): string {
  return `你是一位专业编辑。请将以下创作内容整合为一份完整、排版规范的剧本文档。

${getMarketDirective(setup)}

## 元信息
- 剧名：${dramaTitle}
- 题材：${setup.genres.join(" + ")}
- 总集数：${setup.totalEpisodes}集
- 已完成：${episodes.length}集
- 目标受众：${setup.audience}
- 故事基调：${setup.tone}

## 创作方案摘要
${creativePlan.slice(0, 1500)}

## 角色表摘要
${characters.slice(0, 1500)}

## 分集剧本
${episodes.map((ep) => `### 第${ep.number}集：${ep.title}\n${ep.content}`).join("\n\n---\n\n")}

请输出整合后的完整剧本文档，格式规范，包含封面信息、角色表、分集剧本。`;
}

/** 质量自检 Prompt */
export function buildReviewPrompt(
  setup: DramaSetup,
  characters: string,
  directory: EpisodeEntry[],
  episodeNumber: number,
  episodeContent: string,
  prevEpisodeContent?: string,
  nextEpisodeContent?: string,
): string {
  const genreStr = setup.genres.join(" + ");
  const epEntry = directory.find((d) => d.number === episodeNumber);

  return `你是一位资深短剧质检编辑，精通微短剧的创作标准和行业规范。

${getMarketDirective(setup)}

## 任务
对以下第 ${episodeNumber} 集剧本进行五维度质量评分和审查。

## 项目信息
- 题材：${genreStr}
- 受众：${setup.audience}
- 基调：${setup.tone}
- 结局：${setup.ending}
- 总集数：${setup.totalEpisodes}
${epEntry ? `- 本集标题：${epEntry.title}\n- 本集概要：${epEntry.summary}\n- 钩子类型：${epEntry.hookType}${epEntry.isKey ? "\n- 🔥 关键集" : ""}${epEntry.isClimax ? "\n- ⚡ 高潮卡点" : ""}` : ""}

## 角色档案（摘要）
${characters.slice(0, 2000)}

${prevEpisodeContent ? `## 上一集内容（末尾片段）\n${prevEpisodeContent.slice(-600)}\n` : ""}
${nextEpisodeContent ? `## 下一集内容（开头片段）\n${nextEpisodeContent.slice(0, 600)}\n` : ""}

## 待审查剧本
${episodeContent}

---

## 评分要求

请严格按照以下五个维度评分（每项 1-10 分），并输出 **严格的 JSON 格式**：

\`\`\`json
{
  "scores": {
    "rhythm": { "score": 8, "comment": "评价说明" },
    "satisfaction": { "score": 7, "comment": "评价说明" },
    "dialogue": { "score": 9, "comment": "评价说明" },
    "format": { "score": 9, "comment": "评价说明" },
    "continuity": { "score": 9, "comment": "评价说明" }
  },
  "total": 42,
  "grade": "优良",
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "issues": [
    { "level": "⛔", "description": "阻断性问题描述" },
    { "level": "⚠️", "description": "建议修改描述" },
    { "level": "ℹ️", "description": "微调建议描述" }
  ],
  "suggestions": ["修订建议1", "修订建议2"]
}
\`\`\`

### 维度说明
| 维度 | 评价标准 |
|------|----------|
| rhythm（节奏） | 场景切换节奏、信息密度、前30秒入戏、末尾钩子 |
| satisfaction（爽点） | 爽感要素密度、情绪高潮设计、观众满足感 |
| dialogue（台词） | 人物语言个性化、金句设计、画外音使用 |
| format（格式） | 镜头语言规范（△全景/中景/特写）、配乐提示♪、场景头标注、角色标注 |
| continuity（连贯性） | 与角色档案一致、与前后集衔接、伏笔回收 |

### 评级标准
| 总分 | 评级 |
|------|------|
| 45-50 | 卓越 |
| 38-44 | 优良 |
| 30-37 | 合格 |
| 25-29 | 需改进 |
| <25 | 需重写 |

**只输出 JSON，不要输出其他任何内容。**`;
}
