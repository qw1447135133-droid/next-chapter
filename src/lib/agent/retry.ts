/**
 * Exponential backoff retry logic.
 * Port of: hare/services/api/retry.py
 */

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30_000

const RETRYABLE_PATTERNS = [
  'rate limit',
  'overloaded',
  '529',
  '503',
  '502',
  'timeout',
  'connection',
]

function isRetryable(error: unknown): boolean {
  const msg = String(error).toLowerCase()
  return RETRYABLE_PATTERNS.some(p => msg.includes(p))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (!isRetryable(err) || attempt >= maxRetries) {
        throw err
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      const jitter = Math.random() * delay * 0.1
      await sleep(delay + jitter)
    }
  }

  throw lastError
}
