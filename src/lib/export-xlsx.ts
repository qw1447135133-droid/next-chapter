import * as XLSX from "xlsx";
import type { Scene } from "@/types/project";

interface ExportSegment {
  episodeLabel: string;
  segmentLabel: string;
  sceneName: string;
  scenes: Scene[];
  totalDuration: number;
}

/**
 * Export scenes to an XLSX file with clear paragraph structure:
 * Episode → Segment → Storyboard shots
 */
export function exportScenesToXlsx(scenes: Scene[], title?: string) {
  if (scenes.length === 0) return;

  // Group by segmentLabel
  const segmentMap = new Map<string, Scene[]>();
  const segmentOrder: string[] = [];
  for (const scene of scenes) {
    const label = scene.segmentLabel || "未分组";
    if (!segmentMap.has(label)) {
      segmentMap.set(label, []);
      segmentOrder.push(label);
    }
    segmentMap.get(label)!.push(scene);
  }

  // Detect episode structure (N-M pattern)
  const hasEpisodes = segmentOrder.some(label => /^\d+-\d+$/.test(label));

  // Build rows
  const rows: Record<string, string>[] = [];

  let lastEpNum = "";
  for (const segLabel of segmentOrder) {
    const segScenes = segmentMap.get(segLabel)!;
    const epNum = hasEpisodes ? segLabel.split("-")[0] : "";
    const segNum = hasEpisodes ? segLabel.split("-")[1] : segLabel;

    // Episode separator row
    if (hasEpisodes && epNum !== lastEpNum) {
      lastEpNum = epNum;
      rows.push({
        "集数": `第 ${epNum} 集`,
        "片段": "",
        "场景": "",
        "分镜序号": "",
        "画面描述": "",
        "对白": "",
        "角色": "",
        "镜头指示": "",
        "时长(秒)": "",
      });
    }

    const sceneNames = [...new Set(segScenes.map(s => s.sceneName?.trim()).filter(Boolean))].join("、");

    for (let i = 0; i < segScenes.length; i++) {
      const s = segScenes[i];
      rows.push({
        "集数": hasEpisodes ? `第 ${epNum} 集` : "",
        "片段": `片段 ${segLabel}`,
        "场景": sceneNames,
        "分镜序号": String(i + 1),
        "画面描述": s.description || "",
        "对白": s.dialogue || "",
        "角色": (s.characters || []).join("、"),
        "镜头指示": s.cameraDirection || "",
        "时长(秒)": String(s.duration ?? 5),
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 10 }, // 集数
    { wch: 12 }, // 片段
    { wch: 16 }, // 场景
    { wch: 8 },  // 分镜序号
    { wch: 50 }, // 画面描述
    { wch: 30 }, // 对白
    { wch: 16 }, // 角色
    { wch: 20 }, // 镜头指示
    { wch: 8 },  // 时长
  ];

  // Merge episode header cells across columns
  const merges: XLSX.Range[] = [];
  for (let r = 1; r < rows.length + 1; r++) {
    const row = rows[r - 1];
    if (row["集数"] && !row["分镜序号"]) {
      // This is an episode separator row - merge across all columns
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
    }
  }
  if (merges.length > 0) ws["!merges"] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "分镜脚本");

  const fileName = title ? `${title.slice(0, 30)}_分镜.xlsx` : "分镜脚本.xlsx";
  XLSX.writeFile(wb, fileName);
}
