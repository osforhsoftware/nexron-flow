export function parseAssetTagPattern(pattern?: string | null) {
  const text = (pattern ?? "").trim().toUpperCase() || "EQ-0001";
  const match = text.match(/^(.*?)(\d+)$/);
  if (match) {
    return { prefix: match[1], width: match[2].length, start: Number(match[2]) };
  }
  return { prefix: `${text.replace(/-+$/, "")}-`, width: 3, start: 1 };
}

export function formatAssetTag(prefix: string, number: number, width: number) {
  const pad = Math.max(width, String(number).length);
  return `${prefix}${String(number).padStart(pad, "0")}`;
}

export function nextAssetTag(pattern: string | null | undefined, existing: string[]) {
  const parsed = parseAssetTagPattern(pattern);
  let next = parsed.start;
  const prefix = parsed.prefix.toUpperCase();
  for (const raw of existing) {
    const tag = raw.trim().toUpperCase();
    if (!tag.startsWith(prefix)) continue;
    const suffix = tag.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      const n = Number(suffix);
      if (n >= next) next = n + 1;
    }
  }
  return formatAssetTag(parsed.prefix, next, parsed.width);
}
