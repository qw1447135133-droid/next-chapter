/**
 * Invoke a Supabase Edge Function that uses streaming (heartbeat newlines + JSON line).
 * Reads chunks until a valid JSON line is found, then returns the parsed object.
 */
export async function invokeStreamingFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 300_000,
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      // Try to parse last non-empty line as JSON
      const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]) as T;
          reader.cancel().catch(() => {});
          if ((parsed as any).error) throw new Error((parsed as any).error);
          return parsed;
        } catch (e) {
          if (e instanceof Error && e.message && !(e instanceof SyntaxError)) {
            reader.cancel().catch(() => {});
            throw e;
          }
        }
      }

      if (done) break;
    }

    throw new Error("未收到有效响应");
  } finally {
    clearTimeout(timer);
  }
}
