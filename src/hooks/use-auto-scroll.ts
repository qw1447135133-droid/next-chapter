import { useRef, useEffect } from "react";

/**
 * Returns a ref to attach to a scrollable container.
 * When `active` is true, the container auto-scrolls to the bottom
 * whenever `dependency` changes (e.g. streaming text).
 */
export function useAutoScroll<T extends HTMLElement = HTMLElement>(
  active: boolean,
  dependency?: unknown,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [active, dependency]);

  return ref;
}
