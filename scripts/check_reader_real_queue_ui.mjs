import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachPlaywrightArtifact,
  collectScreenshotEvidence,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "reader-real-queue-manifest.json");
const BEFORE_JSON_PATH = path.join(OUTPUT_DIR, "inbox-article-audit-before.json");
const AFTER_JSON_PATH = path.join(OUTPUT_DIR, "inbox-article-audit-after.json");
const SCREENSHOT_PREFIX = path.join(OUTPUT_DIR, "inbox-article-audit");
const FIXTURE_IMAGE_PATH = path.join(ROOT_DIR, "scripts", "fixtures", "sources-preview", "favicon.ico");
const DEFAULT_FORBIDDEN_TEXT_FRAGMENTS = [
  "Loading the Elevenlabs Text to Speech AudioNative Player",
  "AudioNative Player",
  "Elevenlabs",
  "Przeczytaj",
  "Powiazane artykuly",
  "Powiązane artykuły",
  "Przeczytaj takze",
  "Przeczytaj także",
  "Zobacz rowniez",
  "Zobacz również",
  "Kup premium",
  "Subskrybuj premium",
  "Oferta partnerska",
  "Dźwięk został wygenerowany automatycznie i może zawierać błędy",
  "Źródło zdjęć:",
];
const MIN_PROSE_WORD_COUNT = 40;
const RUN_STARTED_AT = new Date();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeAuditText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function countRegexMatches(value, pattern) {
  return Array.from(String(value ?? "").matchAll(pattern)).length;
}

function countWords(value) {
  return String(value ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageSources(html) {
  return Array.from(
    String(html ?? "").matchAll(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi),
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  ).filter(Boolean);
}

function isDecorativeSource(src) {
  const normalized = String(src ?? "").trim().toLowerCase();
  return (
    !normalized
    || normalized.startsWith("data:")
    || normalized === "about:blank"
    || normalized === "#"
    || normalized.startsWith("javascript:")
  );
}

function normalizeScreenshotName(label) {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function matchForbiddenFragments(value, fragments) {
  const normalizedValue = normalizeAuditText(value);
  return fragments.filter((fragment) => normalizedValue.includes(normalizeAuditText(fragment)));
}

function matchForbiddenUrlFragments(sources, fragments) {
  const normalizedSources = sources.map((source) => String(source ?? "").toLowerCase());
  return fragments.filter((fragment) => normalizedSources.some((source) => source.includes(String(fragment).toLowerCase())));
}

function getUrlPort(value) {
  const parsed = new URL(value);
  if (parsed.port) {
    return parsed.port;
  }
  return parsed.protocol === "https:" ? "443" : "80";
}

function parseArgs(argv) {
  let phase = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--phase") {
      phase = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--phase=")) {
      phase = arg.slice("--phase=".length);
    }
  }

  if (phase && !["before", "after"].includes(phase)) {
    throw new Error(`Unsupported --phase value: ${phase}`);
  }

  return { phase };
}

function resolvePhase(explicitPhase) {
  if (explicitPhase) {
    return explicitPhase;
  }
  return existsSync(BEFORE_JSON_PATH) ? "after" : "before";
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.RSSMASTER_PLAYWRIGHT_MODULE,
    path.join(ROOT_DIR, "output", "playwright-runtime", "node_modules", "playwright"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(
    "Brak lokalnego runtime Playwright. Oczekiwano modulu pod output/playwright-runtime/node_modules/playwright albo w RSSMASTER_PLAYWRIGHT_MODULE.",
  );
}

async function ensureOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function assertJsonHealth(name, url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name} health failed: ${response.status} for ${url}`);
  }
  const payload = await response.json();
  if (!payload || payload.status !== "ok") {
    throw new Error(`${name} health returned unexpected payload: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function buildReaderRoute(routeLike, itemId, webUrl) {
  const url = new URL(routeLike, webUrl);
  url.searchParams.set("item", itemId);
  if (url.pathname.startsWith("/read/")) {
    url.searchParams.set("surface", "article");
  }
  return url.toString();
}

function normalizeManifestEntry(rawEntry, index, baseRoute, webUrl) {
  const entry = typeof rawEntry === "string" ? { itemId: rawEntry } : rawEntry ?? {};
  const itemId = entry.itemId ?? entry.id ?? entry.item_id;
  if (!itemId) {
    throw new Error(`Manifest entry ${index + 1} does not define itemId.`);
  }

  const routeCandidate = entry.route ?? entry.url ?? entry.href ?? baseRoute;
  if (!routeCandidate) {
    throw new Error(`Manifest entry ${index + 1} for ${itemId} does not define a route and manifest has no base route.`);
  }

  return {
    index: index + 1,
    itemId,
    route: buildReaderRoute(routeCandidate, itemId, webUrl),
    title: entry.title ?? null,
    label: entry.label ?? null,
    className: entry.class ?? entry.kind ?? "sample",
    requireImage: Boolean(entry.requireImage),
    forbiddenTextFragments: Array.isArray(entry.forbiddenTextFragments) && entry.forbiddenTextFragments.length > 0
      ? entry.forbiddenTextFragments
      : DEFAULT_FORBIDDEN_TEXT_FRAGMENTS,
    forbiddenUrlFragments: Array.isArray(entry.forbiddenUrlFragments) ? entry.forbiddenUrlFragments : [],
    minWordCountApprox: Number.isFinite(entry.minWordCountApprox)
      ? Number(entry.minWordCountApprox)
      : MIN_PROSE_WORD_COUNT,
  };
}

function resolveManifestEntries(manifest, webUrl) {
  const baseRoute = manifest.route ?? manifest.startUrl ?? manifest.baseRoute ?? manifest.url ?? manifest.href ?? null;
  const rawEntries = Array.isArray(manifest.items)
    ? manifest.items
    : Array.isArray(manifest.entries)
      ? manifest.entries
      : [];

  assert(rawEntries.length > 0, `Manifest ${MANIFEST_PATH} does not contain any items.`);
  return rawEntries.map((entry, index) => normalizeManifestEntry(entry, index, baseRoute, webUrl));
}

async function fetchItemDetail(apiUrl, itemId) {
  const response = await fetch(`${apiUrl}/api/v1/items/${encodeURIComponent(itemId)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Item detail failed for ${itemId}: ${response.status} ${JSON.stringify(payload)}`);
  }
  if (!payload?.item) {
    throw new Error(`Unexpected item detail payload for ${itemId}: ${JSON.stringify(payload)}`);
  }
  return payload.item;
}

function collectApiAudit(itemDetail, entry) {
  const cleanedHtml = itemDetail.cleaned_html ?? "";
  const cleanedText = stripHtml(cleanedHtml);
  const imageSources = extractImageSources(cleanedHtml);
  const meaningfulImageSources = imageSources.filter((src) => !isDecorativeSource(src));
  return {
    extractionStatus: itemDetail.extraction_status ?? null,
    hasCleanedContent: Boolean(itemDetail.has_cleaned_content && cleanedHtml),
    cleanedHtmlWordCountApprox: countWords(cleanedText),
    cleanedHtmlLength: cleanedHtml.length,
    paragraphCount: countRegexMatches(cleanedHtml, /<p\b/gi),
    figureCount: countRegexMatches(cleanedHtml, /<figure\b/gi),
    figcaptionCount: countRegexMatches(cleanedHtml, /<figcaption\b/gi),
    imageCount: imageSources.length,
    meaningfulImageCount: meaningfulImageSources.length,
    imageSources,
    forbiddenTextFragmentsFound: matchForbiddenFragments(cleanedHtml, entry.forbiddenTextFragments),
    forbiddenUrlFragmentsFound: matchForbiddenUrlFragments(imageSources, entry.forbiddenUrlFragments),
    prosePreview: cleanedText.slice(0, 360),
  };
}

async function ensureReaderArticleOpen(page, expectedTitle) {
  await page.waitForFunction(
    (title) => document.body.innerText.includes(title),
    expectedTitle,
    { timeout: 30000 },
  );

  const proseVisible = await page.locator(".reader-article-prose").first().isVisible().catch(() => false);
  if (proseVisible) {
    return;
  }

  const readButton = page.getByRole("button", { name: "Czytaj artykul" }).first();
  if ((await readButton.count()) > 0) {
    await readButton.click();
  } else {
    const titleButton = page.getByRole("button", { name: expectedTitle }).first();
    if ((await titleButton.count()) > 0) {
      await titleButton.click();
    }
  }

  await page.waitForSelector(".reader-article-prose", { timeout: 20000 });
}

async function waitForReaderMediaToSettle(page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".reader-article-prose img")).every(
          (image) => !(image instanceof HTMLImageElement) || image.complete,
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
}

async function installUnexpectedLocalImageFallback(page, allowedPorts) {
  const fallbackImageBody = existsSync(FIXTURE_IMAGE_PATH) ? await readFile(FIXTURE_IMAGE_PATH) : Buffer.from([]);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/.*$/i, async (route, request) => {
    const requestUrl = new URL(request.url());
    if (request.resourceType() === "image" && !allowedPorts.has(requestUrl.port)) {
      await route.fulfill({
        status: 200,
        contentType: "image/x-icon",
        body: fallbackImageBody,
      });
      return;
    }
    await route.continue();
  });
}

async function collectRenderedAudit(page, entry) {
  return await page.evaluate((params) => {
    const prose = document.querySelector(".reader-article-prose");
    if (!(prose instanceof HTMLElement)) {
      return {
        present: false,
        proseWordCountApprox: 0,
        prosePreview: "",
        paragraphCount: 0,
        figureCount: 0,
        figcaptionCount: 0,
        imageCount: 0,
        meaningfulImageCount: 0,
        imageSources: [],
        linkHrefs: [],
        forbiddenTextFragmentsFound: [],
        forbiddenUrlFragmentsFound: [],
      };
    }

    const proseText = (prose.innerText || prose.textContent || "").trim();
    const normalizedText = proseText
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const images = Array.from(prose.querySelectorAll("img"));
    const imageSources = images.map((image) => image.getAttribute("src") ?? "").filter(Boolean);
    const meaningfulImageCount = imageSources.filter((src) => {
      const normalized = src.trim().toLowerCase();
      return !(normalized.startsWith("data:") || normalized === "about:blank" || normalized === "#" || normalized.startsWith("javascript:"));
    }).length;
    const linkHrefs = Array.from(prose.querySelectorAll("a")).map((node) => node.getAttribute("href") ?? "").filter(Boolean);

    return {
      present: true,
      proseWordCountApprox: proseText ? proseText.split(/\s+/).filter(Boolean).length : 0,
      prosePreview: proseText.slice(0, 360),
      paragraphCount: prose.querySelectorAll("p").length,
      figureCount: prose.querySelectorAll("figure").length,
      figcaptionCount: prose.querySelectorAll("figcaption").length,
      imageCount: imageSources.length,
      meaningfulImageCount,
      imageSources,
      linkHrefs,
      forbiddenTextFragmentsFound: params.forbiddenTextFragments.filter((fragment) =>
        normalizedText.includes(
          fragment
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase(),
        ),
      ),
      forbiddenUrlFragmentsFound: params.forbiddenUrlFragments.filter((fragment) =>
        [...imageSources, ...linkHrefs].some((value) => value.toLowerCase().includes(String(fragment).toLowerCase())),
      ),
    };
  }, {
    forbiddenTextFragments: entry.forbiddenTextFragments,
    forbiddenUrlFragments: entry.forbiddenUrlFragments,
  });
}

function collectInvariantFailures(entry, apiAudit, renderedAudit) {
  const failures = [];

  if (apiAudit.extractionStatus !== "completed") {
    failures.push(`apiAudit.extractionStatus=${apiAudit.extractionStatus}`);
  }
  if (!apiAudit.hasCleanedContent) {
    failures.push("apiAudit.hasCleanedContent=false");
  }
  if (apiAudit.cleanedHtmlWordCountApprox < entry.minWordCountApprox) {
    failures.push(
      `apiAudit.cleanedHtmlWordCountApprox=${apiAudit.cleanedHtmlWordCountApprox} < ${entry.minWordCountApprox}`,
    );
  }
  if (apiAudit.forbiddenTextFragmentsFound.length > 0) {
    failures.push(`apiAudit.forbiddenTextFragments=${apiAudit.forbiddenTextFragmentsFound.join(", ")}`);
  }
  if (apiAudit.forbiddenUrlFragmentsFound.length > 0) {
    failures.push(`apiAudit.forbiddenUrlFragments=${apiAudit.forbiddenUrlFragmentsFound.join(", ")}`);
  }
  if (!renderedAudit.present) {
    failures.push("renderedAudit.present=false");
    return failures;
  }
  if (renderedAudit.proseWordCountApprox < entry.minWordCountApprox) {
    failures.push(
      `renderedAudit.proseWordCountApprox=${renderedAudit.proseWordCountApprox} < ${entry.minWordCountApprox}`,
    );
  }
  if (renderedAudit.forbiddenTextFragmentsFound.length > 0) {
    failures.push(`renderedAudit.forbiddenTextFragments=${renderedAudit.forbiddenTextFragmentsFound.join(", ")}`);
  }
  if (renderedAudit.forbiddenUrlFragmentsFound.length > 0) {
    failures.push(`renderedAudit.forbiddenUrlFragments=${renderedAudit.forbiddenUrlFragmentsFound.join(", ")}`);
  }
  if (entry.requireImage && renderedAudit.imageCount === 0 && renderedAudit.figureCount === 0) {
    failures.push("required image or figure is missing from rendered prose");
  }

  return failures;
}

function withStandardArtifact(report, { apiUrl, entries, webUrl }) {
  const screenshots = collectScreenshotEvidence(
    report.items.map((item) => item.screenshot),
    {
      rootDir: ROOT_DIR,
      runStartedAt: RUN_STARTED_AT,
    },
  );
  const failedItemIds = new Set(report.failedItems.map((item) => item.itemId));
  const hasHarnessFailure =
    report.pageErrors.length > 0
    || report.consoleErrors.length > 0
    || report.auditedCount !== entries.length
    || report.failedItems.length > 0;

  return attachPlaywrightArtifact(report, {
    checkName: "check:reader:real-queue",
    status: hasHarnessFailure ? "failed" : "passed",
    startedAt: RUN_STARTED_AT,
    targetUrls: { apiUrl, webUrl },
    runtime: {
      isolated: false,
      authMode: "operator-real-queue",
      runDir: OUTPUT_DIR,
    },
    routes: report.items.map((item) => ({
      id: `real-queue-${report.phase}-${item.index}`,
      route: new URL(item.route).pathname,
      finalUrl: item.route,
      status: failedItemIds.has(item.itemId) ? "failed" : "passed",
      screenshot: item.screenshot,
      ready: true,
      notes: {
        class: item.class,
        invariantFailures: item.invariantFailures,
        itemId: item.itemId,
        label: item.label,
      },
    })),
    screenshots,
    errors: {
      console: report.consoleErrors,
      page: report.pageErrors,
      http: [],
      harness: [
        ...report.harnessErrors,
        ...report.failedItems.map((item) => ({
          itemId: item.itemId,
          invariantFailures: item.invariantFailures,
        })),
      ],
    },
    metadata: {
      audited_count: report.auditedCount,
      failed_count: report.failedItems.length,
      manifest_path: report.manifestPath,
      phase: report.phase,
      with_captions: report.withCaptions,
      with_figures: report.withFigures,
      with_images: report.withImages,
      with_noise: report.withNoise,
    },
  });
}

async function main() {
  await ensureOutputDir();
  assert(existsSync(MANIFEST_PATH), `Brak manifestu real queue: ${MANIFEST_PATH}`);

  const args = parseArgs(process.argv.slice(2));
  const phase = resolvePhase(args.phase);
  const outputJsonPath = phase === "before" ? BEFORE_JSON_PATH : AFTER_JSON_PATH;

  const { chromium } = loadPlaywright();
  const webUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const apiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

  await assertJsonHealth("web", `${webUrl}/api/health`);
  await assertJsonHealth("api", `${apiUrl}/health`);

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const entries = resolveManifestEntries(manifest, webUrl);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await installUnexpectedLocalImageFallback(page, new Set([getUrlPort(webUrl), getUrlPort(apiUrl)]));

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  const report = {
    phase,
    manifestPath: MANIFEST_PATH,
    manifestRoute: manifest.route ?? manifest.startUrl ?? manifest.baseRoute ?? null,
    auditedCount: 0,
    withNoise: 0,
    withImages: 0,
    withFigures: 0,
    withCaptions: 0,
    consoleErrors,
    harnessErrors: [],
    pageErrors,
    items: [],
    failedItems: [],
  };

  let runError = null;
  try {
    for (const entry of entries) {
      const itemDetail = await fetchItemDetail(apiUrl, entry.itemId);
      const expectedTitle = entry.title ?? itemDetail.title ?? entry.itemId;

      await page.goto(entry.route, { waitUntil: "domcontentloaded" });
      await ensureReaderArticleOpen(page, expectedTitle);
      await waitForReaderMediaToSettle(page);

      const apiAudit = collectApiAudit(itemDetail, entry);
      const renderedAudit = await collectRenderedAudit(page, entry);
      const screenshotLabel = normalizeScreenshotName(entry.label ?? entry.className ?? expectedTitle ?? entry.itemId);
      const screenshotPath = `${SCREENSHOT_PREFIX}-${phase}-${String(entry.index).padStart(2, "0")}-${entry.itemId}-${screenshotLabel}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const invariantFailures = collectInvariantFailures(entry, apiAudit, renderedAudit);
      if (
        apiAudit.forbiddenTextFragmentsFound.length > 0
        || apiAudit.forbiddenUrlFragmentsFound.length > 0
        || renderedAudit.forbiddenTextFragmentsFound.length > 0
        || renderedAudit.forbiddenUrlFragmentsFound.length > 0
      ) {
        report.withNoise += 1;
      }
      if (renderedAudit.imageCount > 0) {
        report.withImages += 1;
      }
      if (renderedAudit.figureCount > 0) {
        report.withFigures += 1;
      }
      if (renderedAudit.figcaptionCount > 0) {
        report.withCaptions += 1;
      }
      if (invariantFailures.length > 0) {
        report.failedItems.push({
          itemId: entry.itemId,
          label: entry.label,
          class: entry.className,
          invariantFailures,
        });
      }

      report.items.push({
        index: entry.index,
        itemId: entry.itemId,
        title: expectedTitle,
        label: entry.label,
        class: entry.className,
        requireImage: entry.requireImage,
        minWordCountApprox: entry.minWordCountApprox,
        route: entry.route,
        screenshot: screenshotPath,
        apiAudit,
        renderedAudit,
        invariantFailures,
      });
    }
  } catch (error) {
    runError = error;
    report.harnessErrors.push({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  } finally {
    report.auditedCount = report.items.length;
    await writeFile(
      outputJsonPath,
      JSON.stringify(
        withStandardArtifact(report, {
          apiUrl,
          entries,
          webUrl,
        }),
        null,
        2,
      ),
      "utf8",
    );
    await browser.close();
  }

  if (runError) {
    throw runError;
  }

  assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
  assert(consoleErrors.length === 0, `consoleErrors=${JSON.stringify(consoleErrors)}`);
  assert(report.auditedCount === entries.length, `auditedCount=${report.auditedCount} expected=${entries.length}`);

  if (phase === "after") {
    assert(report.withNoise === 0, `withNoise=${report.withNoise}`);
    assert(report.failedItems.length === 0, `reader real queue invariant failures=${JSON.stringify(report.failedItems)}`);
  }

  console.log(JSON.stringify({ phase, report: outputJsonPath, auditedCount: report.auditedCount }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
