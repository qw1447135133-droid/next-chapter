import { getResolvedFilesStoragePath } from "@/lib/storage-path";

export async function getProjectsFilePath(): Promise<string | null> {
  const root = await getResolvedFilesStoragePath();
  if (!root) return null;
  return `${root.replace(/[\\/]+$/, "")}\\projects\\projects.json`;
}

export async function getProjectRootPath(projectId: string): Promise<string | null> {
  const root = await getResolvedFilesStoragePath();
  if (!root) return null;
  return `${root.replace(/[\\/]+$/, "")}\\projects\\${projectId}`;
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!window.electronAPI?.storage?.readText) return null;
  const result = await window.electronAPI.storage.readText(filePath);
  if (!result.ok || !result.exists || !result.content) return null;
  try {
    return JSON.parse(result.content) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  if (!window.electronAPI?.storage?.writeText) return false;
  const result = await window.electronAPI.storage.writeText(
    filePath,
    JSON.stringify(value, null, 2),
  );
  return !!result.ok;
}
