import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, ArrowLeft, Settings, BookOpen, Repeat2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const modules = [
  {
    id: "traditional",
    icon: BookOpen,
    title: "传统创作",
    desc: "从零开始创作完整剧本，AI 辅助从主题大纲到成稿",
    route: "/script-creator?mode=traditional",
    gradient: "from-emerald-500/15 to-teal-500/15 dark:from-emerald-500/10 dark:to-teal-500/10",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    borderHover: "hover:border-emerald-400/50 dark:hover:border-emerald-500/40",
  },
  {
    id: "adaptation",
    icon: Repeat2,
    title: "同款创作",
    desc: "基于参考剧本进行改编创作，快速产出同款内容",
    route: "/script-creator?mode=adaptation",
    gradient: "from-violet-500/15 to-purple-500/15 dark:from-violet-500/10 dark:to-purple-500/10",
    iconBg: "bg-violet-500/10 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    borderHover: "hover:border-violet-400/50 dark:hover:border-violet-500/40",
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "合规审查",
    desc: "对剧本进行合规审核，自动识别并修正风险内容",
    route: "/compliance-review",
    gradient: "from-rose-500/15 to-pink-500/15 dark:from-rose-500/10 dark:to-pink-500/10",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/15",
    iconColor: "text-rose-600 dark:text-rose-400",
    borderHover: "hover:border-rose-400/50 dark:hover:border-rose-500/40",
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
            选择创作模式
          </h1>
          <p className="text-muted-foreground">
            选择你要使用的工具，开始创作之旅
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          {modules.map((module, index) => (
            <motion.button
              key={module.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              onClick={() => navigate(module.route)}
              className={`group relative flex flex-col items-start gap-5 p-8 rounded-2xl border border-border/60 bg-gradient-to-br ${module.gradient} backdrop-blur-sm text-left transition-all hover:shadow-lg ${module.borderHover} active:scale-[0.99]`}
            >
              <div className={`h-14 w-14 rounded-xl ${module.iconBg} flex items-center justify-center`}>
                <module.icon className={`h-7 w-7 ${module.iconColor}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold font-[Space_Grotesk] mb-1.5">{module.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{module.desc}</p>
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