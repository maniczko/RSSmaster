export type FeedStreamCopyItem = {
  title: string;
  excerpt: string | null;
  has_cleaned_content: boolean;
  has_raw_content: boolean;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAscii(value: string) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[łŁ]/g, "l")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stripDomainArtifacts(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\b[a-z0-9-]+\.(?:pl|com|net|org)\b/gi, " ")
      .replace(/\b(pl|com|net|org)\b(?=\s+\d{1,2}\s+[a-z])/gi, " ")
      .replace(/\s+([,.;:!?])/g, "$1"),
  );
}

function isBoilerplatePart(part: string) {
  const ascii = normalizeAscii(part);
  if (!ascii) {
    return true;
  }

  if (
    ascii.includes("zrodlo zdjec")
    || ascii.includes("zrodlo artykulu")
    || ascii.includes("czytaj takze")
    || ascii.includes("czytaj tez")
    || ascii.includes("dzwiek")
    || ascii.includes("audio")
    || ascii.includes("material sponsorowany")
    || ascii.includes("redakcja")
  ) {
    return true;
  }

  if (/^(pl|com|net|org)\b/.test(ascii)) {
    return true;
  }

  if (/^[a-z0-9-]+\.(pl|com|net|org)\b/.test(ascii)) {
    return true;
  }

  return false;
}

export function getFeedCardSurfaceLabel(item: FeedStreamCopyItem) {
  if (item.has_cleaned_content) {
    return "Pelny tekst";
  }

  if (item.has_raw_content) {
    return "Tekst zastepczy";
  }

  return "Skrot";
}

export function buildFeedCardMetaLine(author: string | null, timestampLabel: string) {
  return author ? `${author} | ${timestampLabel}` : timestampLabel;
}

export function buildFeedCardExcerpt(item: FeedStreamCopyItem) {
  const excerpt = item.excerpt?.trim();
  if (!excerpt) {
    return "Brak skrotu. Otworz artykul w czytniku, aby przejsc do oczyszczonego widoku albo tekstu zastepczego.";
  }

  const normalizedExcerpt = normalizeWhitespace(excerpt);
  const normalizedTitle = normalizeWhitespace(item.title).toLowerCase();
  const withoutTitlePrefix = normalizedExcerpt.toLowerCase().startsWith(normalizedTitle)
    ? normalizedExcerpt.slice(item.title.trim().length).trimStart().replace(/^[-:,. ]+/, "")
    : normalizedExcerpt;

  const excerptParts = withoutTitlePrefix
    .replace(/©/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => stripDomainArtifacts(part))
    .filter((part) => part && !isBoilerplatePart(part));

  const cleanedExcerpt = normalizeWhitespace(excerptParts.join(" "))
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+\|\s+/g, " | ");

  const finalExcerpt = normalizeWhitespace(cleanedExcerpt);
  if (!finalExcerpt) {
    return "Otworz artykul, aby zobaczyc oczyszczony widok czytania.";
  }

  if (finalExcerpt.length <= 260) {
    return finalExcerpt;
  }

  return `${finalExcerpt.slice(0, 257).trimEnd()}...`;
}
