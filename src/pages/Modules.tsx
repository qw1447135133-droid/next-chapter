import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Film,
  PenTool,
  ArrowLeft,
  Settings,
  Sparkles,
  Play,
  Layers,
  FileText,
  BookOpen,
  Repeat2,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";

const modules = [
  {
    id: "script",
    icon: PenTool,
    title: "剧本创作",
    desc: "AI 辅助搭建大纲与成稿，支持传统写作与参考剧本改编",
    features: [
      { icon: Sparkles, text: "AI 智能生成" },
      { icon: FileText, text: "多种体裁支持" },
    ],
    route: "/script-creator",
    gradient: "from-amber-500/[0.12] to-orange-500/[0.08] dark:from-amber-500/[0.08] dark:to-orange-600/[0.06]",
    iconBg: "bg-amber-500/[0.12] dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "video",
    icon: Film,
    title: "视频创作",
    desc: "导入剧本后拆解分镜、生成画面并合成成片，一站完成视频产出",
    features: [
      { icon: Layers, text: "分镜图生成" },
      { icon: Play, text: "AI 视频合成" },
    ],
    route: "/workspace",
    gradient: "from-indigo-500/[0.12] to-cyan-500/[0.08] dark:from-indigo-500/[0.08] dark:to-cyan-600/[0.06]",
    iconBg: "bg-indigo-500/[0.12] dark:bg-indigo-500/15",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
] as const;

/** 父级只做编排，不动画 opacity，避免与子卡 y/opacity 叠加；stagger 为 0 保证两卡同帧启动 */
const moduleCardContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0,
      delayChildren: 0,
    },
  },
};

const moduleCardItem = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

function FeaturePills({ features }: { features: { icon: LucideIcon; text: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {features.map(({ icon: Icon, text }) => (
        <span
          key={text}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm"
        >
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
          {text}
        </span>
      ))}
    </div>
  );
}

const Modules = () => {
  const navigate = useNavigate();
  const scriptModule = modules[0];
  const videoModule = modules[1];

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="flex items-center justify-between px-5 md:px-6 py-3.5 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-1" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center">
            <BrandMark className="h-10 w-auto" />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          设置
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center px-5 md:px-6 py-10 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-9 md:mb-11 max-w-lg"
        >
          <h1 className="text-2xl md:text-3xl font-bold font-[Space_Grotesk] tracking-tight text-foreground">
            选择创作模块
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            选择你要使用的工具，开始创作之旅
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6 max-w-4xl w-full"
          variants={moduleCardContainer}
          initial="hidden"
          animate="show"
        >
          {/* 剧本创作 */}
          <motion.div
            variants={moduleCardItem}
            className={`relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b ${scriptModule.gradient} bg-background/40 shadow-sm`}
          >
            <button
              type="button"
              onClick={() => navigate("/compliance-review")}
              title="合规审核"
              aria-label="合规审核"
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-rose-200/80 bg-background/90 text-rose-600 shadow-sm ring-1 ring-black/[0.03] transition hover:bg-rose-50 hover:shadow active:scale-95 dark:border-rose-500/35 dark:bg-background/80 dark:text-rose-400 dark:hover:bg-rose-950/50"
            >
              <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>

            <div className="p-6 md:p-7">
              <div className="flex gap-4 pr-12">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${scriptModule.iconBg}`}
                >
                  <PenTool className={`h-6 w-6 ${scriptModule.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <h2 className="text-lg md:text-xl font-bold font-[Space_Grotesk] text-foreground leading-snug">
                    {scriptModule.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{scriptModule.desc}</p>
                  <FeaturePills features={scriptModule.features} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/script-creator?mode=traditional")}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3.5 text-left shadow-sm ring-1 ring-black/[0.02] transition hover:border-emerald-300/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">传统创作</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">从零开始创作</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/script-creator?mode=adaptation")}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3.5 text-left shadow-sm ring-1 ring-black/[0.02] transition hover:border-violet-300/50 hover:bg-violet-50/50 dark:hover:bg-violet-950/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-400">
                    <Repeat2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">同款创作</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">基于参考剧本</span>
                  </span>
                </button>
              </div>
            </div>
          </motion.div>

          {/* 视频创作：外层与左侧同为 motion.div，保证入场动画一致；整卡可点 */}
          <motion.div
            variants={moduleCardItem}
            role="button"
            tabIndex={0}
            whileTap={{ scale: 0.995 }}
            onClick={() => navigate(videoModule.route)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(videoModule.route);
              }
            }}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b ${videoModule.gradient} bg-background/40 p-6 md:p-7 text-left shadow-sm ring-1 ring-black/[0.02] cursor-pointer duration-200 ease-out transition-[box-shadow,border-color] hover:border-indigo-300/40 hover:shadow-md dark:hover:border-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
          >
            <div className="flex gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${videoModule.iconBg}`}
              >
                <Film className={`h-6 w-6 ${videoModule.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <h2 className="text-lg md:text-xl font-bold font-[Space_Grotesk] text-foreground leading-snug">
                  {videoModule.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{videoModule.desc}</p>
                <FeaturePills features={videoModule.features} />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl border border-dashed border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground transition group-hover:border-indigo-200/60 group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-950/20">
              <span className="font-medium text-foreground/90">进入视频工作区</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/50 transition group-hover:translate-x-0.5 group-hover:bg-foreground/10">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default Modules;
