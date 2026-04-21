export type CaptureQueryValue = string | string[] | null | undefined;

export function normalizeCaptureQueryValue(value: CaptureQueryValue): string {
  if (Array.isArray(value)) {
    return normalizeCaptureQueryValue(value[0]);
  }
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function buildCaptureHref({
  url,
  title,
  note,
}: {
  url?: string | null;
  title?: string | null;
  note?: string | null;
}): string {
  const params = new URLSearchParams();

  if (url?.trim()) {
    params.set("url", url.trim());
  }
  if (title?.trim()) {
    params.set("title", title.trim());
  }
  if (note?.trim()) {
    params.set("note", note.trim());
  }

  const query = params.toString();
  return query ? `/capture?${query}` : "/capture";
}

export function buildCaptureBookmarklet(origin: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const baseUrl = `${normalizedOrigin}/capture`;
  return [
    "javascript:(()=>{",
    "const url=encodeURIComponent(window.location.href);",
    "const title=encodeURIComponent(document.title||'');",
    `window.open('${baseUrl}?url='+url+(title?'&title='+title:''),'_blank','noopener,noreferrer');`,
    "})();",
  ].join("");
}
