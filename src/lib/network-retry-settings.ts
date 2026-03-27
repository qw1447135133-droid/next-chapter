import { getApiConfig } from "@/pages/Settings";

/**
 * 与设置页「网络重试」一致：最大重试次数 0–5，间隔 500–30000ms。
 */
export function getNetworkRetrySettings(): {
  maxRetries: number;
  delayMs: number;
} {
  const cfg = getApiConfig();
  const rawCount = Number(cfg.retryCount);
  const rawDelay = Number(cfg.retryDelayMs);
  const maxRetries = Number.isFinite(rawCount)
    ? Math.min(5, Math.max(0, Math.floor(rawCount)))
    : 2;
  const delayMs = Number.isFinite(rawDelay)
    ? Math.min(30_000, Math.max(500, Math.floor(rawDelay)))
    : 3000;
  return { maxRetries, delayMs };
}
