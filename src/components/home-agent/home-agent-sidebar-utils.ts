import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { ConversationProjectSnapshot } from "@/lib/home-agent/types";
import { readCachedThumbnailDataUrl } from "@/lib/upload-base64-to-storage";

type SidebarAssetBase = {
  id: string;
  label: string;
  meta: string;
};

export type SidebarAssetItem =
  | (SidebarAssetBase & {
      kind: "image" | "video";
      url: string;
    })
  | (SidebarAssetBase & {
      kind: "bundle";
      path: string;
    });

export function isLocalSidebarAssetUrl(url: string | undefined): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  return url.startsWith("file://") || /^[A-Za-z]:[\\/]/.test(url) || /^\\\\/.test(url);
}

export function normalizeSidebarAssetPath(url: string): string {
  if (!isLocalSidebarAssetUrl(url)) return url;
  if (!url.startsWith("file://")) return url;

  let normalized = decodeURIComponent(url.replace(/^file:\/\/+/, ""));
  if (/^\/[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.slice(1);
  }
  return normalized.replace(/\//g, "\\");
}

export async function resolveSidebarAssetPreviewUrl(
  asset: SidebarAssetItem,
  projectId?: string,
): Promise<string | null> {
  if (asset.kind !== "image") return null;
  if (!asset.url) return null;
  if (!isLocalSidebarAssetUrl(asset.url)) return asset.url;
  if (!window.electronAPI?.storage?.readBase64) return null;

  const normalizedPath = normalizeSidebarAssetPath(asset.url);
  const cachedThumbnail = await readCachedThumbnailDataUrl(normalizedPath, projectId);
  if (cachedThumbnail) return cachedThumbnail;

  const result = await window.electronAPI.storage.readBase64(normalizedPath);
  if (!result?.ok || !result?.base64) return null;
  return `data:${result.mimeType || "image/jpeg"};base64,${result.base64}`;
}

function formatBundleMeta(videoProject: PersistedVideoProject): string {
  const bundle = videoProject.productionStateBundle;
  if (!bundle) return "可续接状态";

  const segments = [`${bundle.exportedCount} 个文件`];
  if (bundle.overviewPath) {
    segments.push("含索引摘要");
  }
  segments.push("可续接状态");
  return segments.join(" · ");
}

export function collectConversationAssets(
  videoProject: PersistedVideoProject | null | undefined,
  projectSnapshot?: ConversationProjectSnapshot | null,
): SidebarAssetItem[] {
  const items: SidebarAssetItem[] = [];
  const seen = new Set<string>();
  const manifest = projectSnapshot?.memory?.assetManifest;
  if (videoProject?.productionStateBundle?.directoryPath) {
    items.push({
      id: `bundle-${videoProject.id}`,
      kind: "bundle",
      label: "生产状态包",
      path: videoProject.productionStateBundle.directoryPath,
      meta: formatBundleMeta(videoProject),
    });
  }

  if (manifest?.items.length) {
    manifest.items.slice(0, 18).forEach((item) => {
      if (seen.has(item.url)) return;
      seen.add(item.url);
      items.push({
        id: item.id,
        kind: item.kind === "video-segment" ? "video" : "image",
        label: item.label,
        url: item.url,
        meta: [item.meta, item.reusable ? "可复用" : "当前镜头", item.status === "failed" ? "待修复" : ""]
          .filter(Boolean)
          .join(" · "),
      });
    });
    return items.slice(0, 24);
  }

  if (!videoProject) return items;

  const pushAsset = (kind: "image" | "video", label: string, url?: string, meta = "") => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({
      id: `${kind}-${items.length}-${label}`,
      kind,
      label,
      url,
      meta,
    });
  };

  videoProject.characters.forEach((character) => {
    pushAsset("image", `${character.name} 角色图`, character.imageUrl, "角色");
    character.imageHistory?.forEach((entry) =>
      pushAsset("image", `${character.name} 历史图`, entry.imageUrl, "角色历史"),
    );
    Object.entries(character.threeViewUrls ?? {}).forEach(([view, url]) =>
      pushAsset("image", `${character.name} ${view}`, url, "三视图"),
    );
    character.costumes?.forEach((costume) => {
      pushAsset("image", `${character.name} · ${costume.label}`, costume.imageUrl, "服装");
      costume.imageHistory?.forEach((entry) =>
        pushAsset("image", `${character.name} · ${costume.label}`, entry.imageUrl, "服装历史"),
      );
    });
  });

  videoProject.sceneSettings.forEach((scene) => {
    pushAsset("image", `${scene.name} 场景图`, scene.imageUrl, "场景");
    scene.imageHistory?.forEach((entry) =>
      pushAsset("image", `${scene.name} 历史图`, entry.imageUrl, "场景历史"),
    );
    scene.timeVariants?.forEach((variant) => {
      pushAsset("image", `${scene.name} · ${variant.label}`, variant.imageUrl, "时间变体");
      variant.imageHistory?.forEach((entry) =>
        pushAsset("image", `${scene.name} · ${variant.label}`, entry.imageUrl, "时间变体历史"),
      );
    });
  });

  videoProject.scenes.forEach((scene) => {
    pushAsset("image", `${scene.sceneName} 分镜图`, scene.storyboardUrl, "分镜");
    scene.storyboardHistory?.forEach((url, index) =>
      pushAsset("image", `${scene.sceneName} 分镜 ${index + 1}`, url, "分镜历史"),
    );
    pushAsset("video", `${scene.sceneName} 视频`, scene.videoUrl, "视频");
    scene.videoHistory?.forEach((entry, index) =>
      pushAsset("video", `${scene.sceneName} 视频 ${index + 1}`, entry.videoUrl, "视频历史"),
    );
  });

  return items.slice(0, 24);
}
