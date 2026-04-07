export function createAccumulatedTextDeltaForwarder(
  onDelta: (delta: string) => void,
): (accumulated: string) => void {
  let previous = "";

  return (accumulated: string) => {
    const next = String(accumulated ?? "");
    if (!next) return;

    if (next.startsWith(previous)) {
      const delta = next.slice(previous.length);
      previous = next;
      if (delta) onDelta(delta);
      return;
    }

    previous = next;
    onDelta(next);
  };
}
