import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, PenTool, ArrowLeft, Settings, Sparkles, Play, Layers, FileText } from "lucide-react";
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
    gradient: "from-amber-500/20 to-orange-500/20",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
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
    gradient: "from-primary/20 to-accent/20",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
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
            <span className="text-lg font-semibold font-[Space_Grotesk]">StoryForge</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          API 设置
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
          {modules.map((m, i) => (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              onClick={() => navigate(m.route)}
              className={`group relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br ${m.gradient} backdrop-blur-sm text-left transition-all hover:shadow-lg hover:border-border hover:scale-[1.02] active:scale-[0.99]`}
            >
              <div className={`h-14 w-14 rounded-xl ${m.iconBg} flex items-center justify-center`}>
                <m.icon className={`h-7 w-7 ${m.iconColor}`} />
              </div>

              <div>
                <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">{m.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>

              <div className="flex items-center gap-4 mt-auto">
                {m.features.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <f.icon className="h-3.5 w-3.5" />
                    {f.text}
                  </div>
                ))}
              </div>

              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center">
                  <ArrowLeft className="h-4 w-4 rotate-180 text-foreground/60" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Modules;
