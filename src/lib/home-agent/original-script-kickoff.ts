import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import { AUDIENCES, ENDINGS, TARGET_MARKETS, TONES } from "@/types/drama";

export const ORIGINAL_SCRIPT_TEMPLATE_ID = "script";
const ORIGINAL_SCRIPT_REQUEST_PREFIX = "original-script-kickoff";

type OriginalScriptPersonaCategory =
  | "家庭与生活"
  | "财经与职场"
  | "健康与美容"
  | "兴趣与创作"
  | "教育与成长"
  | "情感与关系";

const ORIGINAL_SCRIPT_PERSONAS: Array<{
  value: string;
  label: string;
  desc: string;
  audience: string;
  category: OriginalScriptPersonaCategory;
}> = [
  { value: "宝妈", label: "宝妈", desc: "分享育儿经验、亲子日常与家庭生活", audience: "女频", category: "家庭与生活" },
  { value: "家庭主妇", label: "家庭主妇", desc: "家务技巧、居家整理与生活智慧", audience: "女频", category: "家庭与生活" },
  { value: "全职爸爸", label: "全职爸爸", desc: "男性视角的育儿日常与家庭故事", audience: "男频", category: "家庭与生活" },
  { value: "新婚夫妻", label: "新婚夫妻", desc: "婚后生活适应、两人世界与甜蜜日常", audience: "全龄", category: "家庭与生活" },
  { value: "单亲妈妈", label: "单亲妈妈", desc: "独立带娃、坚韧成长与生活重建", audience: "女频", category: "家庭与生活" },
  { value: "婆媳关系博主", label: "婆媳关系博主", desc: "婆媳矛盾、家庭边界与情感吐槽", audience: "女频", category: "家庭与生活" },
  { value: "养宠博主", label: "养宠博主", desc: "宠物日常、养护知识与萌宠故事", audience: "全龄", category: "家庭与生活" },
  { value: "农村生活博主", label: "农村生活博主", desc: "田园生活、农耕日常与乡土情怀", audience: "全龄", category: "家庭与生活" },
  { value: "理财专家", label: "理财专家", desc: "投资理财、资产配置与财富增长", audience: "男女通吃", category: "财经与职场" },
  { value: "副业达人", label: "副业达人", desc: "兼职赚钱、被动收入与时间管理", audience: "男女通吃", category: "财经与职场" },
  { value: "职场精英", label: "职场精英", desc: "职场晋升、人际关系与高效工作", audience: "男女通吃", category: "财经与职场" },
  { value: "创业者", label: "创业者", desc: "创业历程、商业思维与成功经验", audience: "男频", category: "财经与职场" },
  { value: "电商卖家", label: "电商卖家", desc: "网店运营、选品技巧与销售经验", audience: "男女通吃", category: "财经与职场" },
  { value: "自由职业者", label: "自由职业者", desc: "远程工作、时间自由与生活方式", audience: "男女通吃", category: "财经与职场" },
  { value: "省钱达人", label: "省钱达人", desc: "精打细算、薅羊毛技巧与消费观念", audience: "女频", category: "财经与职场" },
  { value: "健身博主", label: "健身博主", desc: "运动训练、体型管理与健康生活", audience: "男女通吃", category: "健康与美容" },
  { value: "美妆博主", label: "美妆博主", desc: "化妆技巧、产品测评与美容心得", audience: "女频", category: "健康与美容" },
  { value: "护肤专家", label: "护肤专家", desc: "肌肤护理、成分解析与抗老秘诀", audience: "女频", category: "健康与美容" },
  { value: "减肥博主", label: "减肥博主", desc: "减重历程、饮食控制与身材管理", audience: "女频", category: "健康与美容" },
  { value: "中医养生博主", label: "中医养生博主", desc: "传统养生、食疗调理与健康知识", audience: "全龄", category: "健康与美容" },
  { value: "营养师", label: "营养师", desc: "饮食搭配、营养知识与健康食谱", audience: "全龄", category: "健康与美容" },
  { value: "穿搭博主", label: "穿搭博主", desc: "时尚搭配、风格塑造与购物分享", audience: "女频", category: "健康与美容" },
  { value: "美食博主", label: "美食博主", desc: "烹饪教程、美食探店与饮食文化", audience: "全龄", category: "兴趣与创作" },
  { value: "旅行博主", label: "旅行博主", desc: "旅行攻略、目的地推荐与出行体验", audience: "全龄", category: "兴趣与创作" },
  { value: "美术博主", label: "美术博主", desc: "绘画创作、艺术分享与审美提升", audience: "全龄", category: "兴趣与创作" },
  { value: "摄影博主", label: "摄影博主", desc: "拍摄技巧、后期处理与视觉美学", audience: "全龄", category: "兴趣与创作" },
  { value: "读书博主", label: "读书博主", desc: "书单推荐、读书笔记与知识分享", audience: "全龄", category: "兴趣与创作" },
  { value: "手工博主", label: "手工博主", desc: "DIY教程、手工制作与创意生活", audience: "女频", category: "兴趣与创作" },
  { value: "游戏博主", label: "游戏博主", desc: "游戏攻略、测评分享与电竞文化", audience: "男频", category: "兴趣与创作" },
  { value: "音乐博主", label: "音乐博主", desc: "音乐分享、乐器教学与创作心得", audience: "全龄", category: "兴趣与创作" },
  { value: "育儿专家", label: "育儿专家", desc: "科学育儿、儿童发展与教育方法", audience: "全龄", category: "教育与成长" },
  { value: "学习博主", label: "学习博主", desc: "学习方法、考试技巧与自我提升", audience: "全龄", category: "教育与成长" },
  { value: "英语老师", label: "英语老师", desc: "英语学习、口语提升与语言技巧", audience: "全龄", category: "教育与成长" },
  { value: "心理咨询师", label: "心理咨询师", desc: "心理健康、情绪管理与自我成长", audience: "全龄", category: "教育与成长" },
  { value: "职业规划师", label: "职业规划师", desc: "职业发展、求职技巧与人生规划", audience: "全龄", category: "教育与成长" },
  { value: "正能量博主", label: "正能量博主", desc: "励志故事、人生感悟与积极心态", audience: "全龄", category: "教育与成长" },
  { value: "情感博主", label: "情感博主", desc: "恋爱技巧、两性关系与情感分析", audience: "女频", category: "情感与关系" },
  { value: "毒舌媳妇", label: "毒舌媳妇", desc: "婆家吐槽、婚姻现实与犀利反击", audience: "女频", category: "情感与关系" },
  { value: "传统阿姨", label: "传统阿姨", desc: "传统观念、社会评论与中年女性视角", audience: "全龄", category: "情感与关系" },
  { value: "单身贵族", label: "单身贵族", desc: "单身生活、自我享受与婚恋观念", audience: "全龄", category: "情感与关系" },
  { value: "离婚博主", label: "离婚博主", desc: "婚姻反思、重新出发与独立成长", audience: "女频", category: "情感与关系" },
  { value: "相亲达人", label: "相亲达人", desc: "相亲经历、择偶标准与婚恋市场", audience: "全龄", category: "情感与关系" },
];

const ORIGINAL_SCRIPT_WORD_COUNTS = [
  { value: "150~300字（极短）", label: "150~300字（极短）", description: "适合一句话强钩子和高浓度反转。" },
  { value: "300~500字（短篇）", label: "300~500字（短篇）", description: "适合单线矛盾、单场景高冲突推进。" },
  { value: "500~800字（中短篇）", label: "500~800字（中短篇）", description: "适合补足人物动机与一次完整反转。" },
  { value: "800~1000字（长短篇）", label: "800~1000字（长短篇）", description: "适合关系铺垫更完整的短剧正文。" },
  { value: "自定义", label: "自定义", description: "如果你有明确字数要求，可以直接输入。" },
] as const;

function buildPersonaRationale(persona: (typeof ORIGINAL_SCRIPT_PERSONAS)[number]): string {
  return `${persona.category} · ${persona.desc} · 常见受众：${persona.audience}`;
}

export function isOriginalScriptKickoffRequest(request: Pick<AskUserQuestionRequest, "id"> | null | undefined): boolean {
  return Boolean(request?.id?.startsWith(ORIGINAL_SCRIPT_REQUEST_PREFIX));
}

export function buildOriginalScriptKickoffIntro(): string {
  return "我们先按传统创作面板快速定一轮立项基线。接下来会依次确认目标市场、人设赛道、受众、基调、结局、篇幅和补充描述；如果预设不合适，直接在输入框里自定义就行。";
}

export function buildOriginalScriptKickoffRequest(): AskUserQuestionRequest {
  return {
    id: `${ORIGINAL_SCRIPT_REQUEST_PREFIX}:${crypto.randomUUID()}`,
    title: "原创剧本立项",
    description: "参考传统创作面板整理出的首轮问题。先定方向，再由 Agent 继续推进人设开发和创作。",
    allowCustomInput: true,
    submissionMode: "immediate",
    questions: [
      {
        header: "目标市场",
        question: "先确定你这次原创剧本主要想打哪个目标市场？",
        multiSelect: false,
        options: TARGET_MARKETS.map((market) => ({
          label: market.label,
          value: market.label,
          rationale: market.desc,
        })),
      },
      {
        header: "人设赛道",
        question: "参考传统创作面板，先选 1 到 2 个更接近你这次方向的人设赛道。",
        multiSelect: true,
        options: ORIGINAL_SCRIPT_PERSONAS.map((persona) => ({
          label: persona.label,
          value: persona.label,
          rationale: buildPersonaRationale(persona),
        })),
      },
      {
        header: "目标受众",
        question: "这次更希望主打哪类受众？",
        multiSelect: false,
        options: AUDIENCES.map((audience) => ({
          label: audience.label,
          value: audience.label,
        })),
      },
      {
        header: "故事基调",
        question: "先把故事基调定下来，方便 Agent 收口人物和节奏。",
        multiSelect: false,
        options: TONES.map((tone) => ({
          label: tone.label,
          value: tone.label,
        })),
      },
      {
        header: "结局类型",
        question: "你希望最终落在什么结局上？",
        multiSelect: false,
        options: ENDINGS.map((ending) => ({
          label: ending.label,
          value: ending.label,
        })),
      },
      {
        header: "篇幅字数",
        question: "先选一个更接近你的篇幅字数范围。",
        multiSelect: false,
        options: ORIGINAL_SCRIPT_WORD_COUNTS.map((count) => ({
          label: count.label,
          value: count.value,
          rationale: count.description,
        })),
      },
      {
        header: "补充描述",
        question: "最后还有没有一句话故事方向、主角设定或特殊要求要补充？",
        multiSelect: false,
        options: [
          {
            label: "暂不补充",
            value: "无",
            rationale: "先按上面的立项信息继续推进，后面也可以随时补充。",
          },
        ],
      },
    ],
  };
}

export function buildOriginalScriptKickoffPrompt(answer: string): string {
  const cleaned = answer.trim();
  return [
    "我要启动一个原创剧本项目。",
    "下面是我刚按传统创作面板确认的立项信息：",
    cleaned,
    "请先基于这些信息做简洁分析，然后继续推进到下一步的人设开发或创作方案。整个流程保持在首页会话里完成，不要把我推回手动页面。",
  ].join("\n\n");
}
