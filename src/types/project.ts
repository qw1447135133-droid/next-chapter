export interface Scene {
  id: string;
  sceneNumber: number;
  sceneName: string;
  description: string;
  characters: string[];
  dialogue: string;
  cameraDirection: string;
  segmentLabel?: string; // e.g. "1-1", "1-2"
  duration: number; // seconds
  storyboardUrl?: string;
  storyboardHistory?: string[]; // previously generated reference images
  panoramaUrl?: string; // panoramic positioning reference for scene group
  videoUrl?: string;
  videoTaskId?: string;
  videoStatus?: string; // queued | processing | completed | failed
  videoHistory?: VideoHistoryEntry[];
  recommendedDuration?: number;
  isManualDuration?: boolean; // true when user manually set duration
  characterCostumes?: Record<string, string>; // { characterName: costumeId }
}

export interface VideoHistoryEntry {
  videoUrl: string;
  createdAt: string;
}

export interface ImageHistoryEntry {
  imageUrl: string;
  description: string;
  createdAt: string;
}

export interface CostumeSetting {
  id: string;
  label: string;
  description: string;
  imageUrl?: string;
  isAIGenerated: boolean;
  imageHistory?: ImageHistoryEntry[];
}

export interface CharacterSetting {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  threeViewUrls?: {
    front?: string;
    side?: string;
    back?: string;
    closeUp?: string;
  };
  isAIGenerated: boolean;
  isGenerating?: boolean;
  source: 'auto' | 'manual'; // auto = detected from script
  imageHistory?: ImageHistoryEntry[];
  costumes?: CostumeSetting[];
  activeCostumeId?: string;
}

export interface TimeVariantSetting {
  id: string;
  label: string;       // e.g. "黄昏", "夜间", "清晨"
  description: string;
  imageUrl?: string;
  isAIGenerated: boolean;
  imageHistory?: ImageHistoryEntry[];
}

export interface SceneSetting {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  isAIGenerated: boolean;
  isGenerating?: boolean;
  source: 'auto' | 'manual';
  imageHistory?: ImageHistoryEntry[];
  timeVariants?: TimeVariantSetting[];
  activeTimeVariantId?: string;
}

export interface Project {
  id: string;
  title: string;
  script: string;
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
  currentStep: number;
  createdAt: string;
  updatedAt: string;
}

export type ArtStyle = 'live-action' | 'hyper-cg' | '3d-cartoon' | '2.5d-stylized' | 'anime-3d' | 'cel-animation' | 'retro-comic';

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  'live-action': '真人影视',
  'hyper-cg': '超写实 CG',
  '3d-cartoon': '3D欧美卡通',
  '2.5d-stylized': '2.5D绘本风',
  'anime-3d': '三渲二动漫',
  'cel-animation': '传统赛璐璐',
  'retro-comic': '美式复古漫画风',
};

export type VideoModel = 'seedance-1.5-pro' | 'vidu-q3' | 'kling-v3';

export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  'seedance-1.5-pro': 'Seedance 1.5 Pro',
  'vidu-q3': 'Vidu Q3',
  'kling-v3': '可灵 V3',
};

export const VIDEO_MODEL_API_MAP: Record<VideoModel, string> = {
  'seedance-1.5-pro': 'doubao-seedance-1-5-pro_1080p',
  'vidu-q3': 'viduq3-pro',
  'kling-v3': 'kling-v3',
};

export type EpisodeDuration = '60' | '90' | '120' | 'custom';

export const EPISODE_DURATION_OPTIONS: { value: EpisodeDuration; label: string }[] = [
  { value: '60', label: '60s' },
  { value: '90', label: '90s' },
  { value: '120', label: '120s' },
  { value: 'custom', label: '自定义' },
];

export function getSegmentsForDuration(duration: EpisodeDuration, customSeconds?: number): number | null {
  if (duration === 'custom') {
    return customSeconds ? Math.floor(customSeconds / 15) + 1 : null;
  }
  return Math.floor(Number(duration) / 15) + 1;
}

export type VideoPace = 'slow' | 'medium' | 'fast';

export const VIDEO_PACE_OPTIONS: { value: VideoPace; label: string; desc: string }[] = [
  { value: 'slow', label: '慢速', desc: '1句≤22字 2句≤18字 3句≤14字' },
  { value: 'medium', label: '中等', desc: '1句≤27字 2句≤22字 3句≤17字' },
  { value: 'fast', label: '快速', desc: '1句≤32字 2句≤26字 3句≤20字' },
];

export type WorkspaceStep = 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS: Record<WorkspaceStep, string> = {
  1: '剧本拆解',
  2: '角色与场景',
  3: '分镜图生成',
  4: '视频生成',
  5: '预览与导出',
};
