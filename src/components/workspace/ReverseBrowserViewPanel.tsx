import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Loader2, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compress";
import {
  captureJimengAgentObservation,
  decideJimengAgentAction,
  executeJimengAgentAction,
  type JimengAgentControl,
} from "@/lib/jimeng-browser-agent";
import {
  buildClickSubmitButtonScript,
  buildDismissInterferingOverlaysScript,
  buildInsertLineBreakScript,
  buildLocatePromptAreaScript,
  buildReadPromptScopeStateScript,
  buildResetPromptAreaScript,
  buildReadPromptValueScript,
  buildReadToolbarStateScript,
  buildSetAspectRatioScript,
  buildSetDurationScript,
  buildSetFullReferenceScript,
  buildSetModelScript,
  buildSubmitCurrentPromptStrictScript,
  buildTypeAtMentionScript,
  buildTypePromptScript,
} from "@/lib/reverse-browserview-scripts";
import {
  findSegmentSceneSetting,
  getPreferredCharacterCostumeLabelForSegment,
  matchSceneTimeVariantForSegment,
  normalizeCharacterName,
  normalizeSceneName,
} from "@/lib/workspace-labels";
import type { CharacterSetting, Scene, SceneSetting } from "@/types/project";

type GenerationMode = "single" | "auto";
type AspectRatio = "16:9" | "9:16" | "3:2" | "2:3";
type ReverseModel = "Seedance 2.0" | "Seedance 2.0 Fast";
type ReverseDuration = "5s" | "10s" | "15s";
type ReverseReferenceKind = "character" | "scene";
type ReverseReferenceAttachment = "setting-image" | "audio";
type ReverseRepeatCount = "1" | "2" | "3" | "4" | "5";
type ReverseBatchWaitMinutes = "5" | "10" | "15" | "20" | "30";

interface ReverseReference {
  kind: ReverseReferenceKind;
  attachment: ReverseReferenceAttachment;
  label: string;
  source: string;
  sourceFileName?: string;
}

interface UploadReadyReference extends ReverseReference {
  dataUrl: string;
  fileName: string;
}

interface SegmentDefinition {
  segmentKey: string;
  episodeKey: string;
  scenes: Scene[];
  prompt: string;
  references: ReverseReference[];
}

interface ReverseBrowserViewPanelProps {
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
}

interface PromptTarget {
  ok: boolean;
  fileInputIndex: number;
  scopedFileCount: number;
  textboxIndex: number;
}

type SegmentRunState =
  | "idle"
  | "submitted";

interface SegmentRunStatus {
  state: SegmentRunState;
  detail?: string;
}

const JIMENG_HOME_URL = "https://jimeng.jianying.com/ai-tool/home";
const JIMENG_VIDEO_URL = `${JIMENG_HOME_URL}?type=video&workspace=0`;
const MODEL_OPTIONS: ReverseModel[] = ["Seedance 2.0", "Seedance 2.0 Fast"];
const DURATION_OPTIONS: ReverseDuration[] = ["5s", "10s", "15s"];
const ASPECT_RATIO_OPTIONS: AspectRatio[] = ["16:9", "9:16", "3:2", "2:3"];
const REPEAT_COUNT_OPTIONS: ReverseRepeatCount[] = ["1", "2", "3", "4", "5"];
const BATCH_WAIT_MINUTE_OPTIONS: ReverseBatchWaitMinutes[] = ["5", "10", "15", "20", "30"];
const REVERSE_BATCH_SIZE = 5;
const INTER_VIDEO_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function uniqueByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/\s+/g, " ").trim();
}

function segmentKeyOf(scene: Scene): string {
  const raw = String(scene.segmentLabel || scene.sceneNumber || "").trim();
  return raw || String(scene.sceneNumber || "");
}

function episodeKeyOf(segmentKey: string): string {
  return String(segmentKey || "").split("-")[0] || "1";
}

function inferExtensionFromSource(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes(".png")) return ".png";
  if (lower.includes(".webp")) return ".webp";
  if (lower.includes(".gif")) return ".gif";
  if (lower.includes(".mp3")) return ".mp3";
  if (lower.includes(".wav")) return ".wav";
  if (lower.includes(".ogg")) return ".ogg";
  if (lower.includes(".m4a")) return ".m4a";
  if (lower.includes(".aac")) return ".aac";
  return ".jpg";
}

function inferExtensionFromDataUrl(dataUrl: string, fallback: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  const mime = match?.[1]?.toLowerCase() || "";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return ".m4a";
  return fallback;
}

function inferExtensionFromFileName(fileName: string | undefined): string | null {
  const match = String(fileName || "").match(/(\.[a-z0-9]{1,8})(?:$|[?#])/i);
  return match?.[1]?.toLowerCase() || null;
}

function normalizeText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const GLOBAL_PROMPT_SUFFIX = "无字幕、无水印、无背景音";

function stripPromptBoilerplate(value: string): string {
  return normalizeText(value)
    .replace(/镜头[:：]\s*/g, "")
    .replace(/[，、,\s]*无字幕、无水印、无背景音(?:乐)?/g, "")
    .trim();
}

function cleanPromptFragment(value: string): string {
  return stripPromptBoilerplate(String(value || "")).replace(/^[：:、，,\s]+|[：:、，,\s]+$/g, "");
}

function cleanCameraDirection(value: string): string {
  return cleanPromptFragment(value).replace(/^(镜头|运镜)[:：]\s*/i, "");
}

function getReferenceKey(reference: Pick<ReverseReference, "kind" | "label" | "attachment">): string {
  return `${reference.kind}:${reference.label}:${reference.attachment}`;
}

function getReferenceGroupKey(reference: Pick<ReverseReference, "kind" | "label">): string {
  return `${reference.kind}:${reference.label}`;
}

function getReferenceMentionLabel(reference: Pick<ReverseReference, "attachment">): "@设定图" | "@音频" {
  return reference.attachment === "audio" ? "@音频" : "@设定图";
}

function getReferenceFileSuffix(reference: Pick<ReverseReference, "attachment">): string {
  return reference.attachment === "audio" ? "音频" : "设定图";
}

function groupPromptReferences<T extends ReverseReference>(references: T[]): Array<{
  kind: ReverseReferenceKind;
  label: string;
  items: T[];
}> {
  const grouped = new Map<string, { kind: ReverseReferenceKind; label: string; items: T[] }>();

  for (const reference of references) {
    const key = getReferenceGroupKey(reference);
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(reference);
      continue;
    }

    grouped.set(key, {
      kind: reference.kind,
      label: reference.label,
      items: [reference],
    });
  }

  return Array.from(grouped.values());
}

function getReferenceMentionLabelSafe(
  reference: Pick<ReverseReference, "attachment">,
): "@\u8bbe\u5b9a\u56fe" | "@\u97f3\u9891" {
  return reference.attachment === "audio" ? "@\u97f3\u9891" : "@\u8bbe\u5b9a\u56fe";
}

function getReferenceFileSuffixSafe(reference: Pick<ReverseReference, "attachment">): string {
  return reference.attachment === "audio" ? "\u97f3\u9891" : "\u8bbe\u5b9a\u56fe";
}

function buildPromptForSegment(segmentScenes: Scene[], references: ReverseReference[]): string {
  const sceneTags = uniqueByKey(
    references.filter((item) => item.kind === "scene"),
    (item) => getReferenceGroupKey(item),
  ).map((item) => `【${item.label}】`);

  const characterTags = uniqueByKey(
    references.filter((item) => item.kind === "character"),
    (item) => `${item.kind}:${item.label}`,
  ).map((item) => `【${item.label}】`);

  const lines: string[] = [];
  const tags = [...sceneTags, ...characterTags].join("");
  if (tags) {
    lines.push(`场景/人物标签：${tags}`);
  }

  segmentScenes.forEach((scene, index) => {
    const parts = [`分镜${index + 1}：${scene.description || ""}`];
    if (scene.dialogue) parts.push(`对白：${scene.dialogue}`);
    lines.push(parts.filter(Boolean).join(" "));
  });

  lines.push("无字幕、无水印、无背景音");
  return lines.filter(Boolean).join("\n");
}

function buildOrderedPromptReferences(references: ReverseReference[]): ReverseReference[] {
  const sceneReferences = uniqueByKey(
    references.filter((item) => item.kind === "scene"),
    (item) => getReferenceKey(item),
  );
  const characterReferences = uniqueByKey(
    references.filter((item) => item.kind === "character"),
    (item) => getReferenceKey(item),
  );
  return [...sceneReferences, ...characterReferences];
}

function buildPromptBodyLines(segmentScenes: Scene[]): string[] {
  const lines = segmentScenes.map((scene, index) => {
    const parts = [`分镜${index + 1}：${scene.description || ""}`];
    if (scene.dialogue) parts.push(`对白：${scene.dialogue}`);
    if (scene.cameraDirection) parts.push(`镜头：${scene.cameraDirection}`);
    return parts.filter(Boolean).join(" ");
  });
  lines.push("无字幕、无水印、无背景音乐");
  return lines;
}

function buildPromptBodyLinesStable(segmentScenes: Scene[]): string[] {
  const lines = segmentScenes.map((scene, index) => {
    const description = cleanPromptFragment(scene.description || "");
    const dialogue = cleanPromptFragment(scene.dialogue || "");
    const cameraDirection = cleanCameraDirection(scene.cameraDirection || "");
    const parts = [`分镜${index + 1}：${description}`];
    if (dialogue) parts.push(`对白：${dialogue}`);
    if (cameraDirection) parts.push(`镜头：${cameraDirection}`);
    return parts.filter(Boolean).join(" ");
  });
  lines.push(GLOBAL_PROMPT_SUFFIX);
  return lines;
}

function buildPromptForSegmentStable(
  segmentScenes: Scene[],
  references: ReverseReference[],
): string {
  const orderedReferences = buildOrderedPromptReferences(references);
  const lines: string[] = [];
  const groupedReferences = groupPromptReferences(orderedReferences);

  if (orderedReferences.length > 0) {
    lines.push(
      `场景/人物标签：${orderedReferences
        .map((item) => `【${item.label} @设定图】`)
        .join(" ")}`,
    );
  }

  lines.push(...buildPromptBodyLinesStable(segmentScenes));
  return lines.filter(Boolean).join("\n");
}

/*
function buildPromptForSegmentWithGroupedReferences(
  segmentScenes: Scene[],
  references: ReverseReference[],
): string {
  const orderedReferences = buildOrderedPromptReferences(references);
  const groupedReferences = groupPromptReferences(orderedReferences);
  const lines: string[] = [];

  if (groupedReferences.length > 0) {
    lines.push(
      `鍦烘櫙/浜虹墿鏍囩锛?{groupedReferences
        .map((group) => `銆?{group.label} ${group.items.map((item) => getReferenceMentionLabel(item)).join(" ")}銆慲)
        .join(" ")}`,
    );
  }

  lines.push(...buildPromptBodyLinesStable(segmentScenes));
  return lines.filter(Boolean).join("\n");
}

*/

function buildPromptForSegmentWithGroupedReferences(
  segmentScenes: Scene[],
  references: ReverseReference[],
): string {
  const orderedReferences = buildOrderedPromptReferences(references);
  const groupedReferences = groupPromptReferences(orderedReferences);
  const lines: string[] = [];

  if (groupedReferences.length > 0) {
    const tags = groupedReferences
      .map(
        (group) =>
          `\u3010${group.label} ${group.items
            .map((item) => getReferenceMentionLabel(item))
            .join(" ")}\u3011`,
      )
      .join(" ");
    lines.push(`\u573a\u666f/\u4eba\u7269\u6807\u7b7e\uff1a${tags}`);
  }

  lines.push(...buildPromptBodyLinesStable(segmentScenes));
  return lines.filter(Boolean).join("\n");
}

function formatSignals(signals: string[]): string {
  return signals.length > 0 ? signals.join(" / ") : "无";
}

function describeControl(control?: JimengAgentControl | null): string {
  if (!control) return "";
  const label = control.text || control.ariaLabel || control.placeholder || "(empty)";
  return `#${control.id} ${label} @(${control.x},${control.y})`;
}

function segmentStateClassName(state?: SegmentRunState): string {
  switch (state) {
    case "submitted":
      return "text-emerald-600";
    default:
      return "";
  }
}

export default function ReverseBrowserViewPanel({
  scenes,
  characters,
  sceneSettings,
}: ReverseBrowserViewPanelProps) {
  const [reverseModel, setReverseModel] = useState<ReverseModel>("Seedance 2.0 Fast");
  const [reverseDuration, setReverseDuration] = useState<ReverseDuration>("5s");
  const [reverseAspectRatio, setReverseAspectRatio] = useState<AspectRatio>("9:16");
  const [reverseRepeatCount, setReverseRepeatCount] = useState<ReverseRepeatCount>("1");
  const [reverseBatchWaitMinutes, setReverseBatchWaitMinutes] = useState<ReverseBatchWaitMinutes>("20");
  const [mode, setMode] = useState<GenerationMode>("single");
  const [selectedStartKey, setSelectedStartKey] = useState("");
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
  const [showBrowser, setShowBrowser] = useState(true);
  const [logsCollapsed, setLogsCollapsed] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentAction, setCurrentAction] = useState("待命");
  const [progress, setProgress] = useState(0);
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [segmentRunStatuses, setSegmentRunStatuses] = useState<Record<string, SegmentRunStatus>>({});
  const [browserState, setBrowserState] = useState<{
    visible: boolean;
    url?: string;
    loading: boolean;
    error?: string;
  }>({
    visible: false,
    loading: false,
  });

  const browserPlaceholderRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stopRequestedRef = useRef(false);

  const appendLog = useCallback((message: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    setOperationLog((prev) => [...prev, entry]);
  }, []);

  const setSegmentRunStatus = useCallback((segmentKey: string, next: SegmentRunStatus) => {
    setSegmentRunStatuses((prev) => ({
      ...prev,
      [segmentKey]: next,
    }));
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [operationLog]);

  const segmentDefinitions = useMemo<SegmentDefinition[]>(() => {
    const orderedKeys: string[] = [];
    const map = new Map<string, Scene[]>();

    for (const scene of scenes) {
      const key = segmentKeyOf(scene);
      if (!map.has(key)) {
        map.set(key, []);
        orderedKeys.push(key);
      }
      map.get(key)!.push(scene);
    }

    return orderedKeys.map((segmentKey) => {
      const segmentScenes = map.get(segmentKey) || [];

      // Build character references — use costume-specific image and label when available
      const characterRefs: ReverseReference[] = [];
      const seenCharacterKeys = new Set<string>();

      for (const scene of segmentScenes) {
        for (const rawName of scene.characters || []) {
          const normalizedName = normalizeCharacterName(String(rawName || "").trim());
          if (!normalizedName) continue;

          const character = characters.find(
            (item) => normalizeCharacterName(item.name) === normalizedName,
          );
          if (!character) continue;

          // Determine which costume applies to this segment
          const costumeLabel = getPreferredCharacterCostumeLabelForSegment(character, segmentScenes);
          const refLabel = costumeLabel
            ? `${normalizeCharacterName(character.name)} ${costumeLabel}`
            : normalizeCharacterName(character.name);

          if (seenCharacterKeys.has(refLabel)) continue;
          seenCharacterKeys.add(refLabel);

          // Find the costume-specific image, fall back to character default
          let imageUrl = character.imageUrl;
          if (costumeLabel && character.costumes?.length) {
            const costume = character.costumes.find(
              (c) => c.label?.trim() === costumeLabel,
            );
            if (costume?.imageUrl) imageUrl = costume.imageUrl;
          }

          if (!imageUrl) {
            console.log(`[${segmentKey}] 角色 "${refLabel}" 没有图片`);
            continue;
          }

          characterRefs.push({
            kind: "character",
            attachment: "setting-image",
            label: refLabel,
            source: imageUrl,
          });

          if (character.audioUrl) {
            characterRefs.push({
              kind: "character",
              attachment: "audio",
              label: refLabel,
              source: character.audioUrl,
              sourceFileName: character.audioFileName,
            });
          }
        }
      }

      // Build scene reference — use time-variant-specific image and label when available
      const sceneRefs: ReverseReference[] = [];
      const baseSceneName =
        segmentScenes.map((s) => normalizeSceneName(s.sceneName || "")).find(Boolean) || "";

      if (baseSceneName) {
        const matchedScene = findSegmentSceneSetting(segmentScenes, sceneSettings);

        if (matchedScene) {
          const variant = matchSceneTimeVariantForSegment(segmentScenes, sceneSettings);
          const sceneLabel = variant?.label?.trim()
            ? `${normalizeSceneName(matchedScene.name)} ${variant.label.trim()}`
            : normalizeSceneName(matchedScene.name);
          const imageUrl = variant?.imageUrl || matchedScene.imageUrl;

          if (imageUrl) {
            sceneRefs.push({
              kind: "scene",
              attachment: "setting-image",
              label: sceneLabel,
              source: imageUrl,
            });
          } else {
            console.log(`[${segmentKey}] 场景 "${sceneLabel}" 没有图片`);
          }
        } else {
          console.log(`[${segmentKey}] 未找到场景设定: baseSceneName="${baseSceneName}", scene.sceneName="${segmentScenes[0]?.sceneName}", 可用场景:`, sceneSettings.map(s => `"${s.name}"`).join(", "));
        }
      }

      const references = uniqueByKey(
        [...sceneRefs, ...characterRefs],
        (item) => getReferenceKey(item),
      ).slice(0, 12);

      return {
        segmentKey,
        episodeKey: episodeKeyOf(segmentKey),
        scenes: segmentScenes,
        prompt: buildPromptForSegmentWithGroupedReferences(segmentScenes, references),
        references,
      };
    });
  }, [characters, sceneSettings, scenes]);

  useEffect(() => {
    if (!selectedStartKey && segmentDefinitions[0]) {
      setSelectedStartKey(segmentDefinitions[0].segmentKey);
      setSelectedEpisodeKey(segmentDefinitions[0].episodeKey);
    }
  }, [segmentDefinitions, selectedStartKey]);

  useEffect(() => {
    if (!selectedEpisodeKey) return;
    const episodeSegments = segmentDefinitions.filter(
      (item) => item.episodeKey === selectedEpisodeKey,
    );
    if (episodeSegments.length === 0) return;
    const stillValid = episodeSegments.some(
      (item) => item.segmentKey === selectedStartKey,
    );
    if (!stillValid) {
      setSelectedStartKey(episodeSegments[0].segmentKey);
    }
  }, [segmentDefinitions, selectedEpisodeKey, selectedStartKey]);

  useEffect(() => {
    const api = window.electronAPI?.browserView;
    if (!api) return;

    return api.onStateChange((state) => {
      setBrowserState(state);
    });
  }, []);

  const syncBrowserBounds = useCallback(async () => {
    const placeholder = browserPlaceholderRef.current;
    const api = window.electronAPI?.browserView;
    if (!placeholder || !api || !showBrowser) return;

    const rect = placeholder.getBoundingClientRect();
    await api.setBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [showBrowser]);

  useEffect(() => {
    const api = window.electronAPI?.browserView;
    if (!api) return;

    const apply = async () => {
      try {
        if (!showBrowser) {
          await api.hide();
          return;
        }

        await api.create({ url: JIMENG_VIDEO_URL });
        await api.show();
        await syncBrowserBounds();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setBrowserState((prev) => ({
          ...prev,
          visible: false,
          loading: false,
          error: message,
        }));
        appendLog(`程序内浏览器初始化失败: ${message}`);
      }
    };

    void apply();

    const onResize = () => void syncBrowserBounds();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      // CRITICAL: Hide and close browser when component unmounts (navigating away from reverse mode)
      void api.hide().then(() => api.close()).catch(() => {});
    };
  }, [appendLog, showBrowser, syncBrowserBounds]);

  const ensureNotStopped = useCallback(() => {
    if (stopRequestedRef.current) {
      throw new Error("操作已停止");
    }
  }, []);

  const executeNamed = useCallback(
    async <T,>(label: string, script: string, data?: unknown): Promise<T> => {
      const api = window.electronAPI?.browserView;
      if (!api) throw new Error("内嵌浏览器不可用");

      const result = await api.execute<T>({ script, data });
      if (!result.ok) {
        throw new Error(`${label}: ${result.error || "脚本执行失败"}`);
      }

      return result.result as T;
    },
    [],
  );

  const dismissAllPopups = useCallback(async () => {
    await executeNamed<{ ok: boolean }>(
      "关闭所有弹出菜单",
      `(() => {
        try {
          // Press Escape multiple times to close nested popups
          for (let i = 0; i < 3; i++) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }));
          }
          // Click on a neutral area to close any remaining dropdowns
          const neutralArea = document.querySelector('body');
          if (neutralArea) {
            const rect = neutralArea.getBoundingClientRect();
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: rect.width / 2,
              clientY: 50
            });
            neutralArea.dispatchEvent(clickEvent);
          }
        } catch (e) {}
        return { ok: true };
      })()`,
    ).catch(() => null);
  }, [executeNamed]);

  const prepareUploadReferences = useCallback(
    async (definition: SegmentDefinition): Promise<UploadReadyReference[]> => {
      const prepared: UploadReadyReference[] = [];
      const orderedReferences = buildOrderedPromptReferences(definition.references);

      for (let index = 0; index < orderedReferences.length; index += 1) {
        const reference = orderedReferences[index];
        try {
          const dataUrl =
            reference.attachment === "audio"
              ? String(reference.source || "")
              : await compressImage(reference.source, 400 * 1024, { maxDim: 1280 });
          if (!dataUrl.startsWith("data:")) continue;

          const extension = inferExtensionFromDataUrl(
            dataUrl,
            inferExtensionFromFileName(reference.sourceFileName) ||
              inferExtensionFromSource(reference.source),
          );
          const baseName =
            sanitizeFileName(
              `${reference.label || `${definition.segmentKey}-${index + 1}`} ${getReferenceFileSuffix(reference)}`,
            ) ||
            `ref-${index + 1}`;

          prepared.push({
            ...reference,
            dataUrl,
            fileName: `${baseName}${extension}`,
          });
        } catch (error) {
          appendLog(
            `片段 ${definition.segmentKey} 跳过参考素材 ${reference.label}：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return prepared;
    },
    [appendLog],
  );

  const alignToolbarState = useCallback(
    async (segmentKey: string) => {
      const api = window.electronAPI?.browserView;
      if (!api) throw new Error("内嵌浏览器不可用");

      const targets = {
        model: reverseModel,
        duration: reverseDuration,
        aspectRatio: reverseAspectRatio,
      };
      const excludedControlIds = new Set<number>();
      let clickedLeftGenerate = false;
      let lastSignalsKey = "";
      let stuckCount = 0;

      for (let attempt = 1; attempt <= 14; attempt += 1) {
        ensureNotStopped();

        await executeNamed("关闭干扰弹窗", buildDismissInterferingOverlaysScript()).catch(() => null);
        const observation = await captureJimengAgentObservation(targets);

        if (!clickedLeftGenerate) {
          clickedLeftGenerate = true;
          const leftGenerateBtn = observation.controls.find((c) => c.x < 160 && /^生成$/.test(c.text));
          if (leftGenerateBtn) {
            appendLog(`片段 ${segmentKey} 视觉执行 ${attempt}: 强制先点击左侧生成入口 / #${leftGenerateBtn.id}`);
            const result = await executeJimengAgentAction(
              { action: "click_control", controlId: leftGenerateBtn.id, reason: "强制先点击左侧生成入口" },
              observation.controls,
            );
            appendLog(`片段 ${segmentKey} 执行反馈 ${attempt}: ${result.message}`);
            await sleep(1500);
            continue;
          }
        }

        appendLog(
          `片段 ${segmentKey} 视觉观察 ${attempt}: ${
            observation.targetMatched ? "已就绪" : "未就绪"
          } / 命中=${formatSignals(observation.matchedSignals)}`,
        );

        if (observation.targetMatched) {
          return observation;
        }

        // Track stuck state
        const signalsKey = observation.matchedSignals.join(",");
        if (signalsKey === lastSignalsKey) {
          stuckCount += 1;
        } else {
          stuckCount = 0;
          lastSignalsKey = signalsKey;
        }

        const inVideoMode =
          observation.matchedSignals.includes("video-toolbar-entry") &&
          (
            observation.matchedSignals.includes("video-entry") ||
            observation.matchedSignals.includes("seedance-reference") ||
            observation.matchedSignals.includes("reference-content") ||
            observation.matchedSignals.includes("seedance-model")
          );

        // Once in video mode, switch to scripted approach for toolbar settings
        // (scripted DOM manipulation is more reliable than coordinate clicking for dropdowns)
        if (inVideoMode) {
          const toolbarStateBefore = await executeNamed<{
            hasTargetModel: boolean;
            hasTargetDuration: boolean;
            hasTargetAspectRatio: boolean;
            hasReferenceMode: boolean;
            currentModel: string;
            currentDuration: string;
            currentAspectRatio: string;
            currentReference: string;
          }>(
            "read-toolbar-state-before",
            buildReadToolbarStateScript(
              targets.model,
              targets.duration,
              targets.aspectRatio || "16:9",
            ),
          ).catch(() => null);

          if (toolbarStateBefore) {
            appendLog(
              `片段 ${segmentKey} 工具栏预检: 模型=${toolbarStateBefore.currentModel || "(empty)"} / 时长=${toolbarStateBefore.currentDuration} / 比例=${toolbarStateBefore.currentAspectRatio} / 参考=${toolbarStateBefore.currentReference}`,
            );
          }

          const missing = {
            reference: !(toolbarStateBefore?.hasReferenceMode ?? observation.matchedSignals.includes("seedance-reference")),
            duration: !(toolbarStateBefore?.hasTargetDuration ?? observation.matchedSignals.includes(targets.duration)),
            aspectRatio: !(toolbarStateBefore?.hasTargetAspectRatio ?? observation.matchedSignals.includes(targets.aspectRatio || "16:9")),
            model: !(toolbarStateBefore?.hasTargetModel ?? observation.matchedSignals.includes("seedance-model")),
          };

          if (missing.model) {
            appendLog(`片段 ${segmentKey} 脚本设置模型 ${targets.model}`);
            const r = await executeNamed<{ ok: boolean; step: string; debug?: string }>(
              "set-model",
              buildSetModelScript(targets.model),
            ).catch(() => null);
            if (r && !r.ok) appendLog(`片段 ${segmentKey} 模型脚本返回: step=${r.step}${r.debug ? ` / ${r.debug}` : ""}`);
            await sleep(600);
          } else if (missing.reference) {
            appendLog(`片段 ${segmentKey} 脚本设置全能参考`);
            const r = await executeNamed<{ ok: boolean; step: string }>("脚本设置全能参考", buildSetFullReferenceScript()).catch(() => null);
            if (r && !r.ok) appendLog(`片段 ${segmentKey} 全能参考脚本返回: step=${r.step}`);
            await sleep(600);
          } else if (missing.duration) {
            appendLog(`片段 ${segmentKey} 脚本设置时长 ${targets.duration}`);
            const r = await executeNamed<{ ok: boolean; step: string; debug?: string }>("脚本设置时长", buildSetDurationScript(targets.duration)).catch(() => null);
            appendLog(`片段 ${segmentKey} 时长脚本: ok=${r?.ok ?? "null"} step=${r?.step ?? "null"}${r?.debug ? ` debug=${r.debug}` : ""}`);
            await sleep(600);
          } else if (missing.aspectRatio) {
            appendLog(`片段 ${segmentKey} 脚本设置比例 ${targets.aspectRatio || "16:9"}`);
            const r = await executeNamed<{ ok: boolean; step: string }>("脚本设置比例", buildSetAspectRatioScript(targets.aspectRatio || "16:9")).catch(() => null);
            if (r && !r.ok) appendLog(`片段 ${segmentKey} 比例脚本返回: step=${r.step}`);
            await sleep(600);
          }

          // Verify current toolbar state
          const toolbarState = await executeNamed<{
            hasTargetModel: boolean;
            hasTargetDuration: boolean;
            hasTargetAspectRatio: boolean;
            hasReferenceMode: boolean;
            currentDuration: string;
            currentAspectRatio: string;
            currentReference: string;
          }>("读取工具栏状态", buildReadToolbarStateScript(targets.model, targets.duration, targets.aspectRatio || "16:9")).catch(() => null);

          if (toolbarState) {
            appendLog(
              `片段 ${segmentKey} 工具栏状态: 时长=${toolbarState.currentDuration} / 比例=${toolbarState.currentAspectRatio} / 参考=${toolbarState.currentReference}`,
            );
          }

          stuckCount = 0;
          lastSignalsKey = "";
          continue;
        }

        // Not yet in video mode — use visual agent to navigate
        const action = await decideJimengAgentAction(
          observation,
          targets,
          "gemini-3-flash-preview",
          [...excludedControlIds],
        );
        const selectedControl =
          typeof action.controlId === "number"
            ? observation.controls.find((control) => control.id === action.controlId)
            : null;

        appendLog(
          `片段 ${segmentKey} 视觉执行 ${attempt}: ${action.reason}${
            selectedControl ? ` / ${describeControl(selectedControl)}` : ""
          }`,
        );

        const result = await executeJimengAgentAction(action, observation.controls);
        appendLog(`片段 ${segmentKey} 执行反馈 ${attempt}: ${result.message}`);

        if (!result.ok && typeof action.controlId === "number") {
          excludedControlIds.add(action.controlId);
        }

        if (action.action === "done") {
          return observation;
        }

        if (stuckCount >= 3) {
          appendLog(`片段 ${segmentKey} 校准停滞 ${stuckCount} 次，重新打开视频生成页`);
          await api.navigate(JIMENG_VIDEO_URL);
          await sleep(2800); // wait for page reload to complete
          lastSignalsKey = "";
          excludedControlIds.clear();
        } else {
          await sleep(action.action === "wait" ? Math.max(300, action.waitMs || 600) : 900);
        }
      }

      throw new Error(`片段 ${segmentKey} 未能校准到目标工具栏状态`);
    },
    [appendLog, ensureNotStopped, executeNamed, reverseAspectRatio, reverseDuration, reverseModel],
  );

  const fillPromptAndUploadReferences = useCallback(
    async (definition: SegmentDefinition): Promise<PromptTarget> => {
      const browserView = window.electronAPI?.browserView;
      if (!browserView) throw new Error("????????");

      // Dismiss any open popups before starting
      await dismissAllPopups();
      await sleep(200);

      const uploadReferences = await prepareUploadReferences(definition);

      appendLog(
        `?? ${definition.segmentKey} ???? ${uploadReferences.length} ???: ${
          uploadReferences
            .map((item) => `${item.kind}:${item.label}:${getReferenceMentionLabel(item)}`)
            .join(", ") || "?"
        }`,
      );

      const hasSceneReference = definition.references.some((item) => item.kind === "scene");
      if (!hasSceneReference) {
        const sceneName = definition.scenes[0]?.sceneName || "";
        appendLog(
          `?? ${definition.segmentKey} ??: ????????scene.sceneName="${sceneName}", ????: ${sceneSettings
            .map((item) => `"${item.name}"`)
            .join(", ")}`,
        );
      }

      const promptTarget = await executeNamed<PromptTarget>(
        "????????",
        buildLocatePromptAreaScript(),
      );
      if (!promptTarget.ok) {
        throw new Error(`?? ${definition.segmentKey} ?????????`);
      }

      appendLog(
        `?? ${definition.segmentKey} ??????textbox=${promptTarget.textboxIndex} / fileInput=${promptTarget.fileInputIndex}`,
      );

      const resetResult = await executeNamed<{
        ok: boolean;
        step: string;
        removedRefs?: number;
        currentValue?: string;
        debug?: string;
      }>(
        "reset-prompt-area",
        buildResetPromptAreaScript(promptTarget.textboxIndex),
      ).catch(() => null);
      appendLog(
        `片段 ${definition.segmentKey} 重置编辑器: ok=${resetResult?.ok ?? "null"} step=${resetResult?.step ?? "null"} removedRefs=${resetResult?.removedRefs ?? 0}${resetResult?.debug ? ` / ${resetResult.debug}` : ""}`,
      );

      const clearUploadResult = await browserView.setFileInputFiles({
        selector: "input[type='file']",
        index: promptTarget.fileInputIndex,
        files: [],
      });
      if (!clearUploadResult?.ok) {
        throw new Error(clearUploadResult.error || "清空参考图失败");
      }
      await sleep(300);

      if (uploadReferences.length > 0) {
        const uploadResult = await browserView.setFileInputFiles({
          selector: "input[type='file']",
          index: promptTarget.fileInputIndex,
          files: uploadReferences.map((item) => ({
            fileName: item.fileName,
            dataUrl: item.dataUrl,
          })),
        });
        if (!uploadResult?.ok) {
          throw new Error(uploadResult.error || "????????");
        }
        appendLog(`?? ${definition.segmentKey} ??? ${uploadReferences.length} ??????????`);
        await sleep(1500);
      }

      const orderedPromptReferences = buildOrderedPromptReferences(definition.references);
      const bodyPromptText = buildPromptBodyLinesStable(definition.scenes).join(" ");
      const promptBodyForInput = orderedPromptReferences.length > 0
        ? bodyPromptText
        : String(definition.prompt || "").replace(/\s*\n+\s*/g, " ").trim();

      if (orderedPromptReferences.length > 0) {
        const prefixWrite = await executeNamed<{ ok: boolean; error?: string }>(
          "写入标签前缀",
          buildTypePromptScript("场景/人物标签：", promptTarget.textboxIndex, 35, false),
          { prompt: "场景/人物标签：" },
        );
        if (!prefixWrite.ok) {
          throw new Error(`片段 ${definition.segmentKey} 标签前缀写入失败${prefixWrite.error ? `: ${prefixWrite.error}` : ""}`);
        }

        const useLegacySingleMentionInsertion = false;
        for (let index = 0; useLegacySingleMentionInsertion && index < uploadReferences.length; index += 1) {
          const item = uploadReferences[index];
          const leadText = `${index === 0 ? "" : " "}【${item.label} `;
          const leadWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `写入标签 ${item.label}`,
            buildTypePromptScript(leadText, promptTarget.textboxIndex, 35, true),
            { prompt: leadText },
          );
          if (!leadWrite.ok) {
            throw new Error(`片段 ${definition.segmentKey} 标签写入失败 ${item.label}${leadWrite.error ? `: ${leadWrite.error}` : ""}`);
          }

          const mentionResult = await executeNamed<{
            ok: boolean;
            step: string;
            selectedText?: string;
            optionCount?: number;
            debug?: string;
            error?: string;
          }>(
            `插入@设定图 ${item.label}`,
            buildTypeAtMentionScript(item.label, index, promptTarget.textboxIndex),
          );
          if (!mentionResult.ok) {
            throw new Error(
              `片段 ${definition.segmentKey} @设定图插入失败 ${item.label}: ${mentionResult.step}${
                mentionResult.debug ? ` / ${mentionResult.debug}` : ""
              }${mentionResult.error ? ` / ${mentionResult.error}` : ""}`,
            );
          }
          appendLog(`片段 ${definition.segmentKey} 已插入@设定图[${index}]: ${item.label} -> ${mentionResult.selectedText || ""}`);

          const tailWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `补全标签尾部 ${item.label}`,
            buildTypePromptScript("】", promptTarget.textboxIndex, 35, true),
            { prompt: "】" },
          );
          if (!tailWrite.ok) {
            throw new Error(`片段 ${definition.segmentKey} 标签尾部写入失败 ${item.label}${tailWrite.error ? `: ${tailWrite.error}` : ""}`);
          }
        }

        if (false) {
        const groupedUploadReferences = groupPromptReferences(uploadReferences);
        let uploadIndex = 0;

        for (let groupIndex = 0; groupIndex < groupedUploadReferences.length; groupIndex += 1) {
          const group = groupedUploadReferences[groupIndex];
          const openingText = `${groupIndex === 0 ? "" : " "}銆?{group.label} `;
          const openingWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `鍐欏叆鏍囩 ${group.label}`,
            buildTypePromptScript(openingText, promptTarget.textboxIndex, 35, true),
            { prompt: openingText },
          );
          if (!openingWrite.ok) {
            throw new Error(`鐗囨 ${definition.segmentKey} 鏍囩鍐欏叆澶辫触 ${group.label}${openingWrite.error ? `: ${openingWrite.error}` : ""}`);
          }

          for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
            const item = group.items[itemIndex];
            if (itemIndex > 0) {
              const spacerWrite = await executeNamed<{ ok: boolean; error?: string }>(
                `琛ュ叏鏍囩绌烘牸 ${group.label}`,
                buildTypePromptScript(" ", promptTarget.textboxIndex, 35, true),
                { prompt: " " },
              );
              if (!spacerWrite.ok) {
                throw new Error(`鐗囨 ${definition.segmentKey} 鏍囩绌烘牸鍐欏叆澶辫触 ${group.label}${spacerWrite.error ? `: ${spacerWrite.error}` : ""}`);
              }
            }

            const mentionLabel = getReferenceMentionLabel(item);
            const mentionResult = await executeNamed<{
              ok: boolean;
              step: string;
              selectedText?: string;
              optionCount?: number;
              debug?: string;
              error?: string;
            }>(
              `鎻掑叆${mentionLabel} ${item.label}`,
              buildTypeAtMentionScript(item.label, uploadIndex, promptTarget.textboxIndex),
            );
            if (!mentionResult.ok) {
              throw new Error(
                `鐗囨 ${definition.segmentKey} ${mentionLabel}鎻掑叆澶辫触 ${item.label}: ${mentionResult.step}${
                  mentionResult.debug ? ` / ${mentionResult.debug}` : ""
                }${mentionResult.error ? ` / ${mentionResult.error}` : ""}`,
              );
            }
            appendLog(
              `鐗囨 ${definition.segmentKey} 宸叉彃鍏?${mentionLabel}[${uploadIndex}]: ${item.label} -> ${
                mentionResult.selectedText || ""
              }`,
            );
            uploadIndex += 1;
          }

          /* const closingWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `琛ュ叏鏍囩灏鹃儴 ${group.label}`,
            buildTypePromptScript("銆?, promptTarget.textboxIndex, 35, true),
            { prompt: "銆? },
          );
          */
          const closingWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `琛ュ叏鏍囩灏鹃儴 ${group.label}`,
            buildTypePromptScript("\u3011", promptTarget.textboxIndex, 35, true),
            { prompt: "\u3011" },
          );
          if (!closingWrite.ok) {
            throw new Error(`鐗囨 ${definition.segmentKey} 鏍囩灏鹃儴鍐欏叆澶辫触 ${group.label}${closingWrite.error ? `: ${closingWrite.error}` : ""}`);
          }
        }

        }

        const groupedUploadReferences = groupPromptReferences(uploadReferences);
        let uploadIndex = 0;

        for (let groupIndex = 0; groupIndex < groupedUploadReferences.length; groupIndex += 1) {
          const group = groupedUploadReferences[groupIndex];
          const openingText = `${groupIndex === 0 ? "" : " "}\u3010${group.label} `;
          const openingWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `\u5199\u5165\u6807\u7b7e ${group.label}`,
            buildTypePromptScript(openingText, promptTarget.textboxIndex, 35, true),
            { prompt: openingText },
          );
          if (!openingWrite.ok) {
            throw new Error(
              `\u7247\u6bb5 ${definition.segmentKey} \u6807\u7b7e\u5199\u5165\u5931\u8d25 ${group.label}${
                openingWrite.error ? `: ${openingWrite.error}` : ""
              }`,
            );
          }

          for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
            const item = group.items[itemIndex];
            if (itemIndex > 0) {
              const spacerWrite = await executeNamed<{ ok: boolean; error?: string }>(
                `\u8865\u5168\u6807\u7b7e\u7a7a\u683c ${group.label}`,
                buildTypePromptScript(" ", promptTarget.textboxIndex, 35, true),
                { prompt: " " },
              );
              if (!spacerWrite.ok) {
                throw new Error(
                  `\u7247\u6bb5 ${definition.segmentKey} \u6807\u7b7e\u7a7a\u683c\u5199\u5165\u5931\u8d25 ${group.label}${
                    spacerWrite.error ? `: ${spacerWrite.error}` : ""
                  }`,
                );
              }
            }

            const mentionLabel = getReferenceMentionLabelSafe(item);
            const mentionResult = await executeNamed<{
              ok: boolean;
              step: string;
              selectedText?: string;
              optionCount?: number;
              debug?: string;
              error?: string;
            }>(
              `\u63d2\u5165${mentionLabel} ${item.label}`,
              buildTypeAtMentionScript(
                item.label,
                uploadIndex,
                promptTarget.textboxIndex,
                item.attachment === "audio" ? "audio" : "image",
              ),
            );
            if (!mentionResult.ok) {
              throw new Error(
                `\u7247\u6bb5 ${definition.segmentKey} ${mentionLabel}\u63d2\u5165\u5931\u8d25 ${item.label}: ${mentionResult.step}${
                  mentionResult.debug ? ` / ${mentionResult.debug}` : ""
                }${mentionResult.error ? ` / ${mentionResult.error}` : ""}`,
              );
            }
            appendLog(
              `\u7247\u6bb5 ${definition.segmentKey} \u5df2\u63d2\u5165${mentionLabel}[${uploadIndex}]: ${item.label} -> ${
                mentionResult.selectedText || ""
              }`,
            );
            uploadIndex += 1;
          }

          const closingWrite = await executeNamed<{ ok: boolean; error?: string }>(
            `\u8865\u5168\u6807\u7b7e\u5c3e\u90e8 ${group.label}`,
            buildTypePromptScript("\u3011", promptTarget.textboxIndex, 35, true),
            { prompt: "\u3011" },
          );
          if (!closingWrite.ok) {
            throw new Error(
              `\u7247\u6bb5 ${definition.segmentKey} \u6807\u7b7e\u5c3e\u90e8\u5199\u5165\u5931\u8d25 ${group.label}${
                closingWrite.error ? `: ${closingWrite.error}` : ""
              }`,
            );
          }
        }

        const lineBreak = await executeNamed<{ ok: boolean; step?: string }>(
          "插入正文换行",
          buildInsertLineBreakScript(promptTarget.textboxIndex),
        );
        if (!lineBreak.ok) {
          throw new Error(`片段 ${definition.segmentKey} 正文换行失败`);
        }
      }

      const promptWrite = await executeNamed<{
        ok: boolean;
        filled: boolean;
        promptLength: number;
        currentValue?: string;
        error?: string;
      }>(
        "逐字写入提示词正文",
        buildTypePromptScript(
          promptBodyForInput,
          promptTarget.textboxIndex,
          35,
          true,
        ),
        { prompt: promptBodyForInput },
      );
      if (!promptWrite.ok) {
        throw new Error(
          `片段 ${definition.segmentKey} 提示词正文写入失败${
            promptWrite.error ? `: ${promptWrite.error}` : ""
          }`,
        );
      }

      appendLog(`片段 ${definition.segmentKey} 提示词写入完成`);

      // Close any popups that may have opened during typing (e.g., @ mention menus, duration dropdowns)
      await dismissAllPopups();
      await sleep(300);

      return promptTarget;
    },
    [appendLog, dismissAllPopups, executeNamed, prepareUploadReferences, sceneSettings],
  );

  const submitSegmentOnce = useCallback(
    async (
      definition: SegmentDefinition,
      submissionIndex = 1,
      totalSubmissions = 1,
    ) => {
      ensureNotStopped();
      if (totalSubmissions > 1) {
        appendLog(`片段 ${definition.segmentKey} 重复提交 ${submissionIndex}/${totalSubmissions}`);
      }

      appendLog(`开始处理片段 ${definition.segmentKey}`);
      appendLog(
        `片段 ${definition.segmentKey} 目标参数: 模型=${reverseModel} / 时长=${reverseDuration} / 比例=${reverseAspectRatio} / 模式=${
          mode === "auto" ? "自动生成" : "逐段生成"
        }`,
      );
      appendLog(`片段 ${definition.segmentKey} 复用当前生成页面，先校准可见生成器后再操作`);

      await alignToolbarState(definition.segmentKey);
      const promptTarget = await fillPromptAndUploadReferences(definition);

      // Wait for UI to settle after prompt input and @ mentions, then dismiss any lingering popups
      await new Promise((r) => setTimeout(r, 600));
      await dismissAllPopups();
      await new Promise((r) => setTimeout(r, 300));

      const submitResult = await executeNamed<{
        ok: boolean;
        step: string;
        signalTextKey?: string;
        taskIndicatorCount?: number;
        globalSignalTextKey?: string;
        globalSignalNodeCount?: number;
        externalMutationCount?: number;
      }>(
        "提交当前提示词",
        buildSubmitCurrentPromptStrictScript(promptTarget.textboxIndex),
      );

      if (!submitResult.ok) {
        throw new Error(
          `片段 ${definition.segmentKey} 提交失败: ${submitResult.step}${
            submitResult.signalTextKey ? ` / scope=${submitResult.signalTextKey}` : ""
          }${
            submitResult.globalSignalTextKey ? ` / global=${submitResult.globalSignalTextKey}` : ""
          }${
            typeof submitResult.externalMutationCount === "number"
              ? ` / mutations=${submitResult.externalMutationCount}`
              : ""
          }`,
        );
      }

      appendLog(
        `片段 ${definition.segmentKey} 已提交 / step=${submitResult.step}${
          submitResult.globalSignalTextKey ? ` / global=${submitResult.globalSignalTextKey}` : ""
        }${
          typeof submitResult.externalMutationCount === "number"
            ? ` / mutations=${submitResult.externalMutationCount}`
            : ""
        }`,
      );
      pendingGenerationTasksRef.current.push({
        taskKey: `${definition.segmentKey}#${submissionIndex}`,
        segmentKey: definition.segmentKey,
        episodeKey: definition.episodeKey,
      });
      setSegmentRunStatus(definition.segmentKey, {
        state: "submitted",
        detail: `已提交 ${submissionIndex}/${totalSubmissions}`,
      });
      return;

      const beforeSubmitState = await executeNamed<{
        ok: boolean;
        step: string;
        promptValue?: string;
        signalTextKey?: string;
        taskIndicatorCount?: number;
        hasPostSubmitSignals?: boolean;
        submitButton?: null | { disabled?: boolean; className?: string; text?: string };
      }>(
        "?????",
        buildReadPromptScopeStateScript(promptTarget.textboxIndex),
      );

      // Click via JS click() first (most reliable for React apps), then verify
      const clickResult = await executeNamed<{
        ok: boolean;
        step: string;
        clickX?: number;
        clickY?: number;
        btnText?: string;
        btnClass?: string;
      }>(
        "点击提交按钮",
        buildClickSubmitButtonScript(promptTarget.textboxIndex),
      );

      if (!clickResult.ok) {
        throw new Error(`片段 ${definition.segmentKey} 未找到提交按钮: ${clickResult.step}`);
      }

      appendLog(`片段 ${definition.segmentKey} 点击提交按钮 @(${clickResult.clickX},${clickResult.clickY}) text="${clickResult.btnText}" class="${clickResult.btnClass}"`);

      const hasSubmitStateChange = (after: {
        ok: boolean;
        step: string;
        promptValue?: string;
        signalTextKey?: string;
        taskIndicatorCount?: number;
        hasPostSubmitSignals?: boolean;
        submitButton?: null | { disabled?: boolean; className?: string; text?: string };
      }) => {
        const textboxGone = !after.ok || after.step === "textbox-not-found";
        const submitGone = !after.submitButton;
        const submitDisabled =
          !!after.submitButton?.disabled &&
          after.submitButton?.disabled !== beforeSubmitState.submitButton?.disabled;
        const submitChanged =
          after.submitButton?.className !== beforeSubmitState.submitButton?.className ||
          after.submitButton?.text !== beforeSubmitState.submitButton?.text;
        const signalsChanged =
          after.signalTextKey !== beforeSubmitState.signalTextKey ||
          (after.taskIndicatorCount || 0) !== (beforeSubmitState.taskIndicatorCount || 0);
        const promptChanged =
          normalizeText(after.promptValue || "") !== normalizeText(beforeSubmitState.promptValue || "");

        return (
          textboxGone ||
          submitGone ||
          !!after.hasPostSubmitSignals ||
          submitDisabled ||
          submitChanged ||
          signalsChanged ||
          (promptChanged && (submitDisabled || signalsChanged || !!after.hasPostSubmitSignals))
        );
      };

      const probeForSubmission = async (timeoutMs: number) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 200));
          const after = await executeNamed<{
            ok: boolean;
            step: string;
            promptValue?: string;
            signalTextKey?: string;
            taskIndicatorCount?: number;
            hasPostSubmitSignals?: boolean;
            submitButton?: null | { disabled?: boolean; className?: string; text?: string };
          }>(
            "?????",
            buildReadPromptScopeStateScript(promptTarget.textboxIndex),
          );
          if (hasSubmitStateChange(after)) {
            return true;
          }
        }
        return false;
      };

      let submitted = await probeForSubmission(1200);

      const api = window.electronAPI?.browserView;
      if (!submitted && api && clickResult.clickX != null && clickResult.clickY != null) {
        appendLog(`鐗囨 ${definition.segmentKey} JS 点击后未检测到变化，补发一次原生点击`);
        await api.sendInputEvents([
          { type: "mouseMove", x: clickResult.clickX, y: clickResult.clickY },
          { type: "mouseDown", x: clickResult.clickX, y: clickResult.clickY, button: "left", clickCount: 1 },
          { type: "mouseUp", x: clickResult.clickX, y: clickResult.clickY, button: "left", clickCount: 1 },
        ]);
        submitted = await probeForSubmission(7000);
      }

      if (!submitted) {
        throw new Error(`片段 ${definition.segmentKey} 提交失败: 点击后页面无变化`);
      }

      appendLog(`片段 ${definition.segmentKey} 已提交`);
    },
    [
      alignToolbarState,
      appendLog,
      dismissAllPopups,
      ensureNotStopped,
      executeNamed,
      fillPromptAndUploadReferences,
      mode,
      reverseAspectRatio,
      reverseDuration,
      reverseModel,
      setSegmentRunStatus,
    ],
  );

  const repeatSubmitPreparedPrompt = useCallback(
    async (segmentKey: string, submissionIndex: number, totalSubmissions: number) => {
      ensureNotStopped();
      const promptTarget = await executeNamed<PromptTarget>(
        "定位已输入的提示词区域",
        buildLocatePromptAreaScript(),
      );
      if (!promptTarget.ok) {
        throw new Error(`片段 ${segmentKey} 重复提交失败: 未找到提示词输入区域`);
      }

      appendLog(`片段 ${segmentKey} 重复提交 ${submissionIndex}/${totalSubmissions}：直接再次点击发送`);
      const result = await executeNamed<{
        ok: boolean;
        step: string;
        beforeValue?: string;
        afterValue?: string;
      }>(
        "重复提交当前提示词",
        buildSubmitCurrentPromptStrictScript(promptTarget.textboxIndex),
      );

      if (!result.ok) {
        throw new Error(`片段 ${segmentKey} 重复提交失败: ${result.step}`);
      }

      appendLog(`片段 ${segmentKey} 已完成重复提交 ${submissionIndex}/${totalSubmissions}`);
    },
    [appendLog, ensureNotStopped, executeNamed],
  );

  const startReverseMode = useCallback(async () => {
    const api = window.electronAPI?.browserView;
    if (!api) throw new Error("请在 Electron 应用中使用逆向模式");
    if (!selectedStartKey) throw new Error("请先选择起始片段");

    setIsRunning(true);
    stopRequestedRef.current = false;
    setCurrentAction("准备中");
    setProgress(0);
    setOperationLog([]);
    setSegmentRunStatuses({});

    try {
      await api.create({ url: JIMENG_VIDEO_URL });
      await api.show();
      await syncBrowserBounds();
      appendLog("已启动程序内实时浏览器");
      await sleep(2500); // wait for page initial load
      const startIndex = segmentDefinitions.findIndex(
        (item) => item.segmentKey === selectedStartKey,
      );
      const targets =
        mode === "single"
          ? segmentDefinitions.filter((item) => item.segmentKey === selectedStartKey)
          : segmentDefinitions.slice(Math.max(0, startIndex));

      if (targets.length === 0) {
        throw new Error("当前起始片段之后没有可执行任务");
      }

      const repeatCount = Number(reverseRepeatCount);
      const batchWaitMinutes = Number(reverseBatchWaitMinutes);
      const batchWaitMs = batchWaitMinutes * 60 * 1000;
      const totalRuns = Math.max(1, targets.length * repeatCount);
      let completedRuns = 0;
      let runsInCurrentBatch = 0;

      for (let index = 0; index < targets.length; index += 1) {
        ensureNotStopped();
        const definition = targets[index];
        setCurrentAction(`处理中 ${definition.segmentKey}`);
        setProgress(Math.round((completedRuns / Math.max(1, totalRuns)) * 100));

        for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
          ensureNotStopped();
          if (completedRuns > 0) {
            if (runsInCurrentBatch >= REVERSE_BATCH_SIZE) {
              appendLog(`已连续提交 ${REVERSE_BATCH_SIZE} 个视频，等待 ${batchWaitMinutes} 分钟后继续下一组`);
              setCurrentAction(`组间等待 ${batchWaitMinutes} 分钟`);
              await sleep(batchWaitMs);
              runsInCurrentBatch = 0;
            } else {
              appendLog(`将在 5s 后开始下一个视频的输入与提交`);
              setCurrentAction("等待 5 秒后继续");
              await sleep(INTER_VIDEO_DELAY_MS);
            }
          }
          setCurrentAction(
            repeatCount > 1
              ? `澶勭悊涓?${definition.segmentKey}（${repeatIndex}/${repeatCount}）`
              : `澶勭悊涓?${definition.segmentKey}`,
          );
          if (repeatIndex === 1) {
            await submitSegmentOnce(definition, repeatIndex, repeatCount);
          } else {
            await repeatSubmitPreparedPrompt(
              definition.segmentKey,
              repeatIndex,
              repeatCount,
            );
            setSegmentRunStatus(definition.segmentKey, {
              state: "submitted",
              detail: `已提交 ${repeatIndex}/${repeatCount}`,
            });
          }
          completedRuns += 1;
          runsInCurrentBatch += 1;
          setProgress(Math.round((completedRuns / Math.max(1, totalRuns)) * 100));
        }

        if (false && mode === "auto" && index < targets.length - 1) {
          appendLog(`片段 ${definition.segmentKey} 已提交，下一段前重新进入视频生成页`);
          await api.navigate(JIMENG_VIDEO_URL);
          await sleep(1800);
        }
      }

      if (false && pendingGenerationTasksRef.current.length > 0) {
        setCurrentAction("监控生成结果");
        appendLog(`开始监控生成结果，待观察 ${pendingGenerationTasksRef.current.length} 个任务`);
        await sleep(batchWaitMs);
      }

      setProgress(100);
      setCurrentAction("执行完成");
      toast({
        title: "逆向模式执行完成",
        description: `已完成 ${targets.length} 个片段的提交。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`Error: ${message}`);
      setCurrentAction("执行失败");
      toast({
        title: "逆向模式执行失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }, [
    appendLog,
    ensureNotStopped,
    mode,
    reverseBatchWaitMinutes,
    reverseRepeatCount,
    repeatSubmitPreparedPrompt,
    segmentDefinitions,
    setSegmentRunStatus,
    selectedStartKey,
    submitSegmentOnce,
    syncBrowserBounds,
  ]);

  const toggleBrowser = useCallback(async () => {
    const api = window.electronAPI?.browserView;
    if (!api) return;

    if (showBrowser) {
      await api.hide();
      setShowBrowser(false);
      return;
    }

    await api.show();
    await syncBrowserBounds();
    setShowBrowser(true);
  }, [showBrowser, syncBrowserBounds]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>逆向模式</span>
            <div className="flex items-center gap-2">
              <Badge variant={browserState.visible ? "default" : "secondary"}>
                {browserState.visible ? "浏览器可见" : "浏览器隐藏"}
              </Badge>
              <Button variant="outline" size="sm" onClick={toggleBrowser} className="gap-1">
                {showBrowser ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showBrowser ? "隐藏浏览器" : "显示浏览器"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-7">
            <div className="space-y-2">
              <label className="text-sm">起始片段</label>
              <div className="flex gap-1">
                <Select
                  value={selectedEpisodeKey}
                  onValueChange={(ep) => {
                    setSelectedEpisodeKey(ep);
                    const first = segmentDefinitions.find((d) => d.episodeKey === ep);
                    if (first) setSelectedStartKey(first.segmentKey);
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue placeholder="集" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(segmentDefinitions.map((d) => d.episodeKey))).map((ep) => (
                      <SelectItem key={ep} value={ep}>
                        第{ep}集
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  key={selectedEpisodeKey || "no-episode"}
                  value={selectedStartKey}
                  onValueChange={setSelectedStartKey}
                  disabled={!selectedEpisodeKey}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="段落" />
                  </SelectTrigger>
                  <SelectContent>
                    {segmentDefinitions
                      .filter((d) => d.episodeKey === selectedEpisodeKey)
                      .map((definition) => {
                        const segNum = definition.segmentKey.split("-").slice(1).join("-");
                        const segmentState = segmentRunStatuses[definition.segmentKey]?.state;
                        return (
                          <SelectItem
                            key={definition.segmentKey}
                            value={definition.segmentKey}
                            className={segmentStateClassName(segmentState)}
                          >
                            第{segNum}段
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm">模型</label>
              <Select
                value={reverseModel}
                onValueChange={(value) => setReverseModel(value as ReverseModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm">时长</label>
              <Select
                value={reverseDuration}
                onValueChange={(value) => setReverseDuration(value as ReverseDuration)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm">比例</label>
              <Select
                value={reverseAspectRatio}
                onValueChange={(value) => setReverseAspectRatio(value as AspectRatio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm">模式</label>
              <Select value={mode} onValueChange={(value) => setMode(value as GenerationMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">逐段生成</SelectItem>
                  <SelectItem value="auto">自动生成</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm">重复次数</label>
              <Select
                value={reverseRepeatCount}
                onValueChange={(value) => setReverseRepeatCount(value as ReverseRepeatCount)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_COUNT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm">每组等待</label>
              <Select
                value={reverseBatchWaitMinutes}
                onValueChange={(value) => setReverseBatchWaitMinutes(value as ReverseBatchWaitMinutes)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BATCH_WAIT_MINUTE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} 分钟
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => void startReverseMode()} disabled={isRunning} className="gap-2">
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {mode === "auto" ? "开始自动生成" : "开始逐段生成"}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                stopRequestedRef.current = true;
                setCurrentAction("已停止");
              }}
              disabled={!isRunning}
            >
              停止
            </Button>

            <Button
              variant="outline"
              onClick={async () => {
                const api = window.electronAPI?.browserView;
                if (!api) return;
                await api.navigate(JIMENG_VIDEO_URL);
                await sleep(1200);
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              重载页面
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{currentAction}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLogsCollapsed((prev) => !prev)}
              className="gap-2 text-muted-foreground"
            >
              {logsCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {logsCollapsed ? "显示日志" : "收起日志"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div
            ref={browserPlaceholderRef}
            className="h-[720px] w-full rounded-md border bg-muted/10"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>执行日志</CardTitle>
        </CardHeader>
        <CardContent className={logsCollapsed ? "hidden" : undefined}>
          <ScrollArea className="h-[280px] rounded-md border p-3">
            <div ref={logRef} className="space-y-2 whitespace-pre-wrap text-xs">
              {operationLog.length === 0 ? (
                <div className="text-muted-foreground">暂无日志</div>
              ) : (
                operationLog.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
