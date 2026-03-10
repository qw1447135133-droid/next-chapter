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

export const EPISODE_COUNTS = [
  { value: 40, label: "40集（紧凑）" },
  { value: 60, label: "60集（标准）" },
  { value: 80, label: "80集（长线）" },
  { value: 100, label: "100集（超长）" },
] as const;

export type DramaStep = "setup" | "creative-plan" | "characters" | "directory" | "episodes" | "export";

export const DRAMA_STEP_LABELS: Record<DramaStep, string> = {
  setup: "选题立项",
  "creative-plan": "创作方案",
  characters: "角色开发",
  directory: "分集目录",
  episodes: "分集撰写",
  export: "导出",
};

export const DRAMA_STEPS: DramaStep[] = [
  "setup",
  "creative-plan",
  "characters",
  "directory",
  "episodes",
  "export",
];

export interface DramaSetup {
  genres: string[]; // max 2
  audience: string;
  tone: string;
  ending: string;
  totalEpisodes: number;
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
  isKey: boolean;    // 🔥
  isClimax: boolean; // ⚡ 高潮卡点
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
  setup: DramaSetup | null;
  creativePlan: string;        // markdown content
  characters: string;          // markdown content
  directory: EpisodeEntry[];
  directoryRaw: string;        // raw markdown
  episodes: EpisodeScript[];
  currentStep: DramaStep;
  dramaTitle: string;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyDramaProject(): DramaProject {
  return {
    id: crypto.randomUUID(),
    setup: null,
    creativePlan: "",
    characters: "",
    directory: [],
    directoryRaw: "",
    episodes: [],
    currentStep: "setup",
    dramaTitle: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
