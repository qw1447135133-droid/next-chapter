import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, PenTool, ArrowLeft, Settings, Sparkles, Play, Layers, FileText, BookOpen, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const modules = [
  {
    id: "script",
    icon: PenTool,
    title: "剧本创作",
    desc: "AI 辅助创作完整剧本，从主题大纲到成稿",
    features: [
      { icon: Sparkles, text: "AI 智能生成" },
      { icon: FileText, text: "多种体裁支持" },
    ],
    route: "/script-creator",
    gradient: "from-amber-500/15 to-orange-500/15 dark:from-amber-500/10 dark:to-orange-600/10",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    borderHover: "hover:border-amber-400/50 dark:hover:border-amber-500/40",
  },
  {
    id: "video",
    icon: Film,
    title: "视频创作",
    desc: "从剧本拆解分镜、生成画面到合成视频",
    features: [
      { icon: Layers, text: "分镜图生成" },
      { icon: Play, text: "AI 视频合成" },
    ],
    route: "/workspace",
    gradient: "from-indigo-500/15 to-cyan-500/15 dark:from-indigo-500/10 dark:to-cyan-500/10",
    iconBg: "bg-indigo-500/10 dark:bg-indigo-500/15",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    borderHover: "hover:border-indigo-400/50 dark:hover:border-indigo-500/40",
  },
];

const Modules = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold font-[Space_Grotesk]">Infinio</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          设置
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold font-[Space_Grotesk] mb-3">
            选择创作模块
          </h1>
          <p className="text-muted-foreground">
            选择你要使用的工具，开始创作之旅
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full">
          {/* 剧本创作卡片 - 含两个子入口 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br from-amber-500/15 to-orange-500/15 dark:from-amber-500/10 dark:to-orange-600/10 backdrop-blur-sm text-left"
          >
            <div className="h-14 w-14 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center">
              <PenTool className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>

            <div>
              <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">剧本创作</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">AI 辅助创作完整剧本，从主题大纲到成稿</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                AI 智能生成
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                多种体裁支持
              </div>
            </div>

            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={() => navigate("/script-creator?mode=traditional")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-emerald-400/50 dark:border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 dark:hover:bg-emerald-500/20 hover:border-emerald-400 transition-all"
              >
                <BookOpen className="h-4 w-4" />
                传统创作
              </button>
              <button
                onClick={() => navigate("/script-creator?mode=adaptation")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-violet-400/50 dark:border-violet-500/40 bg-violet-500/5 dark:bg-violet-500/10 text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/15 dark:hover:bg-violet-500/20 hover:border-violet-400 transition-all"
              >
                <Repeat2 className="h-4 w-4" />
                同款创作
              </button>
            </div>
          </motion.div>

          {/* 视频创作卡片 */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            onClick={() => navigate("/workspace")}
            className="group relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br from-indigo-500/15 to-cyan-500/15 dark:from-indigo-500/10 dark:to-cyan-500/10 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:border-indigo-400/50 dark:hover:border-indigo-500/40 hover:scale-[1.02] active:scale-[0.99]"
          >
            <div className="h-14 w-14 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 flex items-center justify-center">
              <Film className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">视频创作</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">从剧本拆解分镜、生成画面到合成视频</p>
            </div>
            <div className="flex items-center gap-4 mt-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                分镜图生成
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Play className="h-3.5 w-3.5" />
                AI 视频合成
              </div>
            </div>
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center">
                <ArrowLeft className="h-4 w-4 rotate-180 text-foreground/60" />
              </div>
            </div>
          </motion.button>
        </div>
      </main>
    </div>
  );
};

export default Modules;
