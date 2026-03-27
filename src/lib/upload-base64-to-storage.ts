/**
 * 图片 URL 保证（透传，不做上传）
 */
export async function ensureStorageUrl(
  dataUrl: string,
  _folder: string = "characters",
): Promise<string> {
  return dataUrl;
}
