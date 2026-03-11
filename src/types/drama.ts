// 短剧创作项目类型定义

export const GENRES = [
  { value: "都市情感", label: "都市情感", desc: "都市男女的爱恨纠葛与情感博弈", audience: "女频" },
  { value: "霸道总裁", label: "霸道总裁", desc: "冷面总裁遇上不按常理出牌的她", audience: "女频" },
  { value: "甜宠", label: "甜宠", desc: "从头甜到尾的高糖恋爱故事", audience: "女频" },
  { value: "重生穿越", label: "重生穿越", desc: "带着前世记忆或未来知识改写命运", audience: "男女通吃" },
  { value: "战神归来", label: "战神归来", desc: "隐藏身份的绝世强者重返都市", audience: "男频" },
  { value: "家庭伦理", label: "家庭伦理", desc: "家庭矛盾与亲情的碰撞和解", audience: "全龄" },
  { value: "悬疑推理", label: "悬疑推理", desc: "层层剥丝的烧脑悬疑故事", audience: "男女通吃" },
  { value: "古装宫廷", label: "古装宫廷", desc: "深宫权谋与爱恨纠缠", audience: "女频" },
  { value: "玄幻修仙", label: "玄幻修仙", desc: "修炼升级的东方奇幻世界", audience: "男频" },
  { value: "末日求生", label: "末日求生", desc: "末世背景下的生存与人性考验", audience: "男频" },
  { value: "校园青春", label: "校园青春", desc: "青涩校园里的成长与恋爱", audience: "女频" },
  { value: "职场逆袭", label: "职场逆袭", desc: "职场小白一路进阶的升级之路", audience: "男女通吃" },
  { value: "古装言情", label: "古装言情", desc: "古代背景的浪漫爱情故事", audience: "女频" },
] as const;

export const AUDIENCES = [
  { value: "女频", label: "女频" },
  { value: "男频", label: "男频" },
  { value: "全龄", label: "全龄" },
] as const;

export const TONES = [
  { value: "甜", label: "甜" },
  { value: "虐", label: "虐" },
  { value: "甜虐", label: "甜虐" },
  { value: "爽", label: "爽" },
  { value: "燃", label: "燃" },
  { value: "搞笑", label: "搞笑" },
] as const;

export const ENDINGS = [
  { value: "HE", label: "HE（好结局）" },
  { value: "BE", label: "BE（坏结局）" },
  { value: "OE", label: "OE（开放结局）" },
] as const;

export const TARGET_MARKETS = [
  {
    value: "cn",
    label: "国内（中文）",
    desc: "中文创作，符合国内短剧平台的节奏与审美",
  },
  {
    value: "jp",
    label: "日本（日文）",
    desc: "日文创作，物哀·幽玄·寂的审美，内向细腻的情感描绘",
  },
  {
    value: "west",
    label: "欧美（英文）",
    desc: "英文创作，好莱坞高概念风格，强悬疑爽感与直接的情节推动",
  },
  {
    value: "kr",
    label: "韩国（韩文）",
    desc: "韩文创作，韩剧式情感节奏，细腻人物关系与命运反转",
  },
  {
    value: "sea",
    label: "东南亚（英文）",
    desc: "英文创作，融合家庭伦理与社会阶层冲突，浓烈情感表达",
  },
] as const;

export const EPISODE_COUNTS = [
  { value: 40, label: "40集（紧凑）" },
  { value: 60, label: "60集（标准）" },
  { value: 80, label: "80集（长线）" },
  { value: 100, label: "100集（超长）" },
  { value: -1, label: "自定义" },
] as const;

export type DramaMode = "traditional" | "adaptation";

export type DramaStep =
  | "setup" | "creative-plan" | "characters"
  | "reference-script" | "structure-transform" | "character-transform"
  | "directory" | "episodes" | "compliance" | "export";

export const DRAMA_STEP_LABELS: Record<DramaStep, string> = {
  setup: "选题立项",
  "creative-plan": "创作方案",
  characters: "角色开发",
  "reference-script": "参考剧本",
  "structure-transform": "结构转换",
  "character-transform": "角色转换",
  directory: "分集目录",
  episodes: "分集撰写",
  compliance: "合规审核",
  export: "导出",
};

export const DRAMA_STEPS: DramaStep[] = [
  "setup",
  "creative-plan",
  "characters",
  "directory",
  "episodes",
  "compliance",
  "export",
];

export const ADAPTATION_STEPS: DramaStep[] = [
  "reference-script",
  "structure-transform",
  "character-transform",
  "directory",
  "episodes",
  "compliance",
  "export",
];

export const FRAMEWORK_STYLES = [
  { value: "东方玄幻", label: "东方玄幻", desc: "仙侠修真、灵气法术、飞升渡劫" },
  { value: "古装宫廷", label: "古装宫廷", desc: "深宫权谋、后妃争斗、皇权博弈" },
  { value: "西方奇幻", label: "西方奇幻", desc: "魔法世界、骑士冒险、龙与精灵" },
  { value: "现代都市", label: "现代都市", desc: "都市职场、商战情感、现代生活" },
  { value: "末日废土", label: "末日废土", desc: "末世求生、废土冒险、人性考验" },
  { value: "科幻未来", label: "科幻未来", desc: "星际探索、AI时代、赛博朋克" },
  { value: "民国谍战", label: "民国谍战", desc: "乱世风云、谍影重重、家国情怀" },
  { value: "校园青春", label: "校园青春", desc: "校园恋爱、青春成长、友情热血" },
] as const;

export interface DramaSetup {
  genres: string[]; // max 2
  audience: string;
  tone: string;
  ending: string;
  totalEpisodes: number;
  targetMarket: string; // "cn" | "jp" | "west" | "kr" | "sea"
  customTopic?: string; // user's additional description
}

export interface DramaCharacter {
  name: string;
  age: string;
  identity: string;
  personality: string[];
  motivation: string;
  arc: string;
  catchphrase: string;
  villainLevel?: number; // 1-4 for villain hierarchy
}

export interface EpisodeEntry {
  number: number;
  title: string;
  summary: string;
  hookType: string;
  isKey: boolean;      // 🔥
  isClimax: boolean;   // ⚡ 高潮卡点
  isPaywall: boolean;  // 💰 付费卡点
  emotionLevel?: number; // 1-5 情绪强度
}

export interface EpisodeVersion {
  content: string;
  wordCount: number;
  timestamp: string;
  label?: string; // e.g. "场次二重写" or "整集重写"
}

export interface EpisodeScript {
  number: number;
  title: string;
  content: string;
  wordCount: number;
  history?: EpisodeVersion[]; // previous versions
}

export interface DramaProject {
  id: string;
  mode: DramaMode;
  setup: DramaSetup | null;
  creativePlan: string;
  characters: string;
  directory: EpisodeEntry[];
  directoryRaw: string;
  episodes: EpisodeScript[];
  complianceReport: string;
  currentStep: DramaStep;
  dramaTitle: string;
  createdAt: string;
  updatedAt: string;
  // Adaptation mode fields
  referenceScript?: string;
  referenceStructure?: string; // Extracted structure from reference script
  frameworkStyle?: string;
  structureTransform?: string;
  characterTransform?: string;
}

export function createEmptyDramaProject(mode: DramaMode = "traditional"): DramaProject {
  return {
    id: crypto.randomUUID(),
    mode,
    setup: null,
    creativePlan: "",
    characters: "",
    directory: [],
    directoryRaw: "",
    episodes: [],
    complianceReport: "",
    currentStep: mode === "traditional" ? "setup" : "reference-script",
    dramaTitle: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    referenceScript: "",
    frameworkStyle: "",
    structureTransform: "",
    characterTransform: "",
  };
}
