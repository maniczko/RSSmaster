import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareSmokeRuntime } from "./lib/local-runtime.mjs";
import {
  attachPlaywrightArtifact,
  collectScreenshotEvidence,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "reader-rich-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "reader-rich-smoke.png");
const FIXTURE_IMAGE_PATH = path.join(ROOT_DIR, "scripts", "fixtures", "sources-preview", "favicon.ico");
const RELATED_CONTENT_FRAGMENTS = ["Powiazane artykuly", "Przeczytaj takze", "Zobacz rowniez"];
const PROMO_WIDGET_FRAGMENTS = ["Kup premium", "Subskrybuj premium", "Oferta partnerska"];
const RUN_STARTED_AT = new Date();

const READER_CORPUS_CASES = [
  {
    id: "text-only",
    title: "Reader Rich Story text-only",
    head: () => "",
    body: (origin) => [
      "<p>Plain opening paragraph with enough prose to exercise the reader shell.</p>",
      `<p>Second paragraph with a <a href="/secondary-source">relative source link</a> and explicit context for ${origin}.</p>`,
    ].join(""),
    expectations: { cleanedMode: true, linkAbsolutized: true },
  },
  {
    id: "hero-image",
    title: "Reader Rich Story hero-image",
    head: () => "",
    body: (origin) => [
      `<p>Lead paragraph with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<figure><img src="/assets/hero.ico" alt="Hero image" /><figcaption>Hero caption</figcaption></figure>',
      "<p>Closing paragraph after the hero image.</p>",
    ].join(""),
    expectations: { cleanedMode: true, figureRendered: true, imageRendered: true, linkAbsolutized: true },
  },
  {
    id: "multi-image",
    title: "Reader Rich Story multi-image",
    head: () => "",
    body: (origin) => [
      `<p>Gallery intro with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<figure><img src="/assets/hero.ico" alt="Gallery one" /><figcaption>First caption</figcaption></figure>',
      '<figure><img src="/assets/hero.ico" alt="Gallery two" /><figcaption>Second caption</figcaption></figure>',
      "<p>Gallery outro.</p>",
    ].join(""),
    expectations: { cleanedMode: true, figureRendered: true, imageRendered: true, linkAbsolutized: true },
  },
  {
    id: "srcset-lazyload",
    title: "Reader Rich Story responsive-media",
    head: () => "",
    body: (origin) => [
      `<p>Responsive media intro with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<figure>',
      '<picture>',
      '<source srcset="/assets/hero-small.ico 640w, /assets/hero-large.ico 1600w" />',
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/assets/hero-data.ico" srcset="/assets/hero-fallback.ico 1x, /assets/hero-hd.ico 2x" loading="lazy" decoding="async" alt="Responsive hero" />',
      "</picture>",
      "<figcaption>Responsive caption</figcaption>",
      "</figure>",
      "<p>Responsive media outro.</p>",
    ].join(""),
    expectations: { cleanedMode: true, figureRendered: true, imageRendered: true, linkAbsolutized: true },
  },
  {
    id: "noscript-fallback",
    title: "Reader Rich Story noscript-fallback",
    head: () => "",
    body: (origin) => [
      `<p>Noscript fallback intro with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<figure><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-original="/assets/hero-original.ico" alt="Noscript fallback" /><noscript><img src="/assets/hero-noscript.ico" alt="Noscript fallback" /></noscript></figure>',
      "<p>Noscript fallback outro.</p>",
    ].join(""),
    expectations: { cleanedMode: true, figureRendered: true, imageRendered: true, linkAbsolutized: true, noscriptRemoved: true },
  },
  {
    id: "related-content-cleanup",
    title: "Reader Rich Story related-content cleanup",
    head: () => "",
    body: (origin) => [
      `<p>Lead paragraph with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<div class="related-widget" data-related-content="true">',
      '<button type="button">Powiazane artykuly</button>',
      '<button type="button">Przeczytaj takze</button>',
      '<button type="button">Zobacz rowniez</button>',
      "</div>",
      "<p>Closing paragraph confirms editorial prose still survives around removed related-content controls.</p>",
    ].join(""),
    expectations: { cleanedMode: true, linkAbsolutized: true, relatedContentRemoved: true },
  },
  {
    id: "decorative-image-cleanup",
    title: "Reader Rich Story decorative-image cleanup",
    head: () => "",
    body: (origin) => [
      `<p>Lead paragraph with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<figure><img src="/assets/hero.ico" alt="Main editorial image" /><figcaption>Main editorial caption</figcaption></figure>',
      '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="1" height="1" aria-hidden="true" /></p>',
      "<p>Closing paragraph confirms the decorative tracker image does not survive the reader sanitization pass.</p>",
    ].join(""),
    expectations: {
      cleanedMode: true,
      figureRendered: true,
      imageRendered: true,
      linkAbsolutized: true,
      decorativeImageRemoved: true,
    },
  },
  {
    id: "promo-widget-cleanup",
    title: "Reader Rich Story promo-widget cleanup",
    head: () => "",
    body: (origin) => [
      `<p>Lead paragraph with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<div class="promo-widget" data-promo-widget="true">',
      '<script>window.__promo = true;</script>',
      '<iframe src="/promo-widget-frame"></iframe>',
      '<form><input type="email" value="reader@example.com" /><button type="submit">Kup premium</button><select><option>Subskrybuj premium</option></select></form>',
      '<noscript>Oferta partnerska</noscript>',
      "</div>",
      "<p>Closing paragraph confirms the reader keeps article prose while removing interactive promo clutter.</p>",
    ].join(""),
    expectations: { cleanedMode: true, linkAbsolutized: true, promoWidgetRemoved: true },
  },
  {
    id: "premium-cleanup-stack",
    title: "Reader Rich Story premium cleanup stack",
    head: () => "",
    renderDocument: (origin) => `
      <html>
        <head>
          <title>Reader Rich Story premium cleanup stack</title>
          <meta property="og:title" content="Reader Rich Story premium cleanup stack" />
          <meta property="og:image" content="/assets/hero-meta.ico" />
          <meta property="og:image:alt" content="Metadata hero image" />
        </head>
        <body>
          <main>
            <article>
              <header>
                <img src="/assets/theme-badge.ico" alt="Theme badge" />
                <p>Kup premium</p>
              </header>
              <p>Lead paragraph with a <a href="/secondary-source">relative source link</a> for ${origin}.</p>
              <figure><img src="/assets/hero-inline.ico" alt="Inline editorial image" /><figcaption>Editorial caption</figcaption></figure>
              <aside class="related-widget">
                <button type="button">Powiazane artykuly</button>
                <button type="button">Przeczytaj takze</button>
              </aside>
              <div class="promo-widget" data-promo-widget="true">
                <iframe src="/promo-widget-frame"></iframe>
                <form><input type="email" value="reader@example.com" /><button type="submit">Subskrybuj premium</button></form>
              </div>
              <p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width="1" height="1" aria-hidden="true" /></p>
              <p>Closing paragraph confirms the reader keeps article prose while removing related controls, decorative chrome, and promo clutter.</p>
            </article>
          </main>
        </body>
      </html>
    `,
    expectations: {
      cleanedMode: true,
      figureRendered: true,
      imageRendered: true,
      linkAbsolutized: true,
      decorativeImageRemoved: true,
      promoWidgetRemoved: true,
      relatedContentRemoved: true,
    },
  },
  {
    id: "malformed-noisy",
    title: "Reader Rich Story malformed-noisy corpus",
    head: () => "",
    body: (origin) => [
      `<div><h2>Noise heading</h2><p>Broken <strong>tag<p>Still readable and <a href="/secondary-source">relative source link</a> for ${origin}.</p>`,
      '<script>alert("xss")</script>',
      '<style>.evil{display:none}</style>',
      '<figure><img src="/assets/hero.ico" alt="Noisy" /></figure>',
      "<ul><li>First</li><li>Second</li></ul>",
      "<blockquote><p>Recovered quote</p></blockquote>",
      "</div>",
    ].join(""),
    expectations: { cleanedMode: true, figureRendered: true, imageRendered: true, blockquoteRendered: true, listRendered: true, linkAbsolutized: true },
  },
  {
    id: "metadata-hero-noise",
    title: "Reader Rich Story metadata hero fallback",
    head: () => [
      '<meta property="og:title" content="Reader Rich Story metadata hero fallback" />',
      '<meta property="og:image" content="/assets/hero-meta.ico" />',
      '<meta property="og:image:alt" content="Metadata hero image" />',
    ].join(""),
    body: (origin) => [
      `<section><ol><li>Lead bullet for ${origin}.</li><li>Second bullet confirms the cleaned reader keeps editorial structure.</li></ol></section>`,
      '<div id="elevenlabs-audionative-widget" data-playerurl="https://elevenlabs.io/player/index.html" data-projectid="fixture">',
      'Loading the <a href="https://elevenlabs.io/text-to-speech">Elevenlabs Text to Speech</a> AudioNative Player...',
      "</div>",
      `<p>Publisher article body with a <a href="/secondary-source">relative source link</a> and enough prose to keep the cleaned reader in premium article mode after extraction.</p>`,
      "<p>Second paragraph verifies that metadata fallback can restore the missing hero image without leaking widget placeholder text into the readable article.</p>",
      '<figure><img src="/assets/hero-inline.ico" alt="Inline chart" /><figcaption>Inline chart caption</figcaption></figure>',
    ].join(""),
    expectations: {
      cleanedMode: true,
      figureRendered: true,
      imageRendered: true,
      listRendered: true,
      linkAbsolutized: true,
      noiseRemoved: true,
      heroImageInjected: true,
    },
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withStandardArtifact(results) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      { id: "reader-corpus-open", label: "Open reader corpus article", status: results.articleOpened ? "passed" : "failed" },
      { id: "reader-cleaned-mode", label: "Cleaned reading mode", status: results.cleanedMode ? "passed" : "failed" },
      { id: "reader-keyboard-toolbar", label: "Keyboard reaches reader toolbar", status: results.keyboardReachedBackButton && results.keyboardReachedNotesButton ? "passed" : "failed" },
    ],
    checkName: "check:reader",
    errors: {
      console: results.consoleErrors ?? [],
      page: results.pageErrors ?? [],
      harness: results.error ? [{ message: String(results.error) }] : [],
    },
    metadata: {
      corpus_count: results.corpus?.length ?? 0,
      evidence_tiers: results.evidenceTiers ?? null,
      link_hrefs: results.linkHrefs ?? [],
    },
    routes: [
      {
        id: "reader-rich-saved",
        route: "/read/saved",
        viewport: "desktop",
        status: results.status ?? "passed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.articleOpened && results.cleanedMode,
        overflow: null,
        keyboardReachable: results.keyboardReachedBackButton && results.keyboardReachedNotesButton,
        consoleErrorCount: results.consoleErrors?.length ?? 0,
        pageErrorCount: results.pageErrors?.length ?? 0,
      },
    ],
    runtime: results.runtime,
    screenshots,
    startedAt: RUN_STARTED_AT,
    status: results.status ?? "passed",
    targetUrls: {
      apiUrl: results.runtime?.apiUrl ?? null,
      webUrl: results.runtime?.webUrl ?? null,
    },
  });
}

function normalizeAuditText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function textContainsForbiddenFragment(value, fragments) {
  const normalized = normalizeAuditText(value);
  return fragments.some((fragment) => normalized.includes(normalizeAuditText(fragment)));
}

function getUrlPort(value) {
  const parsed = new URL(value);
  if (parsed.port) {
    return parsed.port;
  }
  return parsed.protocol === "https:" ? "443" : "80";
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

async function startFixtureServer() {
  const articleHtml = (caseDef, origin) => `
    <html>
      <head>
        <title>${caseDef.title}</title>
        ${caseDef.head ? caseDef.head(origin) : ""}
      </head>
      <body>
        <main>
          <article>
            <header>
              <h1>${caseDef.title}</h1>
            </header>
            ${caseDef.body(origin)}
          </article>
        </main>
      </body>
    </html>
  `;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/cases/")) {
      const [, , caseId, leaf] = url.pathname.split("/");
      const caseDef = READER_CORPUS_CASES.find((entry) => entry.id === caseId);
      if (!caseDef || leaf !== "article") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Fixture not found");
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(
        caseDef.renderDocument
          ? caseDef.renderDocument(`http://127.0.0.1:${server.address().port}`)
          : articleHtml(caseDef, `http://127.0.0.1:${server.address().port}`),
      );
      return;
    }

    if (url.pathname === "/secondary-source") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end("<html><body>Secondary source</body></html>");
      return;
    }

    if (url.pathname === "/promo-widget-frame") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end("<html><body>Promo widget frame</body></html>");
      return;
    }

    if (url.pathname.startsWith("/assets/") && existsSync(FIXTURE_IMAGE_PATH) && statSync(FIXTURE_IMAGE_PATH).isFile()) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "image/x-icon",
      });
      createReadStream(FIXTURE_IMAGE_PATH).pipe(response);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Fixture not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Nie udalo sie ustalic portu fixture servera dla czytnika.");
  }

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function captureAccessibilitySnapshot(page, selector) {
  try {
    return await page.$eval(selector, (root, selectorValue) => {
      const element = root;
      const summarize = (node) => ({
        tagName: node.tagName.toLowerCase(),
        role: node.getAttribute("role"),
        ariaLabel: node.getAttribute("aria-label"),
        ariaDescribedBy: node.getAttribute("aria-describedby"),
        text: (node.innerText || node.textContent || "").trim().slice(0, 240),
      });

      const collect = (query) =>
        Array.from(element.querySelectorAll(query))
          .map((node) => summarize(node))
          .slice(0, 12);

      return {
        selector: selectorValue,
        root: summarize(element),
        headings: collect("h1, h2, h3, h4, h5, h6"),
        controls: collect("button, input, select, textarea, a, [role='button'], [role='link']"),
        regions: collect("[role='region'], [role='dialog'], [role='alert'], [role='status']"),
      };
    }, selector);
  } catch (error) {
    return { selector, error: String(error) };
  }
}

async function captureFocusState(page) {
  return await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return null;
    }

    return {
      tagName: active.tagName.toLowerCase(),
      dataTestId: active.getAttribute("data-testid"),
      role: active.getAttribute("role"),
      ariaLabel: active.getAttribute("aria-label"),
      text: (active.innerText || active.textContent || "").trim().slice(0, 120),
    };
  });
}

async function captureReaderArticle(apiUrl, articleUrl) {
  const response = await fetch(`${apiUrl}/api/v1/workspace/capture`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: articleUrl }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Capture failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  if (!payload?.item?.id) {
    throw new Error(`Capture returned unexpected payload: ${JSON.stringify(payload)}`);
  }
  return payload.item;
}

async function tabUntilFocusText(page, expectedText, maxSteps = 20) {
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press("Tab");
    const activeText = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return "";
      }
      return (active.innerText || active.textContent || active.getAttribute("aria-label") || "").trim();
    });
    if (activeText.includes(expectedText)) {
      return true;
    }
  }
  return false;
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

async function collectReaderProseAudit(page, fixtureOrigin) {
  return await page.evaluate(
    ({ relatedFragments, promoFragments, fixtureOriginValue }) => {
      const prose = document.querySelector(".reader-article-prose");
      if (!(prose instanceof HTMLElement)) {
        return {
          blockquoteRendered: false,
          decorativeImageRemoved: true,
          figureRendered: false,
          imageRendered: false,
          linkAbsolutized: false,
          linkHrefs: [],
          listRendered: false,
          noscriptRemoved: true,
          promoWidgetRemoved: true,
          proseText: "",
          relatedContentRemoved: true,
        };
      }

      const proseText = prose.innerText || prose.textContent || "";
      const normalizedText = proseText
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const linkHrefs = Array.from(prose.querySelectorAll("a.reader-article-link")).map(
        (node) => node.getAttribute("href") ?? "",
      );
      const decorativeImages = Array.from(prose.querySelectorAll("img")).filter((image) => {
        const src = image.getAttribute("src") ?? "";
        const width = Number.parseInt(image.getAttribute("width") ?? "", 10);
        const height = Number.parseInt(image.getAttribute("height") ?? "", 10);
        return (
          !src
          || src.startsWith("data:")
          || src === "about:blank"
          || src === "#"
          || (Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1)
        );
      });
      const hasForbiddenFragment = (fragments) =>
        fragments.some((fragment) =>
          normalizedText.includes(
            fragment
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase(),
          ),
        );

      return {
        blockquoteRendered: prose.querySelector("blockquote.reader-article-quote") !== null,
        decorativeImageRemoved: decorativeImages.length === 0,
        figureRendered: prose.querySelector("figure.reader-article-figure") !== null,
        imageRendered: prose.querySelector("img.reader-article-image") !== null,
        linkAbsolutized: linkHrefs.some((href) => href === `${fixtureOriginValue}/secondary-source`),
        linkHrefs,
        listRendered:
          prose.querySelectorAll("ul.reader-article-list li, ol.reader-article-list li").length >= 2,
        noscriptRemoved: prose.querySelector("noscript") === null,
        promoWidgetRemoved:
          prose.querySelector("iframe, form, input, button, select, textarea, [data-promo-widget='true']") === null
          && !hasForbiddenFragment(promoFragments),
        proseText,
        relatedContentRemoved: !hasForbiddenFragment(relatedFragments),
      };
    },
    {
      relatedFragments: RELATED_CONTENT_FRAGMENTS,
      promoFragments: PROMO_WIDGET_FRAGMENTS,
      fixtureOriginValue: fixtureOrigin,
    },
  );
}

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const requestedWebUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const requestedApiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const runtime = await prepareSmokeRuntime({
    apiUrl: requestedApiUrl,
    forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
    label: "reader-rich-smoke",
    outputDir: OUTPUT_DIR,
    webUrl: requestedWebUrl,
  });
  const webUrl = runtime.webUrl;
  const apiUrl = runtime.apiUrl;

  try {
    await assertJsonHealth("web", `${webUrl}/api/health`);
    await assertJsonHealth("api", `${apiUrl}/health`);

    const fixtureServer = await startFixtureServer();

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await installUnexpectedLocalImageFallback(
      page,
      new Set([getUrlPort(webUrl), getUrlPort(apiUrl), getUrlPort(fixtureServer.origin)]),
    );
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

    const results = {
    status: "running",
    articleOpened: false,
    blockquoteRendered: false,
    cleanedMode: false,
    consoleErrors,
    a11ySnapshots: {
      articleShell: [],
      articleProse: [],
    },
    focusTrail: [],
    figureRendered: false,
    headingRendered: false,
    imageRendered: false,
    keyboardReachedBackButton: false,
    keyboardReachedNotesButton: false,
    linkAbsolutized: false,
    linkHrefs: [],
    listRendered: false,
    decorativeImageRemoved: true,
    promoWidgetRemoved: true,
    relatedContentRemoved: true,
    corpus: [],
    pageErrors,
    evidenceTiers: {
      browserSmokeGreen: true,
      manualScreenReaderSignOff: "pending",
      unitGreen: "apps/web/app/lib/reader-html.test.ts",
    },
    runtime: {
      apiUrl,
      authMode: runtime.authMode,
      isolated: runtime.isolated,
      runDir: runtime.runDir,
      webUrl,
    },
  };

    try {
    for (const caseDef of READER_CORPUS_CASES) {
      const capturedItem = await captureReaderArticle(apiUrl, `${fixtureServer.origin}/cases/${caseDef.id}/article`);
      await page.goto(`${webUrl}/read/saved?item=${encodeURIComponent(capturedItem.id)}`, {
        waitUntil: "domcontentloaded",
      });
      results.focusTrail.push({ step: `${caseDef.id}:landing`, focus: await captureFocusState(page) });

      await page.waitForFunction(
        (title) => document.body.innerText.includes(title),
        caseDef.title,
        { timeout: 30000 },
      );

      const proseVisible = await page.locator(".reader-article-prose").first().isVisible().catch(() => false);
      if (!proseVisible) {
        const readButton = page.getByRole("button", { name: "Czytaj artykul" }).first();
        if ((await readButton.count()) > 0) {
          await readButton.click();
        } else {
          await page.getByRole("button", { name: caseDef.title }).first().click();
        }
      }

      await page.waitForSelector(".reader-article-prose", { timeout: 20000 });
      await waitForReaderMediaToSettle(page);
      const articleShell = await captureAccessibilitySnapshot(page, "main");
      const articleProse = await captureAccessibilitySnapshot(page, ".reader-article-prose");
      results.a11ySnapshots.articleShell.push({ caseId: caseDef.id, snapshot: articleShell });
      results.a11ySnapshots.articleProse.push({ caseId: caseDef.id, snapshot: articleProse });

      const caseResult = {
        caseId: caseDef.id,
        articleOpened: false,
        cleanedMode: false,
        figureRendered: false,
        imageRendered: false,
        blockquoteRendered: false,
        heroImageInjected: false,
        listRendered: false,
        linkAbsolutized: false,
        noiseRemoved: true,
        noscriptRemoved: false,
        decorativeImageRemoved: true,
        promoWidgetRemoved: true,
        proseText: "",
        relatedContentRemoved: true,
        focusTrail: [],
      };

      caseResult.articleOpened = true;
      caseResult.cleanedMode = await page.locator("text=Czysty widok gotowy do czytania").count() > 0;
      caseResult.heroImageInjected =
        (await page.locator(`.reader-article-prose img.reader-article-image[src="${fixtureServer.origin}/assets/hero-meta.ico"]`).count()) > 0;
      Object.assign(caseResult, await collectReaderProseAudit(page, fixtureServer.origin));
      caseResult.noiseRemoved =
        !textContainsForbiddenFragment(caseResult.proseText, ["Elevenlabs", "AudioNative Player"]);

      await page.locator("body").click({ position: { x: 20, y: 20 } });
      caseResult.focusTrail.push({ step: "back-button", focus: await captureFocusState(page) });
      caseResult.keyboardReachedBackButton = await tabUntilFocusText(page, "Wroc do feedu");
      caseResult.focusTrail.push({ step: "notes-button", focus: await captureFocusState(page) });
      caseResult.keyboardReachedNotesButton = await tabUntilFocusText(page, "Notatki");

      for (const [key, expected] of Object.entries(caseDef.expectations)) {
        assert(caseResult[key] === expected, `Case ${caseDef.id} failed expectation ${key}: expected ${expected}, got ${caseResult[key]}`);
      }
      assert(caseResult.cleanedMode, `Case ${caseDef.id} did not switch into cleaned article mode.`);
      assert(caseResult.linkAbsolutized, `Case ${caseDef.id} did not absolutize the reader link.`);
      assert(caseResult.keyboardReachedBackButton, `Case ${caseDef.id} keyboard navigation did not reach the reader back button.`);
      assert(caseResult.keyboardReachedNotesButton, `Case ${caseDef.id} keyboard navigation did not reach the notes toggle in the reader toolbar.`);

      results.corpus.push(caseResult);
      results.articleOpened = results.articleOpened || caseResult.articleOpened;
      results.cleanedMode = results.cleanedMode || caseResult.cleanedMode;
      results.figureRendered = results.figureRendered || caseResult.figureRendered;
      results.imageRendered = results.imageRendered || caseResult.imageRendered;
      results.blockquoteRendered = results.blockquoteRendered || caseResult.blockquoteRendered;
      results.decorativeImageRemoved = results.decorativeImageRemoved && caseResult.decorativeImageRemoved;
      results.listRendered = results.listRendered || caseResult.listRendered;
      results.linkAbsolutized = results.linkAbsolutized || caseResult.linkAbsolutized;
      results.headingRendered = results.headingRendered || (await page.locator(".reader-article-prose h2").count()) > 0;
      results.keyboardReachedBackButton = results.keyboardReachedBackButton || caseResult.keyboardReachedBackButton;
      results.keyboardReachedNotesButton = results.keyboardReachedNotesButton || caseResult.keyboardReachedNotesButton;
      results.linkHrefs = Array.from(new Set([...results.linkHrefs, ...caseResult.linkHrefs]));
      results.promoWidgetRemoved = results.promoWidgetRemoved && caseResult.promoWidgetRemoved;
      results.relatedContentRemoved = results.relatedContentRemoved && caseResult.relatedContentRemoved;

      if (caseDef.id === "hero-image") {
        results.focusTrail.push({ step: "hero-image-body", focus: await captureFocusState(page) });
      }
    }

    assert(results.cleanedMode, "Reader corpus did not produce cleaned article mode.");
    assert(results.figureRendered, "Reader corpus did not render any figure wrapper.");
    assert(results.imageRendered, "Reader corpus did not render any article image.");
    assert(results.blockquoteRendered, "Reader corpus did not render a blockquote.");
    assert(results.listRendered, "Reader corpus did not render a formatted list.");
    assert(results.linkAbsolutized, "Reader corpus did not absolutize any reader link.");
    assert(results.decorativeImageRemoved, "Reader corpus leaked a decorative image into the cleaned reader.");
    assert(results.promoWidgetRemoved, "Reader corpus leaked promo-widget UI into the cleaned reader.");
    assert(results.relatedContentRemoved, "Reader corpus leaked related-content fragments into the cleaned reader.");
    assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
    assert(consoleErrors.length === 0, `consoleErrors=${JSON.stringify(consoleErrors)}`);

    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });
    results.status = "passed";
    } finally {
      await browser.close();
      await fixtureServer.close();
    }

    console.log(JSON.stringify(results, null, 2));
    await writeFile(OUTPUT_JSON, JSON.stringify(withStandardArtifact(results), null, 2), "utf8");
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
