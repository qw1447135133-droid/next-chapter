import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Layers, Play, ArrowRight, Settings, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";

const features = [
  {
    icon: Bot,
    title: "全自动 AI 流水线",
    desc: "从剧本到视频，全程自动化执行，无需人工干预",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-200/60 dark:border-blue-500/20",
  },
  {
    icon: Layers,
    title: "智能分镜生成",
    desc: "AI 精准拆解剧本，自动绘制每一帧分镜画面",
    iconBg: "bg-purple-500/10 dark:bg-purple-500/15",
    iconColor: "text-purple-600 dark:text-purple-400",
    borderColor: "border-purple-200/60 dark:border-purple-500/20",
  },
  {
    icon: Play,
    title: "一键视频合成",
    desc: "自动提交即梦，批量生成视频，效率提升 10 倍",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/15",
    iconColor: "text-rose-600 dark:text-rose-400",
    borderColor: "border-rose-200/60 dark:border-rose-500/20",
  },
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <BrandMark className="h-9 w-14" />
          <span className="text-xl font-semibold font-[Space_Grotesk]">Infinio</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          设置
        </Button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-3xl space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            <Zap className="h-3.5 w-3.5" />
            自动化驱动，无限可能
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight font-[Space_Grotesk] leading-[1.1]">
            自动化创作
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              一切皆有可能
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            全链路自动化执行，从剧本到视频一气呵成。让 AI 替你完成一切，创作从未如此简单。
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="gap-2 rounded-xl px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 border-0"
              onClick={() => navigate("/modules")}
            >
              立即开始
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
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-20 max-w-5xl w-full"
        >
          {features.map((f, i) => (
            <div
              key={i}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl border ${f.borderColor} bg-card/50 backdrop-blur-sm`}
            >
              <div className={`h-10 w-10 rounded-xl ${f.iconBg} flex items-center justify-center`}>
                <f.icon className={`h-5 w-5 ${f.iconColor}`} />
              </div>
              <h3 className="font-semibold font-[Space_Grotesk] text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground">
        Infinio · 自动化 AI 视频创作平台
      </footer>
    </div>
  );
};

export default Home;
