/**
 * 持久化 Hook —— 使用本地文件存储（通过 Electron IPC 读写指定路径）
 */
import { useProjectPersistence as useLocalPersistence } from "@/hooks/use-local-persistence";

export function useSmartPersistence() {
  return useLocalPersistence();
}
