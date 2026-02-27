import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, Sparkles, Layers, Play, ArrowRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Sparkles,
    title: "AI 剧本拆解",
    desc: "智能分析剧本，自动生成分镜列表",
  },
  {
    icon: Layers,
    title: "分镜图生成",
    desc: "根据角色与场景设定，AI 绘制每一帧",
  },
  {
    icon: Play,
    title: "视频合成",
    desc: "一键将分镜图转化为流畅视频",
  },
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Film className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold font-[Space_Grotesk]">StoryForge</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          API 设置
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-2xl space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI 驱动的视频创作
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight font-[Space_Grotesk] leading-[1.1]">
            从剧本到视频
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              一站式 AI 生成
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            输入剧本，AI 自动拆解分镜、生成画面、合成视频。每一步都可调整，完全掌控创作流程。
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="gap-2 rounded-xl px-6 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/workspace")}
            >
              开始创作
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl px-6"
              onClick={() => navigate("/history")}
            >
              项目历史
            </Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-20 max-w-3xl w-full"
        >
          {features.map((f, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold font-[Space_Grotesk]">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground">
        StoryForge · AI 剧本转视频平台
      </footer>
    </div>
  );
};

export default Home;
