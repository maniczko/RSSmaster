import { normalizeReaderText, shouldDropReaderParagraph } from "./reader-cleanup";

export type ReaderHighlightAnnotation = {
  id: string;
  kind: "highlight" | "note";
  quote_text: string | null;
};

export function sanitizeReaderHtml(cleanedHtml: string | null | undefined, articleTitle?: string | null) {
  if (!cleanedHtml) {
    return null;
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return cleanedHtml;
  }

  const documentRoot = new DOMParser().parseFromString(`<article>${cleanedHtml}</article>`, "text/html");
  const container = documentRoot.body.firstElementChild;
  if (!(container instanceof HTMLElement)) {
    return cleanedHtml;
  }

  normalizeReaderMedia(container);
  wrapStandaloneMediaParagraphs(container);

  const normalizedTitle = articleTitle ? normalizeReaderText(articleTitle).toLocaleLowerCase("pl-PL") : null;
  const nodes = Array.from(container.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  const nodeTexts = nodes.map((node) => normalizeReaderText(node.textContent ?? ""));

  for (const [index, node] of nodes.entries()) {
    if (shouldDropReaderParagraph(nodeTexts, index, normalizedTitle)) {
      node.remove();
    }
  }

  enhanceReaderHtml(container, normalizedTitle);

  return hasMeaningfulReaderContent(container) ? container.innerHTML : null;
}

function enhanceReaderHtml(container: HTMLElement, normalizedTitle: string | null) {
  normalizeReaderMedia(container);
  wrapStandaloneMediaParagraphs(container);

  container
    .querySelectorAll("script, style, iframe, object, embed, form, input, button, select, textarea, canvas, noscript")
    .forEach((node) => {
      node.remove();
    });

  container.querySelectorAll("figure").forEach((figure) => {
    figure.classList.add("reader-article-figure");
  });

  container.querySelectorAll("figcaption").forEach((figcaption) => {
    figcaption.classList.add("reader-article-caption");
  });

  container.querySelectorAll("img").forEach((image) => {
    const src = resolveReaderImageSource(image);
    if (!src) {
      image.remove();
      return;
    }

    image.setAttribute("src", src);
    image.classList.add("reader-article-image");
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    image.setAttribute("referrerpolicy", "no-referrer");
    image.setAttribute("alt", resolveReaderImageAlt(image, normalizedTitle));
    image.removeAttribute("srcset");
    image.removeAttribute("data-src");
    image.removeAttribute("data-lazy-src");
    image.removeAttribute("data-original");
    image.removeAttribute("data-url");
    image.removeAttribute("data-srcset");
  });

  container.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href")?.trim();
    if (!href) {
      return;
    }

    link.classList.add("reader-article-link");
    link.setAttribute("rel", "noopener noreferrer");
  });

  container.querySelectorAll("blockquote").forEach((blockquote) => {
    blockquote.classList.add("reader-article-quote");
  });

  container.querySelectorAll("hr").forEach((hr) => {
    hr.classList.add("reader-article-divider");
  });

  container.querySelectorAll("ul, ol").forEach((list) => {
    list.classList.add("reader-article-list");
  });

  container.querySelectorAll("pre").forEach((pre) => {
    pre.classList.add("reader-article-pre");
  });

  container.querySelectorAll("code").forEach((code) => {
    if (code.parentElement?.tagName !== "PRE") {
      code.classList.add("reader-article-inline-code");
    }
  });

  container.querySelectorAll("table").forEach((table) => {
    table.classList.add("reader-article-table");
    const parent = table.parentElement;
    if (parent?.classList.contains("reader-article-table-shell")) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "reader-article-table-shell";
    parent?.insertBefore(shell, table);
    shell.append(table);
  });

  container.querySelectorAll("figure").forEach((figure) => {
    const hasMedia = figure.querySelector("img") !== null;
    const hasText = normalizeReaderText(figure.textContent ?? "") !== "";
    if (!hasMedia && !hasText) {
      figure.remove();
    }
  });
}

function hasMeaningfulReaderContent(container: HTMLElement) {
  const textLength = normalizeReaderText(container.textContent ?? "").length;
  const structuralCount = container.querySelectorAll("figure, img, blockquote, ul, ol, pre, table").length;
  const paragraphCount = container.querySelectorAll("p").length;
  const headingCount = container.querySelectorAll("h1, h2, h3, h4, h5, h6").length;

  if (structuralCount > 0) {
    return true;
  }

  if (textLength >= 120) {
    return true;
  }

  if ((paragraphCount > 0 || headingCount > 0) && textLength >= 80) {
    return true;
  }

  return false;
}

function resolveReaderImageAlt(image: HTMLImageElement, normalizedTitle: string | null) {
  const existingAlt = image.getAttribute("alt")?.trim();
  if (existingAlt) {
    return existingAlt;
  }

  const titleText = image.getAttribute("title")?.trim();
  if (titleText) {
    return titleText;
  }

  const captionText = normalizeReaderText(image.closest("figure")?.querySelector("figcaption")?.textContent ?? "");
  if (captionText) {
    const normalizedCaption = captionText.toLocaleLowerCase("pl-PL");
    if (normalizedCaption !== normalizedTitle) {
      return captionText;
    }
  }

  return "";
}

function normalizeReaderMedia(container: HTMLElement) {
  container.querySelectorAll("picture").forEach((picture) => {
    const replacement = buildPictureFallbackImage(picture);
    if (replacement) {
      picture.replaceWith(replacement);
      return;
    }

    picture.remove();
  });

  container.querySelectorAll("noscript").forEach((noscript) => {
    const replacement = buildNoscriptFallbackImage(noscript);
    if (replacement) {
      noscript.replaceWith(replacement);
      return;
    }
    noscript.remove();
  });
}

function wrapStandaloneMediaParagraphs(container: HTMLElement) {
  container.querySelectorAll("p").forEach((paragraph) => {
    const elementChildren = Array.from(paragraph.children);
    const hasOnlyStandaloneMedia =
      elementChildren.length === 1 &&
      paragraph.textContent !== null &&
      normalizeReaderText(paragraph.textContent) === "" &&
      ["IMG", "PICTURE"].includes(elementChildren[0]?.tagName ?? "");

    if (!hasOnlyStandaloneMedia) {
      return;
    }

    const figure = paragraph.ownerDocument.createElement("figure");
    figure.className = "reader-article-figure";
    paragraph.replaceWith(figure);
    figure.append(elementChildren[0]);
  });
}

function buildPictureFallbackImage(picture: HTMLPictureElement) {
  const pictureImage = picture.querySelector("img");
  const preferredSource = Array.from(picture.querySelectorAll("source"))
    .map((source) => resolveReaderImageSource(source))
    .find((value): value is string => Boolean(value));
  const fallbackSource = preferredSource ?? (pictureImage ? resolveReaderImageSource(pictureImage) : null);

  if (!fallbackSource) {
    return null;
  }

  const replacement = picture.ownerDocument.createElement("img");
  replacement.setAttribute("src", fallbackSource);
  const alt = pictureImage?.getAttribute("alt")?.trim();
  const title = pictureImage?.getAttribute("title")?.trim();
  if (alt) {
    replacement.setAttribute("alt", alt);
  }
  if (title) {
    replacement.setAttribute("title", title);
  }
  return replacement;
}

function buildNoscriptFallbackImage(noscript: HTMLElement) {
  const innerHtml = noscript.innerHTML?.trim();
  if (!innerHtml) {
    return null;
  }

  const parsed = new DOMParser().parseFromString(`<article>${innerHtml}</article>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    return null;
  }

  const nestedPicture = root.querySelector("picture");
  if (nestedPicture instanceof HTMLPictureElement) {
    return buildPictureFallbackImage(nestedPicture);
  }

  const nestedImage = root.querySelector("img");
  if (!(nestedImage instanceof HTMLImageElement)) {
    return null;
  }

  const source = resolveReaderImageSource(nestedImage);
  if (!source) {
    return null;
  }

  const replacement = noscript.ownerDocument.createElement("img");
  replacement.setAttribute("src", source);
  const alt = nestedImage.getAttribute("alt")?.trim();
  const title = nestedImage.getAttribute("title")?.trim();
  if (alt) {
    replacement.setAttribute("alt", alt);
  }
  if (title) {
    replacement.setAttribute("title", title);
  }
  return replacement;
}

function resolveReaderImageSource(element: Element) {
  const directKeys = ["src", "data-src", "data-lazy-src", "data-original", "data-url"];
  for (const key of directKeys) {
    const value = element.getAttribute(key)?.trim();
    if (isMeaningfulReaderImageSource(value)) {
      return value!;
    }
  }

  const srcsetKeys = ["srcset", "data-srcset"];
  for (const key of srcsetKeys) {
    const value = element.getAttribute(key)?.trim();
    const candidate = pickReaderSrcsetCandidate(value);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function pickReaderSrcsetCandidate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let bestUrl: string | null = null;
  let bestWeight = -1;
  for (const entry of value.split(",")) {
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }
    const [rawUrl, descriptor] = normalized.split(/\s+/, 2);
    if (!isMeaningfulReaderImageSource(rawUrl)) {
      continue;
    }
    let weight = 0;
    if (descriptor?.endsWith("w")) {
      const parsed = Number.parseFloat(descriptor.slice(0, -1));
      weight = Number.isFinite(parsed) ? parsed : 0;
    } else if (descriptor?.endsWith("x")) {
      const parsed = Number.parseFloat(descriptor.slice(0, -1));
      weight = Number.isFinite(parsed) ? parsed * 1000 : 0;
    }

    if (weight >= bestWeight) {
      bestWeight = weight;
      bestUrl = rawUrl;
    }
  }

  return bestUrl;
}

function isMeaningfulReaderImageSource(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith("data:") || normalized.startsWith("blob:")) {
    return false;
  }
  if (normalized === "about:blank" || normalized === "#" || normalized === "javascript:void(0)") {
    return false;
  }
  return true;
}

export function renderInlineHighlightHtml(
  cleanedHtml: string | null | undefined,
  annotations: ReaderHighlightAnnotation[],
): string | null {
  if (!cleanedHtml) {
    return null;
  }

  const highlightAnnotations = annotations.filter(
    (annotation) => annotation.kind === "highlight" && annotation.quote_text?.trim(),
  );
  if (highlightAnnotations.length === 0) {
    return cleanedHtml;
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return cleanedHtml;
  }

  const documentRoot = new DOMParser().parseFromString(`<article>${cleanedHtml}</article>`, "text/html");
  const container = documentRoot.body.firstElementChild;
  if (!(container instanceof HTMLElement)) {
    return cleanedHtml;
  }

  for (const annotation of highlightAnnotations) {
    applyInlineHighlight(container, annotation.quote_text!.trim(), annotation.id);
  }

  return container.innerHTML;
}

function applyInlineHighlight(root: HTMLElement, quote: string, annotationId: string) {
  if (!quote) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode instanceof Text && currentNode.parentElement?.closest("mark[data-annotation-id]") === null) {
      textNodes.push(currentNode);
    }
    currentNode = walker.nextNode();
  }

  const normalizedQuote = quote.replace(/\s+/g, " ").trim();
  for (const textNode of textNodes) {
    const originalText = textNode.textContent ?? "";
    const normalizedText = originalText.replace(/\s+/g, " ");
    const startIndex = normalizedText.indexOf(normalizedQuote);
    if (startIndex < 0) {
      continue;
    }

    const rawStartIndex = originalText.indexOf(normalizedQuote);
    if (rawStartIndex < 0) {
      continue;
    }

    const before = originalText.slice(0, rawStartIndex);
    const match = originalText.slice(rawStartIndex, rawStartIndex + normalizedQuote.length);
    const after = originalText.slice(rawStartIndex + normalizedQuote.length);
    const fragment = document.createDocumentFragment();

    if (before) {
      fragment.append(document.createTextNode(before));
    }

    const mark = document.createElement("mark");
    mark.className = "reader-inline-highlight";
    mark.dataset.annotationId = annotationId;
    mark.textContent = match;
    fragment.append(mark);

    if (after) {
      fragment.append(document.createTextNode(after));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
    return;
  }
}
