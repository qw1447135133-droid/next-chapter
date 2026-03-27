/**
 * Generate a unique ID with browser compatibility fallback.
 * Uses crypto.randomUUID() if available, otherwise falls back to a custom implementation.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
