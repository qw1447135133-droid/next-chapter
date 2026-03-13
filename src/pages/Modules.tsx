import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, ArrowLeft, Settings, Layers, Play, PenTool, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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
            从剧本创作到视频制作，开始你的创作之旅
          </p>
        </motion.div>

        <div className="flex flex-col md:flex-row gap-6 max-w-3xl w-full">
          {/* Script Creator */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onClick={() => navigate("/script-creator")}
            className="group relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:border-border hover:scale-[1.02] active:scale-[0.99] flex-1"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <PenTool className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">剧本创作</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI 辅助从选题立项到完整剧本的全流程创作
              </p>
            </div>
            <div className="flex items-center gap-4 mt-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                选题立项
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PenTool className="h-3.5 w-3.5" />
                分集撰写
              </div>
            </div>
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center">
                <ArrowLeft className="h-4 w-4 rotate-180 text-foreground/60" />
              </div>
            </div>
          </motion.button>

          {/* Video Creator */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            onClick={() => navigate("/workspace")}
            className="group relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br from-accent/20 to-primary/20 backdrop-blur-sm text-left transition-all hover:shadow-lg hover:border-border hover:scale-[1.02] active:scale-[0.99] flex-1"
          >
            <div className="h-14 w-14 rounded-xl bg-accent/10 flex items-center justify-center">
              <Film className="h-7 w-7 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">视频创作</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                从剧本拆解分镜、生成画面到合成视频
              </p>
            </div>
            <div className="flex items-center gap-4 mt-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                分镜拆解
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Play className="h-3.5 w-3.5" />
                角色设置
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
