import ExcelJS from "exceljs";
import type { Scene, CharacterSetting } from "@/types/project";

const COLS = ["分镜序号", "画面描述", "对白", "角色", "时长(秒)"] as const;

/**
 * Export scenes to a richly-styled XLSX using ExcelJS.
 * Layout mirrors the web page: Episode → Segment → Shots → Suffix.
 */
export async function exportScenesToXlsx(
  scenes: Scene[],
  title?: string,
  _characters?: CharacterSetting[],
) {
  if (scenes.length === 0) return;

  // ── Group by segmentLabel ──
  const segmentMap = new Map<string, Scene[]>();
  const segmentOrder: string[] = [];
  for (const s of scenes) {
    const label = s.segmentLabel || "未分组";
    if (!segmentMap.has(label)) {
      segmentMap.set(label, []);
      segmentOrder.push(label);
    }
    segmentMap.get(label)!.push(s);
  }

  const hasEpisodes = segmentOrder.some(l => /^\d+-\d+$/.test(l));

  // ── Create workbook & worksheet ──
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("分镜脚本", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Column definitions
  ws.columns = [
    { key: "shot",     width: 12 },
    { key: "desc",     width: 58 },
    { key: "dialogue", width: 38 },
    { key: "chars",    width: 20 },
    { key: "duration", width: 10 },
  ];

  // ── Styles ──
  const BORDER_THIN: Partial<ExcelJS.Borders> = {
    top:    { style: "thin", color: { argb: "FFDDDDDD" } },
    bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
    left:   { style: "thin", color: { argb: "FFDDDDDD" } },
    right:  { style: "thin", color: { argb: "FFDDDDDD" } },
  };

  const styleColHeader: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } },
    alignment: { vertical: "middle", horizontal: "center" },
    border: BORDER_THIN,
  };

  const styleEpHeader: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 13, color: { argb: "FF1A1A2E" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC5CAE9" } },
    alignment: { vertical: "middle", horizontal: "left" },
    border: BORDER_THIN,
  };

  const styleSegHeader: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 10, color: { argb: "FF303F9F" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } },
    alignment: { vertical: "middle", horizontal: "left", wrapText: true },
    border: BORDER_THIN,
  };

  const styleSuffix: Partial<ExcelJS.Style> = {
    font: { italic: true, size: 9, color: { argb: "FF999999" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } },
    alignment: { vertical: "middle" },
  };

  // ── Column Header Row ──
  const headerRow = ws.addRow(COLS as unknown as string[]);
  headerRow.height = 28;
  headerRow.eachCell(cell => { Object.assign(cell, { style: styleColHeader }); });

  let lastEpNum = "";

  for (const segLabel of segmentOrder) {
    const segScenes = segmentMap.get(segLabel)!;
    const epNum = hasEpisodes ? segLabel.split("-")[0] : "";

    // ── Episode header ──
    if (hasEpisodes && epNum !== lastEpNum) {
      lastEpNum = epNum;
      const epTotalScenes = segmentOrder
        .filter(l => l.startsWith(epNum + "-"))
        .reduce((sum, l) => sum + (segmentMap.get(l)?.length || 0), 0);
      const epSegCount = segmentOrder.filter(l => l.startsWith(epNum + "-")).length;

      const epRow = ws.addRow([`第 ${epNum} 集    （${epSegCount} 个片段 · ${epTotalScenes} 个分镜）`]);
      ws.mergeCells(epRow.number, 1, epRow.number, 5);
      epRow.height = 30;
      epRow.eachCell(cell => { Object.assign(cell, { style: styleEpHeader }); });
    }

    // ── Segment header ──
    const sceneNames = [...new Set(segScenes.map(s => s.sceneName?.trim()).filter(Boolean))];
    const charNames = new Set<string>();
    segScenes.forEach(s => (s.characters || []).forEach(c => {
      const name = typeof c === "string" ? c : (c as any)?.name || "";
      if (name) charNames.add(name);
    }));

    const tags: string[] = [];
    if (sceneNames.length > 0) tags.push(...sceneNames.map(n => `【${n}】`));
    tags.push(...Array.from(charNames).map(n => `【${n}】`));

    const segDuration = segScenes[0]?.duration || 15;
    const segTitle = `片段 ${segLabel}  (时长: ${segDuration}s)`;
    const tagStr = tags.length > 0 ? `    场景/人物标签：${tags.join(" ")}` : "";

    const segRow = ws.addRow([segTitle + tagStr]);
    ws.mergeCells(segRow.number, 1, segRow.number, 5);
    segRow.height = 26;
    segRow.eachCell(cell => { Object.assign(cell, { style: styleSegHeader }); });

    // ── Scene / Shot rows ──
    for (let i = 0; i < segScenes.length; i++) {
      const s = segScenes[i];
      const row = ws.addRow([
        `分镜${i + 1}`,
        s.description || "",
        s.dialogue || "",
        (s.characters || []).join("、"),
        s.duration ?? 5,
      ]);
      row.height = 22;

      // Shot number
      row.getCell(1).style = {
        font: { bold: true, size: 10 },
        alignment: { vertical: "top", horizontal: "center" },
        border: BORDER_THIN,
      };
      // Description
      row.getCell(2).style = {
        font: { size: 10 },
        alignment: { vertical: "top", wrapText: true },
        border: BORDER_THIN,
      };
      // Dialogue
      row.getCell(3).style = {
        font: { italic: true, size: 10, color: { argb: "FF666666" } },
        alignment: { vertical: "top", wrapText: true },
        border: BORDER_THIN,
      };
      // Characters
      row.getCell(4).style = {
        font: { size: 10 },
        alignment: { vertical: "top" },
        border: BORDER_THIN,
      };
      // Duration
      row.getCell(5).style = {
        font: { size: 10 },
        alignment: { vertical: "top", horizontal: "center" },
        border: BORDER_THIN,
      };
    }

    // ── Suffix row ──
    const suffixRow = ws.addRow(["通用后缀：无字幕、无水印、无背景音"]);
    ws.mergeCells(suffixRow.number, 1, suffixRow.number, 5);
    suffixRow.height = 20;
    suffixRow.eachCell(cell => { Object.assign(cell, { style: styleSuffix }); });

    // Empty separator row
    ws.addRow([]);
  }

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = title ? `${title.slice(0, 30)}_分镜.xlsx` : "分镜脚本.xlsx";

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
