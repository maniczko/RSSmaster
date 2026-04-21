export function buildFeedIconUrl(siteUrl?: string | null) {
  if (!siteUrl) {
    return null;
  }

  try {
    const parsed = new URL(siteUrl);
    return new URL("/favicon.ico", parsed.origin).toString();
  } catch {
    return null;
  }
}

export function getFeedGlyph(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return "F";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
