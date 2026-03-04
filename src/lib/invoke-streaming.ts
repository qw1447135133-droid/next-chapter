/**
 * 本地流式函数调用 — 直接调用 Gemini API
 * 替代 Supabase Edge Functions 的流式调用
 */
import { invokeFunction } from "@/lib/invoke-with-key";

export async function invokeStreamingFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  _timeoutMs = 300_000,
): Promise<T> {
  // Now all functions are local, just delegate to invokeFunction
  const { data, error } = await invokeFunction<T>(functionName, body);
  if (error) throw error;
  return data!;
}
