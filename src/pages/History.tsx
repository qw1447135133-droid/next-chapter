import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Film, Clock, Trash2, Play, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSmartPersistence } from "@/hooks/use-smart-persistence";
import { STEP_LABELS, type WorkspaceStep } from "@/types/project";
import { DRAMA_STEP_LABELS, type DramaStep } from "@/types/drama";
import { listDramaProjects, deleteDramaProject } from "@/pages/ScriptCreator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectSummary {
  id: string;
  title: string;
  current_step: number | string;
  created_at: string;
  updated_at: string;
  type?: "video" | "drama";
}

const History = () => {
  const navigate = useNavigate();
  const { listProjects, deleteProject } = useSmartPersistence();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  const fetchProjects = async () => {
    setLoading(true);

    // Fetch video projects
    const videoData = await listProjects();
    const videoProjects: ProjectSummary[] = videoData.map((p: any) => ({
      ...p,
      type: "video" as const,
    }));

    // Fetch drama projects
    const dramaData = listDramaProjects();
    const dramaProjects: ProjectSummary[] = dramaData.map((p) => ({
      id: p.id,
      title: p.title,
      current_step: p.currentStep,
      created_at: p.created_at,
      updated_at: p.updated_at,
      type: "drama" as const,
    }));

    // Merge and sort by updated_at
    const all = [...videoProjects, ...dramaProjects].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    setProjects(all);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (project: ProjectSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(project);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "drama") {
      deleteDramaProject(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } else {
      const ok = await deleteProject(deleteTarget.id);
      if (ok) setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const handleClick = (project: ProjectSummary) => {
    if (project.type === "drama") {
      navigate(`/script-creator?id=${project.id}`);
    } else {
      navigate(`/workspace?id=${project.id}`);
    }
  };

  const getStepLabel = (project: ProjectSummary) => {
    if (project.type === "drama") {
      return DRAMA_STEP_LABELS[project.current_step as DramaStep] || "选题立项";
    }
    return STEP_LABELS[(project.current_step || 1) as WorkspaceStep];
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

      <main className="max-w-7xl mx-auto px-6 py-6">
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
            <p className="text-sm text-muted-foreground mb-6">创建你的第一个项目</p>
            <div className="flex gap-3">
              <Button onClick={() => navigate("/workspace")} className="gap-2">
                <Film className="h-4 w-4" />
                视频创作
              </Button>
              <Button onClick={() => navigate("/script-creator")} variant="outline" className="gap-2">
                <PenTool className="h-4 w-4" />
                剧本创作
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const isDrama = project.type === "drama";
              return (
                <div
                  key={`${project.type}-${project.id}`}
                  onClick={() => handleClick(project)}
                  className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isDrama ? "bg-orange-500/10" : "bg-primary/10"
                    }`}>
                      {isDrama ? (
                        <PenTool className="h-5 w-5 text-orange-500" />
                      ) : (
                        <Film className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{project.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded ${
                          isDrama ? "bg-orange-500/10 text-orange-600" : "bg-muted text-muted-foreground"
                        }`}>
                          {isDrama ? "剧本" : "视频"} · {getStepLabel(project)}
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
                      onClick={(e) => handleDelete(project, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Play className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{deleteTarget?.title}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default History;
