export function normalizeReaderText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReaderAscii(value: string) {
  return normalizeReaderText(value)
    .normalize("NFKD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isReaderBoilerplateLine(value: string) {
  const normalized = normalizeReaderText(value);
  const lowered = normalized.toLocaleLowerCase("pl-PL");
  const asciiNormalized = normalizeReaderAscii(normalized);

  if (!normalized) {
    return true;
  }

  if (asciiNormalized.startsWith("zrodlo zdjec:")) {
    return true;
  }
  if (asciiNormalized.startsWith("zrodlo artykulu:") || asciiNormalized === "zrodlo artykulu") {
    return true;
  }
  if (/^oprac\./i.test(normalized)) {
    return true;
  }
  if (asciiNormalized.startsWith("dzwiek zostal wygenerowany automatycznie")) {
    return true;
  }
  if (/^\d{1,2} [\p{L}ąćęłńóśźż]+ \d{4}, \d{2}:\d{2}$/iu.test(normalized)) {
    return true;
  }
  if (/[+]\d+$/.test(normalized) && !/[.!?]/.test(normalized) && normalized.split(/\s+/).length <= 8) {
    return true;
  }
  if (/^redakcja\b/i.test(normalized) && normalized.split(/\s+/).length <= 4) {
    return true;
  }
  if (/^(autor|author)\b/i.test(normalized) && normalized.split(/\s+/).length <= 6) {
    return true;
  }
  if (
    lowered.includes("źródło artykułu")
    || lowered.includes("źródło zdjęć")
    || lowered.includes("dźwięk został wygenerowany automatycznie")
  ) {
    return true;
  }

  return false;
}

function isLikelyReaderTimestampLine(value: string) {
  const normalized = normalizeReaderText(value);
  if (!normalized) {
    return false;
  }

  if (/^\d{1,2}[./-]\d{2}[./-]\d{4}(?:,?\s+\d{1,2}:\d{2})?$/i.test(normalized)) {
    return true;
  }

  return /\b\d{1,2}[./-]\d{2}[./-]\d{4}\b/.test(normalized) && /\bgodz\.?\s*\d{1,2}:\d{2}\b/i.test(normalized);
}

function isLikelyReaderHeadingEcho(current: string, next: string | undefined) {
  const normalizedCurrent = normalizeReaderText(current);
  const normalizedNext = normalizeReaderText(next ?? "");
  const currentAscii = normalizeReaderAscii(normalizedCurrent);
  const nextAscii = normalizeReaderAscii(normalizedNext);
  const currentComparable = currentAscii.replace(/^[^a-z0-9]+/, "");
  const nextComparable = nextAscii.replace(/^[^a-z0-9]+/, "");

  if (!currentComparable || !nextComparable) {
    return false;
  }

  if (/[.!?]/.test(normalizedCurrent)) {
    return false;
  }

  const words = currentAscii.split(/\s+/);
  if (words.length > 7 || currentAscii.length < 8) {
    return false;
  }

  if (currentComparable.startsWith("kurs ") && nextComparable.startsWith("wobec ")) {
    return true;
  }

  return (
    nextComparable.startsWith(`${currentComparable} `)
    || nextComparable.startsWith(`${currentComparable}-`)
    || nextComparable.startsWith(`${currentComparable}:`)
  );
}

export function shouldDropReaderParagraph(
  paragraphs: string[],
  index: number,
  normalizedTitle?: string | null,
) {
  const paragraph = normalizeReaderText(paragraphs[index] ?? "");
  if (!paragraph) {
    return true;
  }

  if (isReaderBoilerplateLine(paragraph)) {
    return true;
  }

  if (normalizedTitle && index === 0 && paragraph.toLocaleLowerCase("pl-PL") === normalizedTitle) {
    return true;
  }

  const previousParagraph = index > 0 ? normalizeReaderText(paragraphs[index - 1] ?? "") : "";
  if (previousParagraph && normalizeReaderAscii(previousParagraph) === normalizeReaderAscii(paragraph)) {
    return true;
  }

  if (isLikelyReaderTimestampLine(paragraph)) {
    return true;
  }

  const nextParagraph = index < paragraphs.length - 1 ? paragraphs[index + 1] : undefined;
  if (isLikelyReaderHeadingEcho(paragraph, nextParagraph)) {
    return true;
  }

  return false;
}

export function sanitizeReaderParagraphs(paragraphs: string[], articleTitle?: string | null) {
  const normalizedTitle = articleTitle ? normalizeReaderText(articleTitle).toLocaleLowerCase("pl-PL") : null;
  const normalizedParagraphs = paragraphs.map((paragraph) => normalizeReaderText(paragraph));

  return normalizedParagraphs.filter(
    (_paragraph, index) => !shouldDropReaderParagraph(normalizedParagraphs, index, normalizedTitle),
  );
}
