import type { QrKind } from "./qrLabel";

export type ParsedScan = { kind: QrKind; id: string };

/** Accept absolute or relative URLs that point at /scan/{product|equipment}/{id}. */
export function parseScanPayload(raw: string): ParsedScan | null {
  const text = raw.trim();
  if (!text) return null;

  let path = text;
  try {
    if (/^https?:\/\//i.test(text)) {
      path = new URL(text).pathname;
    } else if (text.startsWith("/")) {
      path = text;
    } else {
      const match = text.match(/\/scan\/(product|equipment)\/([^/?#\s]+)/i);
      if (match) {
        return { kind: match[1].toLowerCase() as QrKind, id: decodeURIComponent(match[2]) };
      }
      return null;
    }
  } catch {
    return null;
  }

  const match = path.match(/^\/scan\/(product|equipment)\/([^/?#]+)/i);
  if (!match) return null;
  return { kind: match[1].toLowerCase() as QrKind, id: decodeURIComponent(match[2]) };
}
