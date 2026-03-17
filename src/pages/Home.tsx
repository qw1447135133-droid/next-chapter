import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, Sparkles, PenTool, ShieldCheck, ArrowRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: PenTool,
    title: "剧本创作",
    desc: "AI 辅助创作完整剧本，从主题大纲到成稿",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-200/60 dark:border-emerald-500/20",
  },
  {
    icon: Sparkles,
    title: "同款创作",
    desc: "基于参考剧本改编，快速产出同款内容",
    iconBg: "bg-violet-500/10 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    borderColor: "border-violet-200/60 dark:border-violet-500/20",
  },
  {
    icon: ShieldCheck,
    title: "合规审查",
    desc: "智能审核剧本内容，自动识别风险并修正",
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
          <Film className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold font-[Space_Grotesk]">Infinio</span>
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
            <Sparkles className="h-3.5 w-3.5" />
            AI 驱动的剧本创作
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight font-[Space_Grotesk] leading-[1.1]">
            剧本创作与合规
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              AI 一站式完成
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            AI 辅助剧本创作与合规审查，从创意到成稿，专业内容生产提速 10 倍。
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="gap-2 rounded-xl px-6 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/modules")}
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
        Infinio · AI 剧本创作与合规平台
      </footer>
    </div>
  );
};

export default Home;
