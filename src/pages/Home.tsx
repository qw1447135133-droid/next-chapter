import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, Sparkles, Users, MapPin, ArrowRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Sparkles,
    title: "AI 角色分析",
    desc: "智能识别剧本中的角色与场景",
  },
  {
    icon: Users,
    title: "角色设定",
    desc: "为每个角色定义外貌特征与造型",
  },
  {
    icon: MapPin,
    title: "场景管理",
    desc: "设定场景环境与视觉风格",
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
          className="max-w-3xl space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI 驱动的剧本分析
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight font-[Space_Grotesk] leading-[1.1]">
            剧本智能拆解
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              角色与场景设定
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            输入剧本，AI 自动识别角色与场景。为每个角色定义外貌，为每个场景设定风格。
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
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-20 max-w-5xl w-full"
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
        StoryForge · AI 剧本分析平台
      </footer>
    </div>
  );
};

export default Home;
