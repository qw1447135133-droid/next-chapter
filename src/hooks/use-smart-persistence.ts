/**
 * 智能持久化 Hook —— 根据 Settings 中的 storageMode 自动切换存储后端
 * - storageMode === "cloud" 且 Supabase 已配置 → 使用 Supabase
 * - 否则 → 回退到 localStorage
 */
import { useMemo } from "react";
import { getApiConfig } from "@/pages/Settings";
import { useProjectPersistence as useLocalPersistence } from "@/hooks/use-local-persistence";
import { useProjectPersistence as useCloudPersistence } from "@/hooks/use-project-persistence";

export function useSmartPersistence() {
  const config = getApiConfig();
  const isCloudReady = config.storageMode === "cloud" && !!config.supabaseUrl && !!config.supabaseKey;

  const local = useLocalPersistence();
  const cloud = useCloudPersistence();

  return useMemo(() => (isCloudReady ? cloud : local), [isCloudReady, cloud, local]);
}
