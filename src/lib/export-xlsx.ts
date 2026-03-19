import * as XLSX from "xlsx";
import type { Scene, CharacterSetting } from "@/types/project";

const COL = {
  A: 0, // 分镜序号
  B: 1, // 画面描述
  C: 2, // 对白
  D: 3, // 角色
  E: 4, // 时长
};
const TOTAL_COLS = 5; // A–E

function cell(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}

/**
 * Export scenes to a well-structured XLSX that mirrors the page layout:
 *   ┌─ 集数标题行 (merged, bold)
 *   ├─ 片段标题行 (merged, with scene/character tags)
 *   │  ├─ 分镜1:  画面描述  |  对白  |  角色  |  时长
 *   │  ├─ 分镜2:  ...
 *   │  └─ 通用后缀行
 *   ├─ 片段标题行 ...
 *   └─ ...
 */
export function exportScenesToXlsx(
  scenes: Scene[],
  title?: string,
  characters?: CharacterSetting[],
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

  // ── Build worksheet data row-by-row ──
  const wsData: (string | number | null)[][] = [];
  const merges: XLSX.Range[] = [];
  const rowStyles: Map<number, "header-ep" | "header-seg" | "suffix" | "shot"> = new Map();

  // Header row
  wsData.push(["分镜序号", "画面描述", "对白", "角色", "时长(秒)"]);
  rowStyles.set(0, "header-ep");

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

      const r = wsData.length;
      wsData.push([`第 ${epNum} 集    （${epSegCount} 个片段 · ${epTotalScenes} 个分镜）`, null, null, null, null]);
      merges.push({ s: { r, c: 0 }, e: { r, c: TOTAL_COLS - 1 } });
      rowStyles.set(r, "header-ep");
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

    const segR = wsData.length;
    wsData.push([segTitle + tagStr, null, null, null, null]);
    merges.push({ s: { r: segR, c: 0 }, e: { r: segR, c: TOTAL_COLS - 1 } });
    rowStyles.set(segR, "header-seg");

    // ── Scene rows ──
    for (let i = 0; i < segScenes.length; i++) {
      const s = segScenes[i];
      const shotR = wsData.length;
      wsData.push([
        `分镜${i + 1}`,
        s.description || "",
        s.dialogue || "",
        (s.characters || []).join("、"),
        s.duration ?? 5,
      ]);
      rowStyles.set(shotR, "shot");
    }

    // ── Suffix row ──
    const suffixR = wsData.length;
    wsData.push(["通用后缀：无字幕、无水印、无背景音", null, null, null, null]);
    merges.push({ s: { r: suffixR, c: 0 }, e: { r: suffixR, c: TOTAL_COLS - 1 } });
    rowStyles.set(suffixR, "suffix");

    // Empty separator row
    wsData.push([null, null, null, null, null]);
  }

  // ── Create worksheet ──
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 10 },  // 分镜序号
    { wch: 55 },  // 画面描述
    { wch: 35 },  // 对白
    { wch: 18 },  // 角色
    { wch: 10 },  // 时长
  ];

  // Row heights: taller for headers
  ws["!rows"] = wsData.map((_, i) => {
    const style = rowStyles.get(i);
    if (style === "header-ep") return { hpt: 28 };
    if (style === "header-seg") return { hpt: 24 };
    if (style === "suffix") return { hpt: 18 };
    return { hpt: 20 };
  });

  // Merges
  if (merges.length > 0) ws["!merges"] = merges;

  // ── Apply styles (xlsx community edition supports s property) ──
  const headerFill = { fgColor: { rgb: "1a1a2e" } };
  const segFill = { fgColor: { rgb: "E8EAF6" } };
  const suffixFill = { fgColor: { rgb: "F5F5F5" } };

  for (let r = 0; r < wsData.length; r++) {
    const style = rowStyles.get(r);
    for (let c = 0; c < TOTAL_COLS; c++) {
      const ref = cell(r, c);
      if (!ws[ref]) ws[ref] = { v: "", t: "s" };
      const cellObj = ws[ref];

      if (style === "header-ep" && r === 0) {
        // Column header row
        cellObj.s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill: headerFill,
          alignment: { vertical: "center", horizontal: "center" },
          border: thinBorder(),
        };
      } else if (style === "header-ep") {
        // Episode header
        cellObj.s = {
          font: { bold: true, sz: 13, color: { rgb: "1a1a2e" } },
          fill: { fgColor: { rgb: "C5CAE9" } },
          alignment: { vertical: "center", horizontal: "left" },
          border: thinBorder(),
        };
      } else if (style === "header-seg") {
        cellObj.s = {
          font: { bold: true, sz: 10, color: { rgb: "303F9F" } },
          fill: segFill,
          alignment: { vertical: "center", horizontal: "left", wrapText: true },
          border: thinBorder(),
        };
      } else if (style === "suffix") {
        cellObj.s = {
          font: { italic: true, sz: 9, color: { rgb: "999999" } },
          fill: suffixFill,
          alignment: { vertical: "center" },
        };
      } else if (style === "shot") {
        const isDialogue = c === COL.C;
        const isDesc = c === COL.B;
        cellObj.s = {
          font: {
            sz: 10,
            ...(c === COL.A ? { bold: true } : {}),
            ...(isDialogue ? { italic: true, color: { rgb: "666666" } } : {}),
          },
          alignment: {
            vertical: "top",
            wrapText: isDesc || isDialogue,
            horizontal: c === COL.A || c === COL.E ? "center" : "left",
          },
          border: thinBorder(),
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "分镜脚本");

  const fileName = title ? `${title.slice(0, 30)}_分镜.xlsx` : "分镜脚本.xlsx";
  XLSX.writeFile(wb, fileName);
}

function thinBorder() {
  const side = { style: "thin", color: { rgb: "DDDDDD" } };
  return { top: side, bottom: side, left: side, right: side };
}
