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
    return `## 🌏 Target Market: Western (US/EU) — Overseas AI Short Drama Production Spec

- **Writing Language: English** — All output must be written in English.

### Topic Selection (IP-driven, blockbuster-oriented)
Preferred genres for the Western market:
1. **Fantasy/Supernatural** — Zombies, witches, werewolves, vampires, gender-swap, beastkin, merfolk, mythological figures (visual spectacle priority)
2. **Alpha-male archetypes** — Mafia boss, professor, CEO, athlete, firefighter (masculine hormone appeal)
3. **Classic adaptations** — Grimm fairy tales, mythology, Western film/TV IP reboots
4. **Period settings** — Western royal court, hit long-drama adaptations
5. **Sci-fi / Post-apocalyptic** — Sci-fi, dystopian, interstellar (strong visual impact)

### Micro-Innovation Design
- Build on a proven core hook, then apply **character-concept inversion** or **setting transplant**.
- Transplant plot beats from hit series into the current drama with local adaptation.

### Story Outline & Episode Structure Rules
- Novel adaptations → target **60 episodes**; original concepts → target **50 episodes** (unless user specifies otherwise).
- The outline MUST distribute content across the classic **4-act structure** (起承转合) with proper pacing — alternate tension and relief, never rush the entire arc flat.
- Each episode outline must satisfy the macro rhythm while distributing plot beats evenly.

### Localization Iron Rules (MANDATORY)
- ⛔ **NO non-American place names** — replace with fictional city names.
- ⛔ **NO non-American character profiles** — names, backgrounds, appearances, and body types must feel authentically Western/American.
- ⛔ **NO non-American cultural elements** — no Eastern fortune-telling, Eastern traditions, Eastern philosophical framing.
- ⛔ **NO real person names, real place names, real brand names, or real product names** — use fictional or lightly altered versions.
- All character bios MUST include **bilingual names** (Chinese + English).

### Character Requirements
- **Character bio**: background story, full name, age, role positioning (lead / supporting / antagonist), personality, backstory.
- **Character portrait** (if visual capability exists): physical appearance, attire, distinctive features.

### Per-Episode Checklist (Quality Gate)
| Check Item | Requirement | Diagnostic | Script Annotation |
|---|---|---|---|
| **3-Second Hook** | Every episode must have a visual or audio explosive moment (can be anywhere in the episode) | Does the audience stop scrolling immediately? | 🔵 Mark BLUE |
| **Completion Bait** | Ending MUST have a strong cliffhanger / suspense | Will the user enter the next episode? | 🔴 Mark RED |
| **Interaction Rate** | Dialogue / visuals must contain debate-triggering moments (controversial dialogue, actions) | Can it trigger comments, shares, likes? | 🟢 Mark GREEN |
| **Scene Actions** | Each episode ≥ 2 scenes | Are scene-action descriptions rich enough? | — |
| **Dialogue Limits** | Total dialogue per episode ≤ 40s reading time; single line ≤ 12s | One shot = dialogue + action within 10-15s? | — |
| **Conflict** | Every episode MUST have at least one climax / reversal | Is the plot tension sustained? | — |
| **Emotional Expression** | Dialogue must be direct, simple; NO euphemisms or subtext | Is the dialogue punchy? | — |
| **Word Count** | Each episode ≥ 800 words, covering ≥ 2 scenes | — | — |
| **Episode Duration** | Target 60 seconds per episode | If final cut deviates >60s significantly, add/trim content | — |

### Title & Naming
- Each drama must provide **at least 2 English title candidates** upon outline submission.
- Drama titles should be concise and memorable.

### Style & Narrative
- Hollywood high-concept format. Think YA blockbusters — punchy hooks, visceral stakes, propulsive pacing.
- External conflict drives internal change. Favor direct plot propulsion, satisfying twists, and "page-turner" cliffhangers.
- Lean into spectacle and wish-fulfillment.`;
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
第{N}集：{集标题} —— {核心冲突或爽点一句话描述} [钩子类型] [情绪:X] {标记}

标记说明：
- 🔥 关键剧情集（重大转折、揭秘），占比 25-35%
- ⚡ 高潮卡点集（情绪最高峰、终极对决、命运转折等全剧最震撼的高潮时刻），占比 10-15%
- 💰 付费卡点集（付费墙位置，悬念最强、观众最不愿意离开的时刻），占比 10-15%
- 一集可以同时标多个标记（如 🔥⚡💰）
- 无标记 = 常规推进集
- [情绪:X]：标注该集的情绪强度（1-5），1=平稳铺垫，2=小波澜，3=中等紧张，4=高潮激烈，5=极致爆发

要求：
- 必须覆盖全部 ${setup.totalEpisodes} 集
- 前 10 集必须包含至少 3 个 🔥
- 💰 付费卡点建议分布在以下位置：
  · 第8-12集（首个付费卡点，最强悬念）
  · 第18-25集（身份揭露/反转）
  · 第35-45集（感情线高潮）
  · 倒数3-5集（终极对决前）
- ⚡ 高潮卡点集中在全剧 10-15%，锁定在叙事高峰期
- 目录必须体现三幕结构的节奏变化
- 每集标注钩子类型（悬念钩/反转钩/情绪钩/信息钩/危机钩）
- 每集标注情绪强度[情绪:1-5]
- 按段落分组显示（起势段/攀升段/风暴段/决战段）

**严格格式要求**：每一行必须严格按照以下格式输出，不要偏离：
第{N}集：{集标题} —— {描述} [{钩子类型}钩] [情绪:{1-5}] {标记}
例如：第1集：命运序章 —— 女主初入公司遭受冷遇 [悬念钩] [情绪:2] 🔥
不要使用其他分隔符（如"-"或"："代替"——"），不要省略集数编号"第N集："的格式。

末尾附统计信息：🔥数量、⚡数量、💰数量、各钩子类型占比。`;
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
    return `## Script Format (Western Market — Overseas AI Short Drama Spec)

\`\`\`
# Episode ${episodeNumber}: {Episode Title}

> Keywords: {3 keywords}
> Hook Type: {satisfaction/thrill type}
> Previously: {Last episode's cliffhanger, 1-2 sentences}

---

## SCENE 1

**INT./EXT. {LOCATION} — DAY/NIGHT**
**CHARACTERS: {character list}**

🔵 △ (WIDE) {3-SECOND HOOK — visual/audio explosive moment to stop scrolling}
△ (MEDIUM) {Character action — body language, tension}

**{CHARACTER NAME}** ({tone/action direction}): "{Dialogue}"

🟢 **{CHARACTER NAME}** ({provocative tone}): "{Debate-triggering line — designed for comments/shares}"

△ (CLOSE-UP) {Key detail — plot-critical visual}

♪ Score: {Music/sound design cue}

---

🔴 > 🎣 Cliffhanger: {COMPLETION BAIT — strong suspense to force next episode entry}
> 📺 Next Episode: {teaser}
\`\`\`

## Quality Standards (Per-Episode Checklist)
- **Minimum 2 scenes** per episode, recommended 3-5
- **Minimum 800 words** per episode
- **Target duration: 60 seconds** per episode
- **Dialogue limits**: total dialogue ≤ 40s reading time; single line ≤ 12s
- Camera directions: WIDE, MEDIUM, CLOSE-UP, EXTREME CLOSE-UP (use at least 3)
- Dialogue must include tone/action parentheticals
- **Dialogue must be DIRECT and SIMPLE** — no euphemisms, no subtext, no subtle hints. Punchy and emotionally charged.
- **Every episode MUST contain at least one conflict or climax moment**
- 🔵 **3-Second Hook**: Mark the visual/audio hook moment in BLUE annotation
- 🔴 **Completion Bait**: End with strong cliffhanger, mark in RED annotation
- 🟢 **Interaction Trigger**: Include at least one debate-worthy line/moment, mark in GREEN annotation
- End with a strong ${hookType || "cliffhanger"} hook
- High-concept pacing: open with a bang, escalate fast, end on a twist
- ⛔ NO real names, real places, real brands — all must be fictional`;
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

请输出整合后的完整剧本文档，格式规范，包含以下结构：

1. **封面信息**（剧名、题材、集数、受众、基调）
2. **角色表**（从角色档案中提取，列表形式：角色名 | 身份 | 性格关键词 | 功能定位）
3. **场景清单**（从各集剧本中提取所有出现过的场景/地点，去重后列出）
4. **配乐提示表**（从各集剧本中提取所有 ♪ 音乐提示，标注对应集数和场次）
5. **分集剧本**（完整保留各集内容，统一格式）`;
}

/** 合规审核 Prompt */
export function buildCompliancePrompt(
  setup: DramaSetup,
  creativePlan: string,
  characters: string,
  episodes: { number: number; title: string; content: string }[],
): string {
  const market = setup.targetMarket || "cn";
  const episodesSample = episodes
    .sort((a, b) => a.number - b.number)
    .map((ep) => `### 第${ep.number}集：${ep.title}\n${ep.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  return `你是一位资深的短剧内容合规审核专家，精通各类内容监管法规与平台规范。

${getMarketDirective(setup)}

## 项目信息
- 题材：${setup.genres.join(" + ")}
- 受众：${setup.audience}
- 基调：${setup.tone}
- 总集数：${setup.totalEpisodes}
- 已完成：${episodes.length}集

## 创作方案摘要
${creativePlan.slice(0, 1000)}

## 角色档案摘要
${characters.slice(0, 1000)}

## 剧本内容
${episodesSample}

---

## 审核要求

请对上述内容进行全面合规审查，按以下四个维度检查并输出报告：

### 一、红线检测
检查以下内容是否存在：
- 政治敏感内容（损害国家形象、歪曲历史、分裂国家等）
- 违法犯罪美化（美化暴力、教唆犯罪、展示犯罪细节等）
- 色情低俗内容（裸露描写、性暗示、低俗对话等）
- 歧视侮辱内容（性别歧视、种族歧视、地域歧视等）

### 二、高风险内容
检查以下内容是否存在：
- 未成年人相关风险（恋爱、暴力、不良诱导等）
- 宗教民族敏感（不当引用、刻板印象等）
- 历史事件引用（是否符合史实、是否有不当戏说等）
- 医疗法律相关（虚假医疗信息、错误法律知识等）

### 三、正能量校验
评估以下方面：
- 整体价值观导向是否积极健康
- 是否存在消极示范（拜金、暴力解决问题等）
- 社会影响评估
- 是否有正面引导意义

### 四、广告植入审查
检查以下方面：
- 是否存在软广/硬广内容
- 品牌露出方式是否合规
- 是否存在虚假宣传暗示

${market === "cn" ? `
### 特别注意（国内市场）
- 广电总局《微短剧管理办法》相关要求
- 平台审核标准（抖音/快手/微信视频号等）
- 备案所需的内容安全合规要求
` : ""}
${market === "west" ? `
### 特别注意（欧美市场 — 海外AI短剧规范）
- **地名检查**：剧本中不得出现任何非美国真实地名，必须替换为虚构城市
- **人设检查**：角色姓名、成长背景、外貌描写必须符合美国文化语境，不得出现东方特征
- **文化元素检查**：不得出现东方算卦、东方传统习俗、东方思维方式等文化元素
- **品牌/真名检查**：不得出现真实人名、地名、品牌名、商品名
- **台词风格检查**：台词必须直接、简单，禁止委婉或潜台词，确保情绪表达直白有力
- **对白时长检查**：单句对白不超过12秒阅读时长，每集总对白不超过40秒
- **角色双语命名**：所有角色简介必须标注中英文双语人名
- **集时长检查**：目标每集60秒，若成片与60秒差距过大需调整内容量
- **3秒钩子检查**：每集是否有视觉或听觉爆点（标蓝）
- **完播诱导检查**：结尾是否有强悬念引导进入下集（标红）
- **互动率检查**：是否有引发讨论/争议的台词或画面（标绿）
` : ""}

## 输出格式

使用以下标记标注问题严重程度：
- ⛔ 红线问题（必须修改，否则无法过审）
- ⚠️ 高风险内容（建议修改，存在被退回风险）
- ℹ️ 优化建议（可选修改，提升合规安全性）

输出结构：
1. **合规总评**：一段话总结合规状态
2. **红线检测结果**：逐项检查结果
3. **高风险内容排查**：逐项检查结果
4. **正能量校验**：评估结论
5. **广告植入审查**：检查结论
6. **问题清单汇总**：按严重程度排序的完整问题列表
7. **修改建议**：针对每个问题的具体修改方案

用 Markdown 格式输出，清晰分区。`;
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

/** 结构转换 Prompt（同款创作模式） */
export function buildStructureTransformPrompt(
  setup: DramaSetup,
  referenceScript: string,
  frameworkStyle: string,
): string {
  return `你是一位专业的微短剧改编编剧，擅长将不同风格的故事进行框架转换。

${getMarketDirective(setup)}

## 你的任务
将以下参考剧本的叙事结构转换为「${frameworkStyle}」风格的创作方案。

## 转换原则
1. **保留核心情节骨架**：主要矛盾冲突、人物关系拓扑、关键转折点必须保留
2. **风格全面置换**：世界观、时代背景、社会体系、权力结构、文化元素全部替换为「${frameworkStyle}」设定
3. **等价替换法则**：
   - 原文中的社会阶层 → ${frameworkStyle}对应的等级体系
   - 原文中的权力机制 → ${frameworkStyle}对应的权力形式
   - 原文中的情感表达 → ${frameworkStyle}对应的情感方式
4. **强化风格特色**：加入${frameworkStyle}风格特有的元素、术语、场景设定

## 参考剧本结构
${referenceScript}

## 输出要求
请生成完整的创作方案，包含以下板块：

1. **剧名备选**（3个），每个附一句话说明
2. **时空背景**：转换后的时代、地点、社会环境、体系设定
3. **一句话故事线** + **核心冲突**
4. **情节对照表**：原文核心情节 → 转换后对应情节（逐条对照）
5. **三幕结构拆解**：
   - 第一幕（建置）：集数范围、核心事件
   - 第二幕（对抗）：集数范围、冲突升级
   - 第三幕（高潮/结局）：集数范围、终极对决
6. **${frameworkStyle}特色元素清单**：本风格必须包含的标志性场景/设定/术语
7. **付费卡点规划**：具体集数 + 卡点类型
8. **结局设计**

总集数：${setup.totalEpisodes}集
用 Markdown 格式输出，清晰分区。`;
}

/** 角色转换 Prompt（同款创作模式） */
export function buildCharacterTransformPrompt(
  setup: DramaSetup,
  referenceScript: string,
  frameworkStyle: string,
  structureTransform: string,
): string {
  return `你是一位专业的微短剧改编编剧。

${getMarketDirective(setup)}

## 你的任务
基于已完成的结构转换方案，将原文中的角色体系转换为「${frameworkStyle}」风格。

## 转换原则
1. **角色关系拓扑不变**：主角、对手、盟友、隐藏反派的关系结构保持一致
2. **身份风格置换**：
   - 角色姓名 → 符合${frameworkStyle}风格的名字
   - 职业/身份 → ${frameworkStyle}对应的身份设定
   - 能力/特长 → ${frameworkStyle}体系下的对应能力
3. **性格内核保留**：角色的核心动机、性格特征、人物弧光保持一致
4. **风格化表达**：口头禅、语言特征适配${frameworkStyle}风格

## 原文剧本
${referenceScript}

## 已完成的结构转换方案
${structureTransform}

## 输出要求
生成完整角色体系，包含：

1. **角色对照表**：原文角色 → 转换角色（逐一对照）
2. **主要角色档案**（每个角色包含）：
   - 姓名、年龄、外貌特征（2-3句）
   - 性格关键词（3-5个）
   - 公开身份 vs 真实身份
   - 核心动机
   - 爽点功能
   - 口头禅或语言特征
   - 人物弧光
3. **角色关系图**（使用 Mermaid graph TD 格式输出）

请在 \`\`\`mermaid 和 \`\`\` 之间输出关系图代码。

4. **感情线弧线**：关系发展的关键节点（标注集数）
5. **四层反派体系**

用 Markdown 格式输出。`;
}
