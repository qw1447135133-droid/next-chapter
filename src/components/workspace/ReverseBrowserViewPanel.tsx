import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Play, RefreshCw } from "lucide-react";
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
  buildLocatePromptAreaScript,
  buildReadPromptScopeStateScript,
  buildReadPromptValueScript,
  buildReadToolbarStateScript,
  buildSetAspectRatioScript,
  buildSetDurationScript,
  buildSetFullReferenceScript,
  buildSetModelScript,
  buildSubmitCurrentPromptStrictScript,
  buildTypeAtMentionScript,
  buildTypePromptData,
  buildTypePromptScript,
} from "@/lib/reverse-browserview-scripts";
import {
  findSceneSetting,
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

interface ReverseReference {
  kind: ReverseReferenceKind;
  label: string;
  source: string;
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
  projectId?: string;
}

interface PromptTarget {
  ok: boolean;
  fileInputIndex: number;
  scopedFileCount: number;
  textboxIndex: number;
}

const JIMENG_HOME_URL = "https://jimeng.jianying.com/ai-tool/home";
const JIMENG_VIDEO_URL = `${JIMENG_HOME_URL}?type=video&workspace=0`;
const MODEL_OPTIONS: ReverseModel[] = ["Seedance 2.0", "Seedance 2.0 Fast"];
const DURATION_OPTIONS: ReverseDuration[] = ["5s", "10s", "15s"];
const ASPECT_RATIO_OPTIONS: AspectRatio[] = ["16:9", "9:16", "3:2", "2:3"];

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
  return ".jpg";
}

function inferExtensionFromDataUrl(dataUrl: string, fallback: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  const mime = match?.[1]?.toLowerCase() || "";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return fallback;
}

function normalizeText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildPromptForSegment(segmentScenes: Scene[], references: ReverseReference[]): string {
  const sceneTags = uniqueByKey(
    references.filter((item) => item.kind === "scene"),
    (item) => `${item.kind}:${item.label}`,
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

function formatSignals(signals: string[]): string {
  return signals.length > 0 ? signals.join(" / ") : "无";
}

function describeControl(control?: JimengAgentControl | null): string {
  if (!control) return "";
  const label = control.text || control.ariaLabel || control.placeholder || "(empty)";
  return `#${control.id} ${label} @(${control.x},${control.y})`;
}

export default function ReverseBrowserViewPanel({
  scenes,
  characters,
  sceneSettings,
}: ReverseBrowserViewPanelProps) {
  const [reverseModel, setReverseModel] = useState<ReverseModel>("Seedance 2.0 Fast");
  const [reverseDuration, setReverseDuration] = useState<ReverseDuration>("5s");
  const [reverseAspectRatio, setReverseAspectRatio] = useState<AspectRatio>("9:16");
  const [mode, setMode] = useState<GenerationMode>("single");
  const [selectedStartKey, setSelectedStartKey] = useState("");
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
  const [showBrowser, setShowBrowser] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentAction, setCurrentAction] = useState("待命");
  const [progress, setProgress] = useState(0);
  const [operationLog, setOperationLog] = useState<string[]>([]);
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

          characterRefs.push({ kind: "character", label: refLabel, source: imageUrl });
        }
      }

      // Build scene reference — use time-variant-specific image and label when available
      const sceneRefs: ReverseReference[] = [];
      const baseSceneName =
        segmentScenes.map((s) => normalizeSceneName(s.sceneName || "")).find(Boolean) || "";

      if (baseSceneName) {
        // Try exact match, then prefix match, then fuzzy character overlap
        let matchedScene = findSceneSetting(segmentScenes[0], sceneSettings);
        if (!matchedScene) {
          matchedScene = sceneSettings.find((item) => {
            const settingName = normalizeSceneName(item.name || "");
            return settingName && baseSceneName.startsWith(settingName);
          }) || null;
        }
        if (!matchedScene) {
          // Fuzzy: find scene setting with most character overlap with baseSceneName
          let bestScore = 0;
          for (const item of sceneSettings) {
            const settingName = normalizeSceneName(item.name || "");
            if (!settingName) continue;
            // Count shared characters (simple overlap score)
            let shared = 0;
            for (const ch of settingName) {
              if (baseSceneName.includes(ch)) shared++;
            }
            const score = shared / Math.max(settingName.length, baseSceneName.length);
            if (score > bestScore && score >= 0.5) {
              bestScore = score;
              matchedScene = item;
            }
          }
        }

        if (matchedScene) {
          const variant = matchSceneTimeVariantForSegment(segmentScenes, sceneSettings);
          const sceneLabel = variant?.label?.trim()
            ? `${normalizeSceneName(matchedScene.name)} ${variant.label.trim()}`
            : normalizeSceneName(matchedScene.name);
          const imageUrl = variant?.imageUrl || matchedScene.imageUrl;

          if (imageUrl) {
            sceneRefs.push({ kind: "scene", label: sceneLabel, source: imageUrl });
          } else {
            console.log(`[${segmentKey}] 场景 "${sceneLabel}" 没有图片`);
          }
        } else {
          console.log(`[${segmentKey}] 未找到场景设定: baseSceneName="${baseSceneName}", scene.sceneName="${segmentScenes[0]?.sceneName}", 可用场景:`, sceneSettings.map(s => `"${s.name}"`).join(", "));
        }
      }

      const references = uniqueByKey(
        [...sceneRefs, ...characterRefs],
        (item) => `${item.kind}:${item.label}`,
      ).slice(0, 12);

      return {
        segmentKey,
        episodeKey: episodeKeyOf(segmentKey),
        scenes: segmentScenes,
        prompt: buildPromptForSegment(segmentScenes, references),
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
      if (!showBrowser) {
        await api.hide();
        return;
      }

      await api.create({ url: JIMENG_VIDEO_URL });
      await api.show();
      await syncBrowserBounds();
    };

    void apply();

    const onResize = () => void syncBrowserBounds();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      // Hide browser when component unmounts (navigating away from reverse mode)
      void api.hide();
    };
  }, [showBrowser, syncBrowserBounds]);

  // Temporarily hide BrowserView when UI dropdowns/popovers open so they aren't obscured
  useEffect(() => {
    if (!showBrowser) return;
    const api = window.electronAPI?.browserView;
    if (!api) return;

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const placeholder = browserPlaceholderRef.current;
      if (!placeholder) return;
      const target = e.target as Element | null;
      if (!target) return;
      // Only hide when clicking an interactive control outside the BrowserView placeholder
      const isInteractive =
        target.closest("button, [role='button'], select, [role='combobox'], [role='listbox'], [role='option'], input, textarea, label, a") !== null;
      if (!isInteractive) return;
      if (placeholder.contains(target)) return;
      void api.hide();
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        void api.show().then(() => syncBrowserBounds());
      }, 800);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [showBrowser, syncBrowserBounds]);

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

  const prepareUploadReferences = useCallback(
    async (definition: SegmentDefinition): Promise<UploadReadyReference[]> => {
      const prepared: UploadReadyReference[] = [];

      for (let index = 0; index < definition.references.length; index += 1) {
        const reference = definition.references[index];
        try {
          const dataUrl = await compressImage(reference.source, 400 * 1024, { maxDim: 1280 });
          if (!dataUrl.startsWith("data:")) continue;

          const extension = inferExtensionFromDataUrl(
            dataUrl,
            inferExtensionFromSource(reference.source),
          );
          const baseName =
            sanitizeFileName(reference.label || `${definition.segmentKey}-${index + 1}`) ||
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
          observation.matchedSignals.includes("video-entry") &&
          observation.matchedSignals.includes("seedance-model");

        // Once in video mode, switch to scripted approach for toolbar settings
        // (scripted DOM manipulation is more reliable than coordinate clicking for dropdowns)
        if (inVideoMode) {
          const missing = {
            reference: !observation.matchedSignals.includes("seedance-reference"),
            duration: !observation.matchedSignals.includes(targets.duration),
            aspectRatio: !observation.matchedSignals.includes(targets.aspectRatio || "16:9"),
            model: !observation.matchedSignals.includes("seedance-model"),
          };

          if (missing.reference) {
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
      if (!browserView) throw new Error("内嵌浏览器不可用");

      const uploadReferences = await prepareUploadReferences(definition);

      appendLog(
        `片段 ${definition.segmentKey} 准备上传 ${uploadReferences.length} 个引用: ${uploadReferences.map((r) => `${r.kind}:${r.label}`).join(", ") || "无"}`,
      );

      // Warn if scene reference is missing
      const hasScene = definition.references.some((r) => r.kind === "scene");
      if (!hasScene) {
        const sceneName = definition.scenes[0]?.sceneName || "";
        appendLog(`片段 ${definition.segmentKey} 警告: 未找到场景引用，scene.sceneName="${sceneName}", 可用场景: ${sceneSettings.map((s) => `"${s.name}"`).join(", ")}`);
      }

      const promptTarget = await executeNamed<PromptTarget>(
        "定位提示词输入区",
        buildLocatePromptAreaScript(),
      );

      if (!promptTarget.ok) {
        throw new Error(`片段 ${definition.segmentKey} 未找到提示词输入区`);
      }

      appendLog(
        `片段 ${definition.segmentKey} 提示词区域：textbox=${promptTarget.textboxIndex} / fileInput=${promptTarget.fileInputIndex}`,
      );

      // Step 1: Upload all reference images via file input first
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
          throw new Error(uploadResult?.error || "上传参考素材失败");
        }

        appendLog(`片段 ${definition.segmentKey} 已上传 ${uploadReferences.length} 个参考素材，等待处理`);
        // Wait for images to be processed and available in the @ mention dropdown
        await new Promise((r) => setTimeout(r, 1500));
      }

      // Step 2: Type the prompt with inline @ mentions after each tag
      // Split prompt into: tag line (first line) + rest
      const promptLines = definition.prompt.split("\n");
      const tagLine = promptLines[0] || "";
      const restPrompt = promptLines.slice(1).join("\n");

      // Write the tag line char by char, then insert @ for each reference after its label
      const tagLineScript = buildTypePromptScript(tagLine, promptTarget.textboxIndex, 20);
      appendLog(`片段 ${definition.segmentKey} 标签行脚本长度: ${tagLineScript.length}`);
      const tagLineResult = await executeNamed<{ ok: boolean; error?: string }>(
        "写入标签行",
        tagLineScript,
        buildTypePromptData(tagLine),
      );
      if (!tagLineResult.ok) {
        throw new Error(`片段 ${definition.segmentKey} 标签行写入失败: ${tagLineResult.error || "未知"}`);
      }

      // Insert @ mention for each reference immediately after the tag line
      for (let refIndex = 0; refIndex < uploadReferences.length; refIndex++) {
        const ref = uploadReferences[refIndex];
        const mentionResult = await executeNamed<{
          ok: boolean;
          step: string;
          selectedText?: string;
          optionCount?: number;
          error?: string;
        }>(
          `插入@引用 ${ref.label}`,
          buildTypeAtMentionScript(ref.label, refIndex, promptTarget.textboxIndex),
        );
        if (mentionResult.ok) {
          appendLog(`片段 ${definition.segmentKey} 已插入@引用[${refIndex}]: ${ref.label} → ${mentionResult.selectedText || ""} (共${mentionResult.optionCount ?? "?"}个选项)`);
        } else {
          appendLog(`片段 ${definition.segmentKey} @引用插入失败 ${ref.label}: step=${mentionResult.step}`);
        }
      }

      // Write the rest of the prompt (scene descriptions etc.)
      if (restPrompt) {
        const restResult = await executeNamed<{ ok: boolean; filled: boolean; promptLength: number; error?: string }>(
          "逐字写入提示词正文",
          buildTypePromptScript("\n" + restPrompt, promptTarget.textboxIndex, 20, true),
          buildTypePromptData("\n" + restPrompt),
        );
        if (!restResult.ok) {
          throw new Error(`片段 ${definition.segmentKey} 提示词正文写入失败: ${restResult.error || "未知"}`);
        }
        appendLog(`片段 ${definition.segmentKey} 已逐字写入 ${restResult.promptLength} 个字符`);
      }

      return promptTarget;
    },
    [appendLog, executeNamed, prepareUploadReferences, sceneSettings],
  );

  const submitSegmentOnce = useCallback(
    async (definition: SegmentDefinition) => {
      ensureNotStopped();

      appendLog(`开始处理片段 ${definition.segmentKey}`);
      appendLog(
        `片段 ${definition.segmentKey} 目标参数: 模型=${reverseModel} / 时长=${reverseDuration} / 比例=${reverseAspectRatio} / 模式=${
          mode === "auto" ? "自动生成" : "逐段生成"
        }`,
      );
      appendLog(`片段 ${definition.segmentKey} 复用当前生成页面，先校准可见生成器后再操作`);

      await alignToolbarState(definition.segmentKey);
      const promptTarget = await fillPromptAndUploadReferences(definition);

      // Wait for UI to settle after prompt input and @ mentions
      await new Promise((r) => setTimeout(r, 600));

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

      // Also send real mouse events as backup
      const api = window.electronAPI?.browserView;
      if (api && clickResult.clickX != null && clickResult.clickY != null) {
        await api.sendInputEvents([
          { type: "mouseMove", x: clickResult.clickX, y: clickResult.clickY },
          { type: "mouseDown", x: clickResult.clickX, y: clickResult.clickY, button: "left", clickCount: 1 },
          { type: "mouseUp", x: clickResult.clickX, y: clickResult.clickY, button: "left", clickCount: 1 },
        ]);
      }

      // Wait and verify submission
      let submitted = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        const after = await executeNamed<{ ok: boolean; step: string; submitButton: null | object }>(
          "验证提交状态",
          buildReadPromptScopeStateScript(promptTarget.textboxIndex),
        );
        // Success: textbox gone (page navigated) or submit button disappeared
        if (!after.ok || after.step === "textbox-not-found" || !after.submitButton) {
          submitted = true;
          break;
        }
      }

      if (!submitted) {
        throw new Error(`片段 ${definition.segmentKey} 提交失败: 点击后页面无变化`);
      }

      appendLog(`片段 ${definition.segmentKey} 已提交`);
    },
    [
      alignToolbarState,
      appendLog,
      ensureNotStopped,
      executeNamed,
      fillPromptAndUploadReferences,
      mode,
      reverseAspectRatio,
      reverseDuration,
      reverseModel,
    ],
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

      for (let index = 0; index < targets.length; index += 1) {
        ensureNotStopped();
        const definition = targets[index];
        setCurrentAction(`处理中 ${definition.segmentKey}`);
        setProgress(Math.round((index / Math.max(1, targets.length)) * 100));

        await submitSegmentOnce(definition);

        if (mode === "auto" && index < targets.length - 1) {
          appendLog(`片段 ${definition.segmentKey} 已提交，下一段前重新进入视频生成页`);
          await api.navigate(JIMENG_VIDEO_URL);
          await sleep(1800);
        }
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
    segmentDefinitions,
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
          <div className="grid gap-3 md:grid-cols-5">
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
                        return (
                          <SelectItem key={definition.segmentKey} value={definition.segmentKey}>
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
        <CardContent>
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
