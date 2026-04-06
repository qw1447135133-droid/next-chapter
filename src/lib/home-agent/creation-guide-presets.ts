export type CreationGuideDimensionId = "theme" | "medium" | "conflict";

export interface CreationGuidePresetOption {
  id: string;
  label: string;
  value: string;
  description?: string;
}

export const CREATION_GUIDE_DIMENSION_META: Record<
  CreationGuideDimensionId,
  { title: string; description: string; submitHint: string }
> = {
  theme: {
    title: "选择题材与风格",
    description: "点选最贴近你直觉的方向，也支持在输入框里自定义补充。",
    submitHint: "已选择题材方向",
  },
  medium: {
    title: "选择作品形态",
    description: "确定载体与篇幅节奏，便于后续结构追问。",
    submitHint: "已选择作品形态",
  },
  conflict: {
    title: "选择或启发核心矛盾",
    description: "从高概念命题里选一个，或据此改写你自己的一句话设定。",
    submitHint: "已选择核心矛盾命题",
  },
};

/** Preset lists shown in the guide modal (expand over time). */
export const CREATION_GUIDE_PRESETS: Record<CreationGuideDimensionId, CreationGuidePresetOption[]> = {
  theme: [
    { id: "t1", label: "硬核科幻", value: "硬核科幻", description: "科学设定严密、技术细节突出" },
    { id: "t2", label: "太空歌剧", value: "太空歌剧", description: "宏大宇宙、文明与政治冲突" },
    { id: "t3", label: "赛博朋克", value: "赛博朋克", description: "高科技低生活、都市异化" },
    { id: "t4", label: "古风权谋", value: "古风权谋", description: "朝堂、门阀、谍战与人心" },
    { id: "t5", label: "仙侠修真", value: "仙侠修真", description: "修行体系、宗门与天道" },
    { id: "t6", label: "悬疑推理", value: "悬疑推理", description: "线索铺排、反转与动机" },
    { id: "t7", label: "刑侦罪案", value: "刑侦罪案", description: "程序正义与人性灰度" },
    { id: "t8", label: "恐怖惊悚", value: "恐怖惊悚", description: "未知威胁与心理压迫" },
    { id: "t9", label: "现代都市", value: "现代都市", description: "职场、情感、阶层与生存" },
    { id: "t10", label: "青春校园", value: "青春校园", description: "成长、友谊与身份认同" },
    { id: "t11", label: "家庭伦理", value: "家庭伦理", description: "代际、秘密与和解" },
    { id: "t12", label: "年代史诗", value: "年代史诗", description: "大时代里的小人物命运" },
    { id: "t13", label: "战争军事", value: "战争军事", description: "战略、兄弟连与人性试炼" },
    { id: "t14", label: "浪漫爱情", value: "浪漫爱情", description: "关系推进、误会与选择" },
    { id: "t15", label: "喜剧讽刺", value: "喜剧讽刺", description: "荒诞现实与黑色幽默" },
    { id: "t16", label: "文艺作者电影感", value: "文艺作者电影感", description: "情绪、留白与意象" },
    { id: "t17", label: "克苏鲁 / 宇宙恐怖", value: "克苏鲁宇宙恐怖", description: "不可知、理智边界" },
    { id: "t18", label: "西部 / 废土", value: "西部废土", description: "秩序崩坏后的道德与生存" },
    { id: "t19", label: "谍战特工", value: "谍战特工", description: "身份、忠诚与双面人生" },
    { id: "t20", label: "医疗职场", value: "医疗职场", description: "生死伦理与制度压力" },
    { id: "t21", label: "律政庭审", value: "律政庭审", description: "证据、舆论与正义定义" },
    { id: "t22", label: "体育竞技", value: "体育竞技", description: "成长弧与团队张力" },
    { id: "t23", label: "游戏电竞", value: "游戏电竞", description: "虚拟成就与现实代价" },
    { id: "t24", label: "奇幻史诗", value: "奇幻史诗", description: "种族、魔法与世界规则" },
  ],
  medium: [
    { id: "m1", label: "短剧（分集竖屏）", value: "短剧分集竖屏", description: "强钩子、快节奏反转" },
    { id: "m2", label: "网剧 / 季播剧", value: "网剧季播剧", description: "多集弧光与副线" },
    { id: "m3", label: "电影长片大纲", value: "电影长片大纲", description: "三幕结构与视听节拍" },
    { id: "m4", label: "动画番剧", value: "动画番剧", description: "分镜风格与世界观扩展" },
    { id: "m5", label: "纪录片脚本", value: "纪录片脚本", description: "真实素材与叙事视角" },
    { id: "m6", label: "短视频爆款脚本", value: "短视频爆款脚本", description: "前 3 秒钩子与完播结构" },
    { id: "m7", label: "广告 / 品牌片", value: "广告品牌片", description: "主张、情绪与记忆点" },
    { id: "m8", label: "舞台剧 / 话剧", value: "舞台剧话剧", description: "场次、对白张力" },
    { id: "m9", label: "广播剧 / 有声书", value: "广播剧有声书", description: "声音叙事与节奏" },
    { id: "m10", label: "互动影游 / 分支叙事", value: "互动影游分支叙事", description: "节点、结局与玩家选择" },
    { id: "m11", label: "小说长篇", value: "小说长篇", description: "章节体与伏笔网络" },
    { id: "m12", label: "中篇小说", value: "中篇小说", description: "单一强命题收束" },
    { id: "m13", label: "短篇集", value: "短篇集", description: "主题变奏与互文" },
    { id: "m14", label: "网文连载", value: "网文连载", description: "爽点、换地图与追读" },
    { id: "m15", label: "剧本杀 / 密室本", value: "剧本杀密室本", description: "角色本、线索与还原" },
    { id: "m16", label: "漫画分镜", value: "漫画分镜", description: "格距、对白与留白" },
    { id: "m17", label: "游戏剧情任务线", value: "游戏剧情任务线", description: "任务链与世界事件" },
    { id: "m18", label: "漫才 / sketch", value: "漫才sketch", description: "段子结构与节奏" },
    { id: "m19", label: "音乐 MV 故事", value: "音乐MV故事", description: "意象与歌词互文" },
    { id: "m20", label: "虚拟偶像 / 直播台本", value: "虚拟偶像直播台本", description: "人设、互动与即兴槽点" },
  ],
  conflict: [
    { id: "c1", label: "记忆可买卖之后", value: "如果记忆可以买卖", description: "身份、信任与后悔经济" },
    { id: "c2", label: "最后的 AI 程序员", value: "最后的AI程序员", description: "人与自动化的终极分工" },
    { id: "c3", label: "全民直播审判", value: "全民直播审判", description: "舆论法庭与程序正义" },
    { id: "c4", label: "时间税", value: "时间被征税", description: "寿命、阶级与黑市" },
    { id: "c5", label: "梦境联通", value: "梦境可以联通", description: "隐私、共谋与创伤" },
    { id: "c6", label: "情感租赁", value: "情感可以租赁", description: "亲密关系商品化" },
    { id: "c7", label: "唯一真相服务器", value: "世界只剩一个真相服务器", description: "历史、权力与篡改" },
    { id: "c8", label: "身份年审", value: "每年重置社会身份", description: "阶级流动与反抗" },
    { id: "c9", label: "声音即货币", value: "声音成为货币", description: "沉默、表达与压迫" },
    { id: "c10", label: "死后上传", value: "意识上传但有限额", description: "数字永生伦理" },
    { id: "c11", label: "城市折叠", value: "同一座城市折叠成两层时间", description: "相见不识的宿命" },
    { id: "c12", label: "基因彩票", value: "基因决定职业配额", description: "天赋神话与反抗" },
    { id: "c13", label: "最后一片自然", value: "地球只剩一片自然保护区", description: "资源、信仰与争夺" },
    { id: "c14", label: "镜像地球", value: "发现镜像地球但规则相反", description: "自我认知与入侵" },
    { id: "c15", label: "语言瘟疫", value: "某种语言会传染命运", description: "交流、隔离与谎言" },
    { id: "c16", label: "债务继承星球", value: "星际殖民本质是继承债务", description: "金融科幻" },
    { id: "c17", label: "爱情配额制", value: "爱情实行配额制", description: "制度与真心" },
    { id: "c18", label: "遗忘税", value: "遗忘需要缴税", description: "创伤与社会控制" },
    { id: "c19", label: "唯一幸存者直播", value: "灾难唯一幸存者被直播", description: "媒体、创伤与消费" },
    { id: "c20", label: "替身契约", value: "可合法雇佣人生替身", description: "身份、责任与替身觉醒" },
  ],
};

const GUIDE_LABEL_TO_DIMENSION: Record<string, CreationGuideDimensionId> = {
  从题材出发: "theme",
  从媒介出发: "medium",
  从核心冲突出发: "conflict",
  "【创作起点·题材】": "theme",
  "【创作起点·媒介】": "medium",
  "【创作起点·冲突】": "conflict",
};

/** Matches **…** chips for any known creation-guide entry phrase. */
const CREATION_GUIDE_CHIP_RE =
  /\*\*(从题材出发|从媒介出发|从核心冲突出发|【创作起点·题材】|【创作起点·媒介】|【创作起点·冲突】)\*\*/g;

function hasCreationGuideThreePaths(t: string): boolean {
  const classic =
    t.includes("从题材出发") && t.includes("从媒介出发") && t.includes("从核心冲突出发");
  const bracket =
    t.includes("【创作起点·题材】") &&
    t.includes("【创作起点·媒介】") &&
    t.includes("【创作起点·冲突】");
  return classic || bracket;
}

/** Whether the assistant text looks like the “创作起点” three-path guide. */
export function isCreationGuideAssistantMessage(content: string): boolean {
  const t = content.trim();
  if (t.length < 80) return false;
  if (!hasCreationGuideThreePaths(t)) return false;
  return (
    t.includes("选项") ||
    t.includes("第一步") ||
    t.includes("###") ||
    t.includes("|") ||
    t.includes("---")
  );
}

/** Split assistant content around **…** guide tokens for rich rendering. */
export function splitCreationGuideContent(content: string): Array<{ type: "text"; text: string } | { type: "chip"; label: string; dimension: CreationGuideDimensionId }> {
  const re = new RegExp(CREATION_GUIDE_CHIP_RE.source, "g");
  const out: Array<{ type: "text"; text: string } | { type: "chip"; label: string; dimension: CreationGuideDimensionId }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const label = m[1];
    const dim = GUIDE_LABEL_TO_DIMENSION[label];
    if (!dim) continue;
    if (m.index > last) {
      out.push({ type: "text", text: content.slice(last, m.index) });
    }
    out.push({ type: "chip", label, dimension: dim });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    out.push({ type: "text", text: content.slice(last) });
  }
  return out.length ? out : [{ type: "text", text: content }];
}
