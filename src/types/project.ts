// 项目类型定义（简化版，移除视频生成相关）

export type ArtStyle = 'live-action' | 'hyper-cg' | '3d-cartoon' | '2.5d-stylized' | 'anime-3d' | 'cel-animation' | 'retro-comic' | 'custom';

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  'live-action': '真人影视',
  'hyper-cg': '超写实 CG',
  '3d-cartoon': '3D欧美卡通',
  '2.5d-stylized': '2.5D绘本风',
  'anime-3d': '三渲二动漫',
  'cel-animation': '传统赛璐璐',
  'retro-comic': '美式复古漫画风',
  'custom': '自定义',
};