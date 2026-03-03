import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Film, Clock, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { STEP_LABELS, type WorkspaceStep } from "@/types/project";

interface ProjectSummary {
  id: string;
  title: string;
  current_step: number;
  created_at: string;
  updated_at: string;
}

const History = () => {
  const navigate = useNavigate();
  const { listProjects, deleteProject } = useProjectPersistence();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    const data = await listProjects();
    setProjects(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await deleteProject(id);
    if (ok) setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">项目历史</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold font-[Space_Grotesk] mb-2">暂无项目</h2>
            <p className="text-sm text-muted-foreground mb-6">创建你的第一个视频项目</p>
            <Button onClick={() => navigate("/workspace")} className="gap-2">
              <Film className="h-4 w-4" />
              开始创作
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/workspace?id=${project.id}`)}
                className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Film className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{project.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {STEP_LABELS[(project.current_step || 1) as WorkspaceStep]}
                      </span>
                      <span>{formatDate(project.updated_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={(e) => handleDelete(project.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Play className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default History;
