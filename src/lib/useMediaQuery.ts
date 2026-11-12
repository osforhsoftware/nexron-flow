import { useEffect, useState } from "react";

/** Subscribe to a CSS media query. Defaults to false during SSR / first paint. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phone / compact tablet shell (bottom nav + drawer). */
export const MOBILE_SHELL_QUERY = "(max-width: 768px)";

export function useIsMobileShell(): boolean {
  return useMediaQuery(MOBILE_SHELL_QUERY);
}
