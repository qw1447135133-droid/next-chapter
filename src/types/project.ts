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

export type VideoModel = 'seedance-1.5-pro' | 'vidu-q3';

export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  'seedance-1.5-pro': 'Seedance 1.5 Pro',
  'vidu-q3': 'Vidu Q3',
};

export const VIDEO_MODEL_API_MAP: Record<VideoModel, string> = {
  'seedance-1.5-pro': 'doubao-seedance-1-5-pro_1080p',
  'vidu-q3': 'viduq3-pro',
};

export type WorkspaceStep = 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS: Record<WorkspaceStep, string> = {
  1: '剧本拆解',
  2: '角色与场景',
  3: '分镜图生成',
  4: '视频生成',
  5: '预览与导出',
};
