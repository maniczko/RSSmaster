import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
const OUTPUT_JSON = path.join(OUTPUT_DIR, "magazines-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "magazines-smoke.png");
const RUN_STARTED_AT = new Date();
const MAGAZINES_ROUTE = "/magazines";
const MAGAZINE_LAYOUT_VIEWPORTS = [
  { id: "desktop-1440", width: 1440, height: 1000 },
  { id: "desktop-1180", width: 1180, height: 900 },
  { id: "tablet-1024", width: 1024, height: 900 },
  { id: "compact-800", width: 800, height: 900 },
  { id: "mobile-390", width: 390, height: 844 },
];
const PRIMARY_MAGAZINE_VIEWPORT_ID = MAGAZINE_LAYOUT_VIEWPORTS[0].id;
const WAIT_TIMEOUT_MS = 120000;
const TERMINAL_SYNC_STATES = new Set(["partial_success", "failed", "canceled", "completed"]);
const PREMIUM_READER_SELECTORS = [
  "[data-testid='premium-reader-surface']",
  "[data-testid='reader-article-width']",
  "[data-testid='reader-send-kindle']",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getViewportLabel(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

function getViewportScreenshotPath(viewport) {
  if (viewport.id === PRIMARY_MAGAZINE_VIEWPORT_ID) {
    return OUTPUT_SCREENSHOT;
  }
  return path.join(OUTPUT_DIR, `magazines-smoke-${getViewportLabel(viewport)}.png`);
}

function summarizeViewportFailures(check) {
  const failures = [];
  const initialLayout = check.initialLayout ?? {};
  const anchorLayout = check.anchorLayout ?? {};

  if (!check.ready) {
    failures.push("route-not-ready");
  }
  if (initialLayout.overflow || anchorLayout.overflow) {
    failures.push("horizontal-overflow");
  }
  if ((initialLayout.coveredFocusTargets?.length ?? 0) > 0 || (anchorLayout.coveredFocusTargets?.length ?? 0) > 0) {
    failures.push("covered-focus-target");
  }
  if ((initialLayout.overlapIssues?.length ?? 0) > 0 || (anchorLayout.overlapIssues?.length ?? 0) > 0) {
    failures.push("overlap");
  }
  if ((initialLayout.minWidthIssues?.length ?? 0) > 0 || (anchorLayout.minWidthIssues?.length ?? 0) > 0) {
    failures.push("min-width");
  }
  if ((initialLayout.touchTargetIssues?.length ?? 0) > 0 || (anchorLayout.touchTargetIssues?.length ?? 0) > 0) {
    failures.push("touch-target");
  }
  if (!check.anchorProbe?.anchored) {
    failures.push("read-before-send-anchor");
  }
  if (check.issueFirstCopy === false) {
    failures.push("issue-first-copy");
  }
  if ((check.blockingConsoleErrors?.length ?? 0) > 0) {
    failures.push("console");
  }
  if ((check.pageErrors?.length ?? 0) > 0) {
    failures.push("page-error");
  }

  return failures;
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
}

async function assertWebReachable(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`web reachability failed: ${response.status} for ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`web reachability returned unexpected content type "${contentType}" for ${url}`);
  }
}

async function readJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForSyncRun(apiUrl, runId) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await readJson(`${apiUrl}/api/v1/sync/runs/${runId}`);
    if (TERMINAL_SYNC_STATES.has(latest.run?.status)) {
      return latest.run;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Sync run ${runId} did not finish. Latest=${JSON.stringify(latest)}`);
}

function createFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const address = server.address();
      const origin = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}` : "http://127.0.0.1";

      if (requestUrl.pathname === "/feed.xml") {
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/rss+xml; charset=utf-8",
        });
        response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Magazine Smoke Feed</title>
    <link>${origin}</link>
    <description>Magazine smoke fixture</description>
    <item>
      <title>Magazine Smoke Candidate One</title>
      <link>${origin}/articles/one</link>
      <guid>magazine-smoke-candidate-one</guid>
      <description>Pierwszy artykuł kontrolny w testowym wydaniu magazynu.</description>
      <pubDate>Tue, 28 Apr 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Magazine Smoke Candidate Two</title>
      <link>${origin}/articles/two</link>
      <guid>magazine-smoke-candidate-two</guid>
      <description>Drugi artykuł kontrolny w testowym wydaniu magazynu.</description>
      <pubDate>Tue, 28 Apr 2026 07:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);
        return;
      }

      if (requestUrl.pathname.startsWith("/articles/")) {
        const articleName = requestUrl.pathname.endsWith("one")
          ? "Magazine Smoke Candidate One"
          : "Magazine Smoke Candidate Two";
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
        });
        response.end(`<!doctype html>
<html lang="pl">
  <head><title>${articleName}</title></head>
  <body>
    <article>
      <h1>${articleName}</h1>
      <p>Ten tekst pozwala smoke testowi sprawdzić listę wydań oraz wejście w zawartość magazynu.</p>
    </article>
  </body>
</html>`);
        return;
      }

      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Fixture not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Fixture server did not expose a TCP port."));
        return;
      }
      resolve({
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });

    server.on("error", reject);
  });
}

async function seedMagazineIssue(apiUrl, fixtureOrigin) {
  await readJson(`${apiUrl}/api/v1/channels`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ input_url: `${fixtureOrigin}/feed.xml`, category: "magazine-smoke" }),
  });

  const syncPayload = await readJson(`${apiUrl}/api/v1/sync/runs`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "manual" }),
  });
  const syncRun = await waitForSyncRun(apiUrl, syncPayload.run.id);
  assert(["completed", "partial_success"].includes(syncRun.status), `Unexpected sync status: ${JSON.stringify(syncRun)}`);

  const itemPayload = await readJson(`${apiUrl}/api/v1/items?scope=all&sort=newest&limit=20`);
  const candidates = itemPayload.items.filter((item) => item.title.startsWith("Magazine Smoke Candidate"));
  assert(candidates.length === 2, `Expected two magazine fixture items: ${JSON.stringify(itemPayload.items)}`);

  for (const item of candidates) {
    await readJson(`${apiUrl}/api/v1/items/${item.id}/state`, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ digest_candidate: true, is_read: true }),
    });
  }

  const buildPayload = await readJson(`${apiUrl}/api/v1/digests/build`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      digest_candidates_only: true,
      include_read: true,
      limit: 25,
      title: "Magazyn smoke 1/2026",
    }),
  });

  assert(buildPayload.digest?.id, `Digest build did not return a digest: ${JSON.stringify(buildPayload)}`);
  assert(buildPayload.digest.article_count === 2, `Unexpected magazine article count: ${JSON.stringify(buildPayload.digest)}`);
  return buildPayload.digest.id;
}

async function collectRouteMetrics(page) {
  return page.evaluate((premiumReaderSelectors) => {
    const headings = Array.from(document.querySelectorAll("h1, h2"))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const main = document.querySelector("main");
    const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();

    return {
      bodyPreview: bodyText.slice(0, 1200),
      headingCount: headings.length,
      headings,
      hasAppShell: Boolean(document.querySelector(".app-shell")),
      hasMain: Boolean(main),
      mainText: (main?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1200),
      premiumReaderSelectorProbe: premiumReaderSelectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
      })),
      title: document.title,
    };
  }, PREMIUM_READER_SELECTORS);
}

async function collectMagazineLayoutHealth(page) {
  return page.evaluate(() => {
    const FOCUS_SELECTOR = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const TOUCH_TARGET_SELECTOR = [
      "[data-testid='magazine-screen'] button",
      "[data-testid='magazine-screen'] a.secondary-button",
      "[data-testid='magazine-issue-card']",
    ].join(",");
    const FIT_SELECTOR = [
      "[data-testid='magazine-screen']",
      ".magazine-page-grid",
      "[data-testid='magazine-issue-list']",
      "[data-testid='magazine-active-issue']",
      "[data-testid='magazine-reading-preview']",
      "[data-testid='magazine-issue-groups']",
      "[data-testid='magazine-issue-card']",
      "[data-testid='magazine-issue-article']",
      ".magazine-secondary-grid",
      "[data-testid='magazine-next-issue-panel']",
      ".magazine-delivery-status",
    ].join(",");
    const OVERLAP_SELECTOR = [
      "[data-testid='magazine-issue-list']",
      "[data-testid='magazine-active-issue']",
      "[data-testid='magazine-reading-preview']",
      "[data-testid='magazine-issue-groups']",
      "[data-testid='magazine-next-issue-panel']",
      ".magazine-delivery-status",
      ".magazine-feedback-slot",
      ".magazine-issue-detail-actions > *",
    ].join(",");
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
      document.scrollingElement?.scrollWidth ?? 0,
    );

    const roundRect = (rect) => ({
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
    });

    const getLabel = (element) => {
      const text = (element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 90);
      const testId = element.getAttribute("data-testid");
      const className = (element.getAttribute("class") || "").replace(/\s+/g, ".").slice(0, 90);
      return `${element.tagName.toLowerCase()}${testId ? `[data-testid="${testId}"]` : ""}${className ? `.${className}` : ""}${text ? `:${text}` : ""}`;
    };

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0.01
      );
    };

    const isInViewport = (rect) =>
      rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const overflowOffenders = Array.from(document.querySelectorAll("body *"))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: getLabel(element),
          minWidth: style.minWidth,
          overflowX: style.overflowX,
          rect: roundRect(rect),
        };
      })
      .filter((item) => item.rect.right > viewportWidth + 2 || item.rect.left < -2 || item.rect.width > viewportWidth + 2)
      .slice(0, 20);

    const stickyHeaderElements = Array.from(document.querySelectorAll("body *"))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const className = element.getAttribute("class") || "";
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute("role") || "";
        return { className, element, rect, role, style, tagName };
      })
      .filter(({ className, rect, role, style, tagName }) => {
        const isTopLayer = style.position === "fixed" || style.position === "sticky";
        const looksLikeHeader =
          tagName === "header" ||
          role === "banner" ||
          className.includes("app-header") ||
          className.includes("workspace-appbar") ||
          className.includes("topbar");
        return isTopLayer && looksLikeHeader && rect.top <= 8 && rect.bottom > 8;
      });
    const stickyHeaderBottom = Math.max(0, ...stickyHeaderElements.map(({ rect }) => rect.bottom));

    const coveredFocusTargets = Array.from(document.querySelectorAll(FOCUS_SELECTOR))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const insideStickyHeader = stickyHeaderElements.some(({ element: header }) => header === element || header.contains(element));
        const point = {
          x: clamp(rect.left + Math.min(rect.width / 2, 24), 1, Math.max(1, viewportWidth - 1)),
          y: clamp(rect.top + Math.min(rect.height / 2, 24), 1, Math.max(1, viewportHeight - 1)),
        };
        const topElement = isInViewport(rect) ? document.elementFromPoint(point.x, point.y) : null;
        const coveredByElement =
          topElement &&
          topElement !== element &&
          !element.contains(topElement) &&
          !topElement.contains(element);
        const coveredByStickyHeader =
          !insideStickyHeader && stickyHeaderBottom > 0 && rect.top < stickyHeaderBottom - 1 && rect.bottom > stickyHeaderBottom + 1;
        return {
          coveredBy: coveredByElement ? getLabel(topElement) : null,
          coveredByStickyHeader,
          label: getLabel(element),
          point: { x: Math.round(point.x), y: Math.round(point.y) },
          rect: roundRect(rect),
        };
      })
      .filter((item) => item.coveredBy || item.coveredByStickyHeader)
      .slice(0, 20);

    const criticalElements = [...new Set(Array.from(document.querySelectorAll(OVERLAP_SELECTOR)).filter(isVisible))];
    const overlapIssues = [];
    for (let leftIndex = 0; leftIndex < criticalElements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < criticalElements.length; rightIndex += 1) {
        const leftElement = criticalElements[leftIndex];
        const rightElement = criticalElements[rightIndex];
        if (leftElement.contains(rightElement) || rightElement.contains(leftElement)) {
          continue;
        }
        const leftRect = leftElement.getBoundingClientRect();
        const rightRect = rightElement.getBoundingClientRect();
        const xOverlap = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
        const yOverlap = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
        if (xOverlap > 3 && yOverlap > 3) {
          overlapIssues.push({
            first: getLabel(leftElement),
            firstRect: roundRect(leftRect),
            overlap: { height: Math.round(yOverlap), width: Math.round(xOverlap) },
            second: getLabel(rightElement),
            secondRect: roundRect(rightRect),
          });
        }
      }
    }

    const minWidthIssues = Array.from(document.querySelectorAll(FIT_SELECTOR))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: getLabel(element),
          minWidth: style.minWidth,
          rect: roundRect(rect),
        };
      })
      .filter((item) => item.rect.width > viewportWidth + 2 || item.rect.left < -2 || item.rect.right > viewportWidth + 2)
      .slice(0, 20);

    const touchTargetIssues = Array.from(document.querySelectorAll(TOUCH_TARGET_SELECTOR))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: getLabel(element),
          rect: roundRect(rect),
        };
      })
      .filter((item) => item.rect.width < 40 || item.rect.height < 40)
      .slice(0, 20);

    return {
      coveredFocusTargets,
      documentWidth,
      minWidthIssues,
      overflow: documentWidth > viewportWidth + 1,
      overflowOffenders,
      overlapIssues: overlapIssues.slice(0, 20),
      stickyHeaderBottom: Math.round(stickyHeaderBottom),
      stickyHeaderCount: stickyHeaderElements.length,
      touchTargetIssues,
      viewportHeight,
      viewportWidth,
    };
  });
}

async function verifyReadBeforeSendAnchor(page) {
  const readBeforeSendLink = page.getByRole("link", { name: /Czytaj przed wysyłką/i }).first();
  await readBeforeSendLink.waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(100);
  await readBeforeSendLink.scrollIntoViewIfNeeded();
  const beforeClick = await page.evaluate(() => ({
    hash: window.location.hash,
    scrollY: Math.round(window.scrollY),
  }));
  await readBeforeSendLink.click({ timeout: 10000 });
  await page.waitForFunction(() => window.location.hash === "#magazine-reading-preview", null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(250);

  return page.evaluate((before) => {
    const target = document.getElementById("magazine-reading-preview");
    const roundRect = (rect) => ({
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
    });
    const isVisible = (element) => {
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const stickyHeaderBottom = Math.max(
      0,
      ...Array.from(document.querySelectorAll("body *"))
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const className = element.getAttribute("class") || "";
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute("role") || "";
          const looksLikeHeader =
            tagName === "header" ||
            role === "banner" ||
            className.includes("app-header") ||
            className.includes("workspace-appbar") ||
            className.includes("topbar");
          return (style.position === "fixed" || style.position === "sticky") && looksLikeHeader && rect.top <= 8
            ? rect.bottom
            : 0;
        }),
    );
    const rect = target?.getBoundingClientRect();
    const targetRect = rect ? roundRect(rect) : null;
    const hashMatches = window.location.hash === "#magazine-reading-preview";
    const targetVisible = Boolean(rect && rect.bottom > stickyHeaderBottom + 2 && rect.top < window.innerHeight);
    const targetBelowStickyHeader = Boolean(rect && rect.top >= stickyHeaderBottom - 2);
    const targetNearAnchorTop = Boolean(
      rect && rect.top <= Math.max(stickyHeaderBottom + 180, Math.round(window.innerHeight * 0.45)),
    );

    return {
      anchored: hashMatches && targetVisible && targetBelowStickyHeader && targetNearAnchorTop,
      beforeClick: before,
      hash: window.location.hash,
      hashMatches,
      scrollY: Math.round(window.scrollY),
      stickyHeaderBottom: Math.round(stickyHeaderBottom),
      targetBelowStickyHeader,
      targetNearAnchorTop,
      targetRect,
      targetVisible,
    };
  }, beforeClick);
}

async function waitForSeededMagazineIssue(page, runtime, digestId) {
  await page.goto(`${runtime.webUrl}${MAGAZINES_ROUTE}?issue=${encodeURIComponent(digestId)}`, {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: /Wydanie 1\/2026/i }).waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("magazine-active-issue").waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("magazine-reading-preview").waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("magazine-issue-groups").waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("magazine-issue-group").first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("heading", { name: /Magazine Smoke Candidate One/i }).waitFor({ state: "visible", timeout: 30000 });
  await page.getByText(/Czytaj wydanie przed/i).waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("magazine-issue-article").first().waitFor({ state: "visible", timeout: 30000 });
}

async function runMagazineViewportCheck(browser, viewport, runtime, digestId) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push({
        type: message.type(),
        text: message.text(),
        url: page.url(),
      });
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: String(error),
      url: page.url(),
    });
  });

  const screenshotPath = getViewportScreenshotPath(viewport);
  const check = {
    blockingConsoleErrors: consoleErrors,
    consoleErrors,
    id: viewport.id,
    pageErrors,
    ready: false,
    route: `${MAGAZINES_ROUTE}?issue=${digestId}`,
    screenshot: screenshotPath,
    status: "failed",
    viewport: getViewportLabel(viewport),
    viewportSize: viewport,
  };

  try {
    await waitForSeededMagazineIssue(page, runtime, digestId);
    check.ready = true;
    check.finalUrl = page.url();
    check.initialLayout = await collectMagazineLayoutHealth(page);
    check.anchorProbe = await verifyReadBeforeSendAnchor(page);
    check.anchorLayout = await collectMagazineLayoutHealth(page);
    check.metrics = await collectRouteMetrics(page);
    check.issueFirstCopy = await page.evaluate(() => {
      const mainText = (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ");
      return !/(Kandydaci|Kolejka digestu|Podejrzyj digest|rssmaster digest)/i.test(mainText);
    });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    check.failures = summarizeViewportFailures(check);
    check.status = check.failures.length === 0 ? "passed" : "failed";
  } catch (error) {
    check.error = error instanceof Error ? error.stack ?? error.message : String(error);
    check.finalUrl = page.url();
    check.initialLayout = check.initialLayout ?? (await collectMagazineLayoutHealth(page).catch(() => null));
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    check.failures = summarizeViewportFailures(check);
  } finally {
    await context.close();
  }

  return check;
}

function buildArtifact(results) {
  const viewportChecks = results.viewportChecks ?? [];
  const screenshotPaths =
    results.screenshotPaths ??
    (viewportChecks.length > 0 ? viewportChecks.map((check) => check.screenshot).filter(Boolean) : [OUTPUT_SCREENSHOT]);
  const allViewportLayoutsPassed = viewportChecks.length > 0 && viewportChecks.every((check) => check.status === "passed");
  const allConsoleErrors = [...(results.consoleErrors ?? []), ...viewportChecks.flatMap((check) => check.consoleErrors ?? [])];
  const allPageErrors = [...(results.pageErrors ?? []), ...viewportChecks.flatMap((check) => check.pageErrors ?? [])];
  const screenshots = collectScreenshotEvidence(screenshotPaths, {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });

  return attachPlaywrightArtifact(results, {
    actions: [
      {
        id: "magazines-heading",
        label: "Magazyny heading is visible",
        route: MAGAZINES_ROUTE,
        status: results.headingVisible ? "passed" : "failed",
      },
      {
        id: "magazines-console-health",
        label: "No console or page errors",
        route: MAGAZINES_ROUTE,
        status: allConsoleErrors.length === 0 && allPageErrors.length === 0 ? "passed" : "failed",
      },
      {
        id: "magazines-issue-list",
        label: "Magazine issue list and detail are visible",
        route: MAGAZINES_ROUTE,
        status: results.issueListVisible && results.activeIssueVisible && results.issueGroupsVisible ? "passed" : "failed",
      },
      {
        id: "magazines-read-before-send",
        label: "Opened magazine issue can be read before sending",
        route: MAGAZINES_ROUTE,
        status: results.readingPreviewVisible ? "passed" : "failed",
      },
      {
        id: "magazines-issue-deeplink",
        label: "Opened magazine issue is reflected in the URL and restorable from a direct link",
        route: MAGAZINES_ROUTE,
        status: results.issueUrlVisible && results.issueDirectLinkVisible ? "passed" : "failed",
      },
      {
        id: "magazines-issue-preflight",
        label: "Preflight runs for the opened magazine issue",
        route: MAGAZINES_ROUTE,
        status: results.issuePreflightVisible ? "passed" : "failed",
      },
      {
        id: "magazines-no-overflow",
        label: "Seeded magazine issue has no horizontal overflow in every target viewport",
        route: MAGAZINES_ROUTE,
        status: allViewportLayoutsPassed ? "passed" : "failed",
      },
      {
        id: "magazines-issue-first-copy",
        label: "Magazine route is issue-first, not digest queue-first",
        route: MAGAZINES_ROUTE,
        status: results.issueFirstCopy ? "passed" : "failed",
      },
      ...viewportChecks.map((check) => ({
        id: `magazines-layout-${check.id}`,
        label: `Seeded magazine issue layout ${check.viewport}`,
        route: check.route,
        status: check.status,
        finalUrl: check.finalUrl,
        screenshot: check.screenshot,
        notes: {
          failures: check.failures ?? [],
          anchor: check.anchorProbe ?? null,
        },
      })),
    ],
    checkName: "check:magazines",
    errors: {
      console: allConsoleErrors,
      page: allPageErrors,
      harness: [
        ...(results.error ? [{ message: String(results.error) }] : []),
        ...viewportChecks
          .filter((check) => check.error)
          .map((check) => ({ message: String(check.error), viewport: check.viewport })),
      ],
    },
    metadata: {
      headings: results.metrics?.headings ?? [],
      issue_first_copy: results.issueFirstCopy ?? false,
      issue_direct_link_visible: results.issueDirectLinkVisible ?? false,
      issue_url_visible: results.issueUrlVisible ?? false,
      layout_viewports: MAGAZINE_LAYOUT_VIEWPORTS.map((viewport) => ({
        id: viewport.id,
        size: getViewportLabel(viewport),
      })),
      layout_viewport_failures: viewportChecks
        .filter((check) => check.status !== "passed")
        .map((check) => ({
          failures: check.failures ?? [],
          viewport: check.viewport,
        })),
      reading_preview_visible: results.readingPreviewVisible ?? false,
      premium_reader_selectors: PREMIUM_READER_SELECTORS,
      premium_reader_selector_probe: results.metrics?.premiumReaderSelectorProbe ?? [],
      premium_reader_probe_note:
        "Selectors are recorded for QA visibility; this smoke only asserts the /magazines route unless a reader article is opened by a broader reader check.",
      seeded_digest_id: results.seededDigestId ?? null,
    },
    routes:
      viewportChecks.length > 0
        ? viewportChecks.map((check) => ({
            id: `magazines-${check.id}`,
            route: check.route,
            viewport: check.viewport,
            status: check.status,
            finalUrl: check.finalUrl,
            screenshot: check.screenshot,
            ready: check.ready,
            overflow:
              typeof check.initialLayout?.overflow === "boolean" || typeof check.anchorLayout?.overflow === "boolean"
                ? Boolean(check.initialLayout?.overflow || check.anchorLayout?.overflow)
                : null,
            consoleErrorCount: check.consoleErrors?.length ?? 0,
            pageErrorCount: check.pageErrors?.length ?? 0,
            layoutIssues: {
              anchor: check.anchorProbe ?? null,
              coveredFocusTargets: [
                ...(check.initialLayout?.coveredFocusTargets ?? []),
                ...(check.anchorLayout?.coveredFocusTargets ?? []),
              ],
              minWidthIssues: [
                ...(check.initialLayout?.minWidthIssues ?? []),
                ...(check.anchorLayout?.minWidthIssues ?? []),
              ],
              overlapIssues: [
                ...(check.initialLayout?.overlapIssues ?? []),
                ...(check.anchorLayout?.overlapIssues ?? []),
              ],
              touchTargetIssues: [
                ...(check.initialLayout?.touchTargetIssues ?? []),
                ...(check.anchorLayout?.touchTargetIssues ?? []),
              ],
            },
          }))
        : [
            {
              id: "magazines",
              route: MAGAZINES_ROUTE,
              viewport: "desktop",
              status: results.status ?? "failed",
              finalUrl: results.finalUrl,
              screenshot: OUTPUT_SCREENSHOT,
              ready: results.headingVisible && results.activeIssueVisible,
              overflow: results.overflow ?? null,
              consoleErrorCount: results.consoleErrors?.length ?? 0,
              pageErrorCount: results.pageErrors?.length ?? 0,
            },
          ],
    runtime: results.runtime,
    screenshots,
    startedAt: RUN_STARTED_AT,
    status: results.status ?? "failed",
    targetUrls: {
      apiUrl: results.runtime?.apiUrl ?? null,
      webUrl: results.runtime?.webUrl ?? null,
    },
  });
}

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const fixtureServer = await createFixtureServer();
  const requestedWebUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const requestedApiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const runtime = await prepareSmokeRuntime({
    apiUrl: requestedApiUrl,
    forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
    label: "magazines-smoke",
    outputDir: OUTPUT_DIR,
    webUrl: requestedWebUrl,
  });

  const results = {
    checkedAt: new Date().toISOString(),
    consoleErrors: [],
    pageErrors: [],
    runtime,
    status: "failed",
  };

  let browser = null;
  let page = null;

  try {
    await assertWebReachable(`${runtime.webUrl}${MAGAZINES_ROUTE}`);
    await assertJsonHealth("api", `${runtime.apiUrl}/health`);
    results.seededDigestId = await seedMagazineIssue(runtime.apiUrl, fixtureServer.origin);

    browser = await chromium.launch({ headless: true });
    const issueFlowContext = await browser.newContext({
      viewport: {
        width: MAGAZINE_LAYOUT_VIEWPORTS[0].width,
        height: MAGAZINE_LAYOUT_VIEWPORTS[0].height,
      },
    });
    page = await issueFlowContext.newPage();

    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        results.consoleErrors.push({
          type: message.type(),
          text: message.text(),
          url: page.url(),
        });
      }
    });

    page.on("pageerror", (error) => {
      results.pageErrors.push({
        message: String(error),
        url: page.url(),
      });
    });

    await page.goto(`${runtime.webUrl}${MAGAZINES_ROUTE}`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: /Magazyny/i }).waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("magazine-issue-list").waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("magazine-issue-card").first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByTestId("magazine-issue-card").first().click();
    await page.waitForFunction(
      (issueId) => new URL(window.location.href).searchParams.get("issue") === issueId,
      results.seededDigestId,
      { timeout: 30000 },
    );
    results.issueUrlVisible = true;

    await waitForSeededMagazineIssue(page, runtime, results.seededDigestId);
    results.issueDirectLinkVisible = true;
    await page.getByRole("button", { name: /Preflight tego wydania/i }).first().click();
    await page.getByText(/Preflight wydania:/i).waitFor({ state: "visible", timeout: 30000 });
    results.headingVisible = true;
    results.issueListVisible = true;
    results.activeIssueVisible = true;
    results.readingPreviewVisible = true;
    results.issueGroupsVisible = true;
    results.issuePreflightVisible = true;
    results.finalUrl = page.url();
    results.metrics = await collectRouteMetrics(page);
    await issueFlowContext.close();
    page = null;

    results.viewportChecks = [];
    for (const viewport of MAGAZINE_LAYOUT_VIEWPORTS) {
      const check = await runMagazineViewportCheck(browser, viewport, runtime, results.seededDigestId);
      results.viewportChecks.push(check);
      console.log(
        `[check:magazines] viewport ${check.viewport}: ${check.status}${check.failures?.length ? ` (${check.failures.join(", ")})` : ""}`,
      );
    }

    results.screenshotPaths = results.viewportChecks.map((check) => check.screenshot).filter(Boolean);
    const failedViewportChecks = results.viewportChecks.filter((check) => check.status !== "passed");
    const primaryViewportCheck = results.viewportChecks[0];
    results.metrics = primaryViewportCheck?.metrics ?? results.metrics;
    results.overflow = results.viewportChecks.some(
      (check) => Boolean(check.initialLayout?.overflow || check.anchorLayout?.overflow),
    );
    results.issueFirstCopy = results.viewportChecks.length > 0 && results.viewportChecks.every((check) => check.issueFirstCopy);
    results.issueDirectLinkVisible = results.viewportChecks.length > 0 && results.viewportChecks.every((check) => check.ready);

    assert(results.headingVisible, "Route /magazines did not render a visible Magazyny heading.");
    assert(results.issueListVisible, "Route /magazines did not render a visible issue list.");
    assert(results.activeIssueVisible, "Route /magazines did not render a visible active issue.");
    assert(results.readingPreviewVisible, "Route /magazines did not render the read-before-send magazine preview.");
    assert(results.issueGroupsVisible, "Route /magazines did not render grouped issue articles.");
    assert(results.issueUrlVisible, "Route /magazines did not push the opened issue id into the URL.");
    assert(results.issueDirectLinkVisible, "Route /magazines did not restore the seeded issue from a direct issue link.");
    assert(results.issuePreflightVisible, "Route /magazines did not run preflight for the visible issue.");
    assert(results.issueFirstCopy, "Route /magazines still exposes digest/candidate queue copy as primary UX.");
    assert(
      failedViewportChecks.length === 0,
      `Seeded /magazines?issue layout failed: ${failedViewportChecks
        .map((check) => `${check.viewport}:${(check.failures ?? ["unknown"]).join("+")}`)
        .join(", ")}`,
    );
    assert(results.consoleErrors.length === 0, `Magazines smoke logged console issues: ${results.consoleErrors.map((entry) => entry.text).join(" | ")}`);
    assert(results.pageErrors.length === 0, `Magazines smoke saw page errors: ${results.pageErrors.map((entry) => entry.message).join(" | ")}`);

    results.status = "passed";
    console.log("[check:magazines] PASS");
    console.log(`[check:magazines] manual UI target: ${runtime.webUrl}${MAGAZINES_ROUTE}`);
    console.log(`[check:magazines] evidence: ${OUTPUT_JSON}`);
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    if (page) {
      results.finalUrl = page.url();
      results.metrics = await collectRouteMetrics(page).catch((metricsError) => ({
        error: metricsError instanceof Error ? metricsError.message : String(metricsError),
      }));
      results.overflow = await page
        .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
        .catch(() => null);
      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true }).catch(() => {});
    }
    console.error(`[check:magazines] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    await writeFile(OUTPUT_JSON, `${JSON.stringify(buildArtifact(results), null, 2)}\n`, "utf8");
    await runtime.close();
    await fixtureServer.close();
  }
}

main().catch(async (error) => {
  const failurePayload = {
    checkedAt: new Date().toISOString(),
    consoleErrors: [],
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    pageErrors: [],
    status: "failed",
  };
  await ensureOutputDir();
  await writeFile(OUTPUT_JSON, `${JSON.stringify(buildArtifact(failurePayload), null, 2)}\n`, "utf8");
  console.error(`[check:magazines] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
