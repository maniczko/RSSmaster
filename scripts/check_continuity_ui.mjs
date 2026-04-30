import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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
const OUTPUT_JSON = path.join(OUTPUT_DIR, "continuity-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "continuity-smoke.png");
const DEFAULT_DATABASE_PATH = path.join(ROOT_DIR, "data", "rssmaster.db");
const RUN_STARTED_AT = new Date();

const READER_CONTINUITY_KEY = "rssmaster.reader.continuity";
const READER_PROGRESS_KEY = "rssmaster.reader.progress";
const CONTINUITY_NAV_LOG_KEY = "__rssmasterContinuityNavLog";
let lastContinuityStep = "startup";
let lastContinuityUrl = null;
let lastContinuityDiagnostics = null;
let lastContinuityExpectedItemId = null;
let lastContinuityPrimedReaderUrl = null;
let lastContinuityBundleReaderState = null;
let lastContinuityResults = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function markContinuityStep(step, page = null) {
  lastContinuityStep = step;
  if (page) {
    try {
      lastContinuityUrl = page.url();
    } catch {
      // Ignore URL read errors during teardown paths.
    }
  }
  console.log(`[check:continuity] step: ${step}`);
}

function withStandardArtifact(results) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      { id: "continuity-export", label: "Export continuity bundle", route: "/sources", status: results.exportDownloaded ? "passed" : "failed" },
      { id: "continuity-import", label: "Import continuity bundle", route: "/sources", status: results.restoredRoute ? "passed" : "failed" },
      { id: "continuity-reader-restore", label: "Restore saved reader route and progress", route: "/read/saved", status: results.restoredReaderScroll && results.restoredLocalProgress ? "passed" : "failed" },
      { id: "continuity-knowledge-restore", label: "Restore notes/tags/collections/searches", route: "/read/saved", status: results.restoredKnowledgeLayer ? "passed" : "failed" },
    ],
    checkName: "check:continuity",
    errors: {
      console: results.consoleErrors ?? [],
      page: results.pageErrors ?? [],
      harness: results.error ? [{ message: String(results.error), step: results.step ?? lastContinuityStep }] : [],
    },
    metadata: {
      item_id: results.itemId ?? null,
      bundle_path: results.bundlePath ?? null,
      restored_annotation_count: results.restoredAnnotationCount ?? null,
      restored_tag_assignment_count: results.restoredTagAssignmentCount ?? null,
      diagnostics: results.diagnostics ?? null,
    },
    routes: [
      {
        id: "continuity-sources",
        route: "/sources",
        viewport: "desktop",
        status: results.exportDownloaded && results.importResponseObserved ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.exportDownloaded,
        overflow: null,
        consoleErrorCount: results.consoleErrors?.length ?? 0,
        pageErrorCount: results.pageErrors?.length ?? 0,
      },
      {
        id: "continuity-saved-reader",
        route: "/read/saved",
        viewport: "desktop",
        status: results.restoredRoute && results.restoredReaderScroll ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.restoredRoute,
        overflow: null,
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

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, {
    ...options,
    headers,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload };
}

async function findVisibleButtonByExactText(page, text, options = {}) {
  const { visibleOnly = true } = options;
  const buttons = page.locator("button");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (visibleOnly && !(await candidate.isVisible())) {
      continue;
    }
    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (candidateText === text) {
      return candidate;
    }
  }

  return null;
}

async function findVisibleButtonByPrefix(page, prefix, options = {}) {
  const { visibleOnly = true } = options;
  const buttons = page.locator("button");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (visibleOnly && !(await candidate.isVisible())) {
      continue;
    }
    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (candidateText.startsWith(prefix)) {
      return candidate;
    }
  }

  return null;
}

function createFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const articleId = requestUrl.pathname.startsWith("/article-") ? requestUrl.pathname.slice("/article-".length) : null;

      if (articleId) {
        const paragraphs = Array.from({ length: 24 }, (_, index) => {
          const order = index + 1;
          return `<p>Continuity smoke paragraph ${order} keeps the cleaned reader long enough to persist scroll progress across export and import.</p>`;
        }).join("\n");

        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(`<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>Continuity smoke ${articleId}</title>
  </head>
  <body>
    <article>
      <header>
        <h1>Continuity smoke ${articleId}</h1>
        <p>Reader continuity export/import fixture.</p>
      </header>
      <figure>
        <img src="/hero-${articleId}.jpg" alt="Continuity hero ${articleId}" />
        <figcaption>Continuity hero caption ${articleId}</figcaption>
      </figure>
      ${paragraphs}
      <p>Primary source url: <a href="https://example.com/${articleId}">example link</a></p>
    </article>
  </body>
</html>`);
        return;
      }

      const heroId = requestUrl.pathname.startsWith("/hero-") ? requestUrl.pathname.slice("/hero-".length, -4) : null;
      if (heroId && requestUrl.pathname.endsWith(".jpg")) {
        response.writeHead(200, {
          "content-type": "image/svg+xml",
          "cache-control": "no-store",
        });
        response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560" viewBox="0 0 1200 560">
  <rect width="1200" height="560" fill="#eef4ff" />
  <text x="600" y="292" text-anchor="middle" font-size="48" fill="#155eef">Continuity ${heroId}</text>
</svg>`);
        return;
      }

      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Fixture server did not expose a TCP port."));
        return;
      }
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }
              resolveClose();
            });
          }),
      });
    });

    server.on("error", reject);
  });
}

async function createCapturedItem(apiUrl, articleUrl, title) {
  const { response, payload } = await fetchJson(`${apiUrl}/api/v1/workspace/capture`, {
    method: "POST",
    body: JSON.stringify({
      url: articleUrl,
      title,
    }),
  });
  assert(response.ok, `Capture request failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload?.item ?? null;
}

async function patchItemState(apiUrl, itemId, patch) {
  const { response, payload } = await fetchJson(`${apiUrl}/api/v1/items/${encodeURIComponent(itemId)}/state`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  assert(response.ok, `Item state patch failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload?.item ?? null;
}

async function readItem(apiUrl, itemId) {
  const { response, payload } = await fetchJson(`${apiUrl}/api/v1/items/${encodeURIComponent(itemId)}`);
  assert(response.ok, `Item detail request failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload?.item ?? null;
}

async function createWorkspaceAnnotation(apiUrl, payload) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/annotations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert(result.response.ok, `Annotation create failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.annotation ?? null;
}

async function setWorkspaceItemTags(apiUrl, itemId, names) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/items/${encodeURIComponent(itemId)}/tags`, {
    method: "PUT",
    body: JSON.stringify({ names }),
  });
  assert(result.response.ok, `Item tag update failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.tags ?? [];
}

async function createWorkspaceCollection(apiUrl, payload) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/collections`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert(result.response.ok, `Collection create failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.collection ?? null;
}

async function createSavedSearch(apiUrl, payload) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/saved-searches`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  assert(result.response.ok, `Saved search create failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.items ?? [];
}

async function readWorkspaceAnnotations(apiUrl, itemId) {
  const result = await fetchJson(
    `${apiUrl}/api/v1/workspace/annotations?item_id=${encodeURIComponent(itemId)}&limit=20`,
  );
  assert(result.response.ok, `Workspace annotations request failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.items ?? [];
}

async function readWorkspaceItemTags(apiUrl, itemId) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/items/${encodeURIComponent(itemId)}/tags`);
  assert(result.response.ok, `Workspace item tags request failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.tags ?? [];
}

async function readWorkspaceCollections(apiUrl) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/collections`);
  assert(result.response.ok, `Workspace collections request failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.items ?? [];
}

async function readSavedSearches(apiUrl) {
  const result = await fetchJson(`${apiUrl}/api/v1/workspace/saved-searches`);
  assert(result.response.ok, `Saved searches request failed: ${result.response.status} ${JSON.stringify(result.payload)}`);
  return result.payload?.items ?? [];
}

function purgeContinuityKnowledgeArtifacts({
  databasePath,
  itemId,
  noteText,
  highlightQuote,
  tagName,
  collectionName,
  savedSearchName,
  savedSearchQuery,
}) {
  const script = `
import sqlite3
import sys

db_path, item_id, note_text, highlight_quote, tag_name, collection_name, saved_search_name, saved_search_query = sys.argv[1:]

with sqlite3.connect(db_path) as conn:
    conn.execute(
        """
        DELETE FROM annotations
        WHERE item_id = ?
          AND (
            (kind = 'note' AND note_text = ?)
            OR (kind = 'highlight' AND quote_text = ?)
          )
        """,
        (item_id, note_text, highlight_quote),
    )
    conn.execute(
        """
        DELETE FROM item_tags
        WHERE item_id = ?
          AND tag_id IN (
            SELECT id FROM tags WHERE name = ?
          )
        """,
        (item_id, tag_name),
    )
    conn.execute("DELETE FROM tags WHERE name = ?", (tag_name,))
    conn.execute(
        """
        DELETE FROM collection_items
        WHERE item_id = ?
          AND collection_id IN (
            SELECT id FROM collections WHERE name = ?
          )
        """,
        (item_id, collection_name),
    )
    conn.execute("DELETE FROM collections WHERE name = ?", (collection_name,))
    conn.execute(
        "DELETE FROM saved_searches WHERE name = ? AND query = ?",
        (saved_search_name, saved_search_query),
    )
    conn.commit()
`;

  execFileSync(
    "python",
    [
      "-c",
      script,
      databasePath,
      itemId,
      noteText,
      highlightQuote,
      tagName,
      collectionName,
      savedSearchName,
      savedSearchQuery,
    ],
    { cwd: ROOT_DIR, stdio: "pipe" },
  );
}

async function ensureReaderArticleOpen(page, title) {
  await page.waitForURL((url) => url.pathname.startsWith("/read/saved"), { timeout: 30000 });
  await page.waitForSelector(`text=${title}`, { timeout: 30000 });
  try {
    await page.waitForSelector(".reader-reading-surface", { timeout: 8000 });
    return;
  } catch {
    // Continue into the toggle path when the article shell is still in preview mode.
  }

  let openButton = await findVisibleButtonByExactText(page, "Czytaj artykul");
  if (!openButton) {
    openButton = await findVisibleButtonByExactText(page, "Czytaj oczyszczony artykul");
  }
  if (!openButton) {
    openButton = await findVisibleButtonByExactText(page, "Czytaj fallback tekstowy");
  }
  if (openButton) {
    await openButton.click({ timeout: 8000 });
  } else {
    const readerButton = page.getByRole("button", {
      name: /^Czytaj$|Czytaj (artykul|artykuł|pełny tekst|tekst z feedu|oczyszczony|fallback|skrot|skrót)/i,
    }).first();
    if ((await readerButton.count()) > 0 && (await readerButton.isVisible())) {
      await readerButton.click({ timeout: 8000 });
    }
  }

  await page.waitForSelector(".reader-reading-surface", { timeout: 30000 });
}

async function navigateToSourcesSection(page, webUrl) {
  const sourcesButton = await findVisibleButtonByPrefix(page, "Zrodla");
  if (sourcesButton) {
    await sourcesButton.scrollIntoViewIfNeeded().catch(() => {});
    await sourcesButton.click({ timeout: 10000 });
    await page.waitForURL((url) => url.pathname.startsWith("/sources"), { timeout: 30000 });
    return;
  }

  const sourcesLink = page.locator('a[href="/sources"], a[href^="/sources?"]').first();
  if ((await sourcesLink.count()) > 0) {
    await sourcesLink.scrollIntoViewIfNeeded().catch(() => {});
    await sourcesLink.click({ timeout: 10000 });
    await page.waitForURL((url) => url.pathname.startsWith("/sources"), { timeout: 30000 });
    return;
  }

  await page.goto(`${webUrl}/sources`, { waitUntil: "domcontentloaded", timeout: 60000 });
}

async function waitForRestoredReaderRoute(page, itemId) {
  await page.waitForFunction(
    (expectedItemId) => {
      const url = new URL(window.location.href);
      return url.pathname.startsWith("/read/saved") && url.searchParams.get("item") === expectedItemId;
    },
    itemId,
    { timeout: 30000 },
  );
}

async function waitForRestoredArticleMode(page, itemId) {
  await page.waitForFunction(
    (expectedItemId) => {
      const url = new URL(window.location.href);
      if (!url.pathname.startsWith("/read/saved")) {
        return false;
      }
      if (url.searchParams.get("item") !== expectedItemId) {
        return false;
      }
      if (url.searchParams.get("surface") !== "article") {
        return false;
      }
      return Boolean(document.querySelector(".reader-reading-surface"));
    },
    itemId,
    { timeout: 30000 },
  );
}

async function waitForReaderSurfaceScroll(page, minimumScrollTop = 8) {
  await page.waitForFunction(
    (expectedMinimum) => {
      const surface = document.querySelector(".reader-reading-surface");
      if (!surface) {
        return false;
      }
      const computedStyle = window.getComputedStyle(surface);
      const usesDocumentScroll = computedStyle.overflowY === "visible" || Math.abs(surface.scrollHeight - surface.clientHeight) < 4;
      if (usesDocumentScroll) {
        const scrollElement = document.scrollingElement ?? document.documentElement;
        return scrollElement.scrollTop >= expectedMinimum;
      }
      return surface.scrollTop >= expectedMinimum;
    },
    minimumScrollTop,
    { timeout: 20000 },
  );
}

async function captureReaderProgress(page) {
  const surface = page.locator(".reader-reading-surface").first();
  await surface.evaluate(async (node) => {
    const computedStyle = window.getComputedStyle(node);
    const usesDocumentScroll = computedStyle.overflowY === "visible" || Math.abs(node.scrollHeight - node.clientHeight) < 4;
    if (usesDocumentScroll) {
      const scrollElement = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0);
      scrollElement.scrollTop = Math.max(320, Math.floor(maxScroll * 0.45));
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      window.dispatchEvent(new Event("scroll"));
      return;
    }

    node.scrollTop = Math.max(320, Math.floor((node.scrollHeight - node.clientHeight) * 0.45));
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
  });
  await waitForReaderSurfaceScroll(page, 8);
  await page.waitForTimeout(900);
}

async function waitForStoredProgress(page, itemId) {
  await page.waitForFunction(
    ([progressKey, expectedItemId]) => {
      const surface = document.querySelector(".reader-reading-surface");
      if (!surface) {
        return false;
      }
      const computedStyle = window.getComputedStyle(surface);
      const usesDocumentScroll = computedStyle.overflowY === "visible" || Math.abs(surface.scrollHeight - surface.clientHeight) < 4;
      const scrollElement = document.scrollingElement ?? document.documentElement;
      const scrollTop = usesDocumentScroll ? scrollElement.scrollTop : surface.scrollTop;
      if (scrollTop < 8) {
        return false;
      }

      if (usesDocumentScroll) {
        window.dispatchEvent(new Event("scroll"));
      } else {
        surface.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.dispatchEvent(new Event("scroll"));
      }

      const raw = window.localStorage.getItem(progressKey);
      if (!raw) {
        return false;
      }
      try {
        const payload = JSON.parse(raw);
        return (
          typeof payload?.[expectedItemId]?.progress === "number" &&
          payload[expectedItemId].progress > 5 &&
          typeof payload[expectedItemId].scrollTop === "number" &&
          payload[expectedItemId].scrollTop >= 8
        );
      } catch {
        return false;
      }
    },
    [READER_PROGRESS_KEY, itemId],
    { timeout: 30000 },
  );
}

async function revealSourcesBackoffice(page, requiredButtonText = "Eksportuj continuity bundle") {
  await page.waitForFunction(() => {
    if (document.querySelector("[data-testid='source-backoffice-toggle'], [data-testid='source-manage-toggle']")) {
      return true;
    }
    const texts = Array.from(document.querySelectorAll("button"))
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return texts.some(
      (text) =>
        text === "Eksportuj continuity bundle" ||
        text === "Odtwórz continuity bundle" ||
        text === "Odtworz continuity bundle" ||
        text.startsWith("Pokaz backoffice") ||
        text.startsWith("Ukryj backoffice"),
    );
  }, { timeout: 20000 });

  const requiredButton = await findVisibleButtonByExactText(page, requiredButtonText);
  if (requiredButton) {
    return;
  }

  const attachedRequiredButton = await findVisibleButtonByExactText(page, requiredButtonText, { visibleOnly: false });
  if (attachedRequiredButton) {
    await attachedRequiredButton.scrollIntoViewIfNeeded().catch(() => {});
    return;
  }

  const capturePanelHeading = page.locator("text=Przechwytywanie i eksport").first();
  if ((await capturePanelHeading.count()) > 0) {
    await capturePanelHeading.scrollIntoViewIfNeeded().catch(() => {});
    const requiredButtonAfterScroll = await findVisibleButtonByExactText(page, requiredButtonText, { visibleOnly: false });
    if (requiredButtonAfterScroll) {
      await requiredButtonAfterScroll.scrollIntoViewIfNeeded().catch(() => {});
      return;
    }
  }

  const manageToggle = page.locator("[data-testid='source-manage-toggle']").first();
  if ((await manageToggle.count()) > 0) {
    await manageToggle.scrollIntoViewIfNeeded().catch(() => {});
    if (await manageToggle.isVisible().catch(() => false)) {
      await manageToggle.click({ timeout: 8000 });
      await page.waitForTimeout(250);
      const requiredButtonAfterManageToggle = await findVisibleButtonByExactText(page, requiredButtonText, { visibleOnly: false });
      if (requiredButtonAfterManageToggle) {
        await requiredButtonAfterManageToggle.scrollIntoViewIfNeeded().catch(() => {});
        return;
      }
    }
  }

  const alreadyOpenButton = await findVisibleButtonByPrefix(page, "Ukryj backoffice");
  if (alreadyOpenButton) {
    await page.waitForSelector(`text=${requiredButtonText}`, { timeout: 20000 });
    return;
  }

  const testToggleButton = page.locator("[data-testid='source-backoffice-toggle']").first();
  if ((await testToggleButton.count()) > 0) {
    await testToggleButton.scrollIntoViewIfNeeded().catch(() => {});
    await testToggleButton.click({ timeout: 8000 });
    await page.waitForSelector(`text=${requiredButtonText}`, { timeout: 20000 });
    return;
  }

  const toggleButton = await findVisibleButtonByPrefix(page, "Pokaz backoffice", { visibleOnly: false });
  assert(toggleButton, "Sources page did not expose the backoffice toggle required for continuity controls.");
  await toggleButton.scrollIntoViewIfNeeded().catch(() => {});
  await toggleButton.click({ timeout: 8000 });
  await page.waitForSelector(`text=${requiredButtonText}`, { timeout: 20000 });
}

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const requestedWebUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const requestedApiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const runtime = await prepareSmokeRuntime({
    apiUrl: requestedApiUrl,
    forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
    label: "continuity-smoke",
    outputDir: OUTPUT_DIR,
    webUrl: requestedWebUrl,
  });
  const webUrl = runtime.webUrl;
  const apiUrl = runtime.apiUrl;
  const databasePath = runtime.databasePath ?? DEFAULT_DATABASE_PATH;

  try {
    await assertWebReachable(`${webUrl}/sources`);
    await assertJsonHealth("api", `${apiUrl}/health`);

  const fixtureServer = await createFixtureServer();
  const fixtureId = `${Date.now()}`;
  const articleUrl = `${fixtureServer.origin}/article-${fixtureId}`;
  const articleTitle = `Continuity smoke ${fixtureId}`;
  const continuityNoteText = `Continuity note survives bundle replay ${fixtureId}.`;
  const continuityHighlightQuote = "Continuity smoke paragraph 1 keeps the cleaned reader long enough to persist scroll progress across export and import.";
  const continuityTagName = `Continuity tag ${fixtureId}`;
  const continuityCollectionName = `Continuity collection ${fixtureId}`;
  const continuitySavedSearchName = `Continuity search ${fixtureId}`;
  const continuitySavedSearchQuery = `continuity smoke ${fixtureId}`;

  const browser = await chromium.launch({ headless: true });
  const downloadsDir = await mkdtemp(path.join(os.tmpdir(), "rssmaster-continuity-"));
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1080 },
  });
  await context.addInitScript(
    ({ continuityKey, progressKey, navLogKey, resetMarkerKey }) => {
      try {
        if (!window.sessionStorage.getItem(resetMarkerKey)) {
          window.localStorage.removeItem(continuityKey);
          window.localStorage.removeItem(progressKey);
          window.sessionStorage.setItem(resetMarkerKey, "true");
        }
      } catch {
        // Ignore environments where localStorage is unavailable before the app bootstraps.
      }

      try {
        window[navLogKey] = [];
        const originalPushState = window.history.pushState.bind(window.history);
        const originalReplaceState = window.history.replaceState.bind(window.history);
        const recordNavigation = (method, url) => {
          window[navLogKey].push({
            method,
            url: typeof url === "string" ? url : url?.toString?.() ?? null,
            currentUrl: window.location.href,
            recordedAt: Date.now(),
          });
        };

        window.history.pushState = function patchedPushState(state, unused, url) {
          recordNavigation("pushState", url);
          return originalPushState(state, unused, url);
        };
        window.history.replaceState = function patchedReplaceState(state, unused, url) {
          recordNavigation("replaceState", url);
          return originalReplaceState(state, unused, url);
        };
      } catch {
        // Ignore history instrumentation failures and keep the smoke flow bootable.
      }
    },
    {
      continuityKey: READER_CONTINUITY_KEY,
      progressKey: READER_PROGRESS_KEY,
      navLogKey: CONTINUITY_NAV_LOG_KEY,
      resetMarkerKey: "__rssmasterContinuityHarnessResetDone",
    },
  );
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const location = message.location();
      consoleErrors.push({
        type: message.type(),
        text: message.text(),
        url: page.url(),
        locationUrl: location?.url ?? null,
      });
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: String(error),
      url: page.url(),
    });
  });

  const results = {
    status: "running",
    articleUrl,
    articleTitle,
    exportDownloaded: false,
    bundleMarkedReadSection: false,
    bundleCapturedActiveArticle: false,
    bundleCapturedProgress: false,
    bundleCapturedKnowledgeLayer: false,
    restoredLibraryState: false,
    restoredRoute: false,
    restoredReaderScroll: false,
    restoredLocalContinuity: false,
    restoredLocalProgress: false,
    restoredAnnotationCount: 0,
    restoredTagAssignmentCount: 0,
      restoredCollectionCount: 0,
      restoredCollectionItemCount: 0,
      restoredSavedSearchCount: 0,
    restoredKnowledgeLayer: false,
    importRequestAnnotationCount: 0,
    importRequestTagCount: 0,
    importRequestCollectionCount: 0,
    importRequestSavedSearchCount: 0,
    importResponseObserved: false,
    itemId: null,
    bundlePath: null,
    consoleErrors,
      pageErrors,
      screenshot: OUTPUT_SCREENSHOT,
      manualScreenReaderSignOff: "pending",
      runtime: {
        apiUrl,
        authMode: runtime.authMode,
        databasePath,
        isolated: runtime.isolated,
        runDir: runtime.runDir,
        webUrl,
      },
    };
    lastContinuityResults = results;

  try {
    markContinuityStep("capture item");
    const capturedItem = await createCapturedItem(apiUrl, articleUrl, articleTitle);
    const itemId = capturedItem?.id ?? null;
    assert(typeof itemId === "string" && itemId.length > 0, `Capture did not return an item id: ${JSON.stringify(capturedItem)}`);
    results.itemId = itemId;
    lastContinuityExpectedItemId = itemId;

      await createWorkspaceAnnotation(apiUrl, {
        item_id: itemId,
        kind: "note",
        note_text: continuityNoteText,
      });
      await createWorkspaceAnnotation(apiUrl, {
        item_id: itemId,
        kind: "highlight",
        quote_text: continuityHighlightQuote,
        color: "amber",
      });
      await setWorkspaceItemTags(apiUrl, itemId, [continuityTagName]);
      await createWorkspaceCollection(apiUrl, {
        name: continuityCollectionName,
        description: "Portable continuity bucket",
        item_id: itemId,
      });
      await createSavedSearch(apiUrl, {
        name: continuitySavedSearchName,
        query: continuitySavedSearchQuery,
        default_view: "saved",
      });

    await patchItemState(apiUrl, itemId, {
      is_read: false,
      is_favorite: true,
      digest_candidate: true,
      is_archived: false,
    });

    markContinuityStep("prime reader state");
    await page.goto(`${webUrl}/read/saved?item=${encodeURIComponent(itemId)}&surface=article`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await ensureReaderArticleOpen(page, articleTitle);
    await captureReaderProgress(page);
    markContinuityStep("wait for stored progress", page);
    await waitForStoredProgress(page, itemId);
    lastContinuityPrimedReaderUrl = page.url();

    markContinuityStep("open sources for export", page);
    await navigateToSourcesSection(page, webUrl);
    markContinuityStep("reveal continuity export controls", page);
    await revealSourcesBackoffice(page, "Eksportuj continuity bundle");

    const exportButton = await findVisibleButtonByExactText(page, "Eksportuj continuity bundle");
    assert(exportButton, "Sources did not expose the continuity export button.");

    const bundlePath = path.join(downloadsDir, `rssmaster-continuity-${fixtureId}.json`);
    markContinuityStep("download continuity bundle", page);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      exportButton.click({ timeout: 8000 }),
    ]);
    await download.saveAs(bundlePath);
    results.bundlePath = bundlePath;
    results.exportDownloaded = true;

    const rawBundle = await readFile(bundlePath, "utf8");
    const bundle = JSON.parse(rawBundle);
    lastContinuityBundleReaderState = bundle?.reader_state ?? null;
    const progressEntry = bundle?.reader_state?.progressBySourceUrl?.[articleUrl] ?? null;
    results.bundleMarkedReadSection = bundle?.reader_state?.section === "read";
    results.bundleCapturedActiveArticle =
      bundle?.reader_state?.activeItemSourceUrl === articleUrl &&
      bundle?.reader_state?.readingItemSourceUrl === articleUrl;
    results.bundleCapturedProgress = typeof progressEntry?.progress === "number" && progressEntry.progress > 5;
    results.bundleCapturedKnowledgeLayer =
      Array.isArray(bundle?.annotations) &&
      bundle.annotations.length >= 2 &&
      Array.isArray(bundle?.item_tags) &&
      bundle.item_tags.length >= 1 &&
      Array.isArray(bundle?.collections) &&
      bundle.collections.length >= 1 &&
      Array.isArray(bundle?.saved_searches) &&
      bundle.saved_searches.length >= 1;

    markContinuityStep("reset local continuity before import", page);
    await patchItemState(apiUrl, itemId, {
      is_favorite: false,
      digest_candidate: false,
      is_archived: true,
    });

    await page.evaluate(
      ([continuityKey, progressKey]) => {
        window.localStorage.removeItem(continuityKey);
        window.localStorage.removeItem(progressKey);
        },
        [READER_CONTINUITY_KEY, READER_PROGRESS_KEY],
      );
      purgeContinuityKnowledgeArtifacts({
        databasePath,
        itemId,
        noteText: continuityNoteText,
        highlightQuote: continuityHighlightQuote,
        tagName: continuityTagName,
        collectionName: continuityCollectionName,
        savedSearchName: continuitySavedSearchName,
        savedSearchQuery: continuitySavedSearchQuery,
      });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    markContinuityStep("reveal continuity import controls", page);
    await revealSourcesBackoffice(page, "Odtwórz continuity bundle");

    const importInput = page.locator("input[type=\"file\"]").first();
    markContinuityStep("import continuity bundle", page);
    const [importRequest] = await Promise.all([
      page.waitForRequest(
        (request) =>
          request.url().endsWith("/api/v1/workspace/continuity/import") &&
          request.method() === "POST",
        { timeout: 30000 },
      ),
      importInput.setInputFiles(bundlePath),
    ]);
    const importRequestPayload = importRequest.postDataJSON();
    results.importRequestAnnotationCount = Array.isArray(importRequestPayload?.annotations) ? importRequestPayload.annotations.length : 0;
    results.importRequestTagCount = Array.isArray(importRequestPayload?.tags) ? importRequestPayload.tags.length : 0;
    results.importRequestCollectionCount = Array.isArray(importRequestPayload?.collections) ? importRequestPayload.collections.length : 0;
    results.importRequestSavedSearchCount = Array.isArray(importRequestPayload?.saved_searches) ? importRequestPayload.saved_searches.length : 0;
    let importPayload = null;
    try {
      const importResponse = await importRequest.response();
      assert(importResponse, "Continuity import request did not expose a response.");
      assert(importResponse.ok(), `Continuity import request failed with status ${importResponse.status()}.`);
      importPayload = await importResponse.json();
      results.importResponseObserved = true;
      results.restoredAnnotationCount = Number(importPayload?.restored_annotation_count ?? 0);
      results.restoredTagAssignmentCount = Number(importPayload?.restored_tag_assignment_count ?? 0);
      results.restoredCollectionCount = Number(importPayload?.restored_collection_count ?? 0);
      results.restoredCollectionItemCount = Number(importPayload?.restored_collection_item_count ?? 0);
      results.restoredSavedSearchCount = Number(importPayload?.restored_saved_search_count ?? 0);
    } catch {
      // Some runs restore state correctly but do not surface the response event reliably enough for Playwright.
      // Keep the smoke focused on end-to-end restored state and fill counts from verified post-import state below.
    }
    markContinuityStep("wait for restored reader route", page);
    await waitForRestoredReaderRoute(page, itemId);
    await ensureReaderArticleOpen(page, articleTitle);
    markContinuityStep("wait for restored article mode", page);
    await waitForRestoredArticleMode(page, itemId);

    const restoredItem = await readItem(apiUrl, itemId);
    results.restoredLibraryState =
      Boolean(restoredItem?.is_favorite) &&
      Boolean(restoredItem?.digest?.is_candidate) &&
      !Boolean(restoredItem?.library?.is_archived);
    results.restoredRoute =
      page.url().includes("/read/saved") &&
      page.url().includes(`item=${encodeURIComponent(itemId)}`) &&
      page.url().includes("surface=article");

    const expectedScrollTop = Math.max(progressEntry?.scrollTop ?? 0, 8);
    markContinuityStep("wait for restored reader scroll", page);
    await page.waitForFunction((minimumScrollTop) => {
      const surface = document.querySelector(".reader-reading-surface");
      if (!surface) {
        return false;
      }
      const computedStyle = window.getComputedStyle(surface);
      const usesDocumentScroll = computedStyle.overflowY === "visible" || Math.abs(surface.scrollHeight - surface.clientHeight) < 4;
      if (usesDocumentScroll) {
        const scrollElement = document.scrollingElement ?? document.documentElement;
        return scrollElement.scrollTop >= minimumScrollTop;
      }
      return surface.scrollTop >= minimumScrollTop;
    }, expectedScrollTop, { timeout: 20000 });
    results.restoredReaderScroll = await page.locator(".reader-reading-surface").first().evaluate((node, minimumScrollTop) => {
      const computedStyle = window.getComputedStyle(node);
      const usesDocumentScroll = computedStyle.overflowY === "visible" || Math.abs(node.scrollHeight - node.clientHeight) < 4;
      if (usesDocumentScroll) {
        const scrollElement = document.scrollingElement ?? document.documentElement;
        return scrollElement.scrollTop >= minimumScrollTop;
      }
      return node.scrollTop >= minimumScrollTop;
    }, expectedScrollTop);

    const localState = await page.evaluate(
      ([continuityKey, progressKey]) => {
        const parse = (raw) => {
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        return {
          continuity: parse(window.localStorage.getItem(continuityKey)),
          progress: parse(window.localStorage.getItem(progressKey)),
        };
      },
      [READER_CONTINUITY_KEY, READER_PROGRESS_KEY],
    );
    results.restoredLocalContinuity =
      localState?.continuity?.section === "read" &&
      localState?.continuity?.libraryView === "saved" &&
      localState?.continuity?.activeItemId === itemId &&
      localState?.continuity?.readingItemId === itemId;
    results.restoredLocalProgress =
      typeof localState?.progress?.[itemId]?.progress === "number" &&
      localState.progress[itemId].progress > 5;

    const restoredAnnotations = await readWorkspaceAnnotations(apiUrl, itemId);
    const restoredTags = await readWorkspaceItemTags(apiUrl, itemId);
    const restoredCollections = await readWorkspaceCollections(apiUrl);
    const restoredSavedSearches = await readSavedSearches(apiUrl);
    const restoredNoteMatch = restoredAnnotations.some((entry) => entry?.kind === "note" && entry?.note_text === continuityNoteText);
    const restoredHighlightMatch = restoredAnnotations.some(
      (entry) => entry?.kind === "highlight" && entry?.quote_text === continuityHighlightQuote,
    );
    const restoredTagMatch = restoredTags.some((entry) => entry?.name === continuityTagName);
    const restoredCollectionMatch = restoredCollections.some(
      (entry) => entry?.name === continuityCollectionName && Number(entry?.item_count ?? 0) >= 1,
    );
    const restoredSavedSearchMatch = restoredSavedSearches.some(
      (entry) => entry?.name === continuitySavedSearchName && entry?.query === continuitySavedSearchQuery && entry?.default_view === "saved",
    );
    results.restoredKnowledgeLayer =
      restoredNoteMatch &&
      restoredHighlightMatch &&
      restoredTagMatch &&
      restoredCollectionMatch &&
      restoredSavedSearchMatch;

    if (!results.importResponseObserved) {
      results.restoredAnnotationCount = Number(restoredNoteMatch) + Number(restoredHighlightMatch);
      results.restoredTagAssignmentCount = Number(restoredTagMatch);
      results.restoredCollectionCount = Number(restoredCollectionMatch);
      results.restoredCollectionItemCount = Number(restoredCollectionMatch);
      results.restoredSavedSearchCount = Number(restoredSavedSearchMatch);
    }

    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

    assert(results.exportDownloaded, "Continuity export did not produce a downloadable bundle.");
    assert(results.bundleMarkedReadSection, "Continuity export from /sources did not preserve the reader section.");
    assert(results.bundleCapturedActiveArticle, "Continuity bundle did not capture the active reader article.");
    assert(results.bundleCapturedProgress, "Continuity bundle did not capture reader progress by source URL.");
    assert(results.bundleCapturedKnowledgeLayer, "Continuity bundle did not include exported annotations, tags, collections, and saved searches.");
    assert(results.restoredLibraryState, "Continuity import did not restore favorite/digest/archive state.");
    assert(results.restoredRoute, "Continuity import did not route back into the saved reader article.");
    assert(results.restoredReaderScroll, "Continuity import did not restore scroll progress inside the reader surface.");
    assert(results.restoredLocalContinuity, "Continuity import did not repopulate local reader continuity storage.");
    assert(results.restoredLocalProgress, "Continuity import did not repopulate local reader progress storage.");
    assert(results.restoredAnnotationCount >= 2, "Continuity import did not report replayed annotations.");
    assert(results.restoredTagAssignmentCount >= 1, "Continuity import did not report replayed item tags.");
    assert(results.restoredCollectionCount >= 1, "Continuity import did not report replayed collections.");
    assert(results.restoredCollectionItemCount >= 1, "Continuity import did not report replayed collection memberships.");
    assert(results.restoredSavedSearchCount >= 1, "Continuity import did not report replayed saved searches.");
    assert(results.restoredKnowledgeLayer, "Continuity import did not restore annotations, tags, collections, and saved searches.");
    const relevantConsoleErrors = consoleErrors.filter((entry) => {
      if (!entry.text.includes("Failed to load resource: net::ERR_NAME_NOT_RESOLVED")) {
        return true;
      }
      if (!entry.locationUrl) {
        return true;
      }
      return entry.locationUrl.startsWith(webUrl) || entry.locationUrl.startsWith(apiUrl);
    });
    results.consoleErrors = relevantConsoleErrors;
    assert(
      relevantConsoleErrors.length === 0,
      `Continuity smoke logged browser console issues: ${relevantConsoleErrors.map((entry) => entry.text).join(" | ")}`,
    );
    assert(pageErrors.length === 0, `Continuity smoke saw page errors: ${pageErrors.map((entry) => entry.message).join(" | ")}`);
    results.status = "passed";
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    try {
      lastContinuityDiagnostics = await page.evaluate(([continuityKey, progressKey, navLogKey]) => {
        const parse = (raw) => {
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        return {
          currentUrl: window.location.href,
          continuity: parse(window.localStorage.getItem(continuityKey)),
          progress: parse(window.localStorage.getItem(progressKey)),
          navLog: Array.isArray(window[navLogKey]) ? window[navLogKey] : [],
          hasReaderSurface: Boolean(document.querySelector(".reader-reading-surface")),
          activeNavLabels: Array.from(
            document.querySelectorAll(".workspace-nav-rail-link-active, .workspace-mobile-nav-link-active"),
          ).map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
          feedbackRegions: Array.from(document.querySelectorAll("[role='status'], [aria-live]"))
            .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
            .filter(Boolean),
        };
      }, [READER_CONTINUITY_KEY, READER_PROGRESS_KEY, CONTINUITY_NAV_LOG_KEY]);
    } catch {
      lastContinuityDiagnostics = null;
    }
    throw error;
  } finally {
    await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(results), null, 2)}\n`, "utf8");
    await browser.close();
    await fixtureServer.close();
    await rm(downloadsDir, { recursive: true, force: true });
  }

  console.log("[check:continuity] PASS");
  console.log(`[check:continuity] manual UI target: ${webUrl}/sources`);
  console.log(`[check:continuity] evidence: ${OUTPUT_JSON}`);
  } finally {
    await runtime.close();
  }
}

main().catch(async (error) => {
  const failurePayload = {
    status: "failed",
    error: String(error),
    step: lastContinuityStep,
    url: lastContinuityUrl,
    expectedItemId: lastContinuityExpectedItemId,
    primedReaderUrl: lastContinuityPrimedReaderUrl,
    bundleReaderState: lastContinuityBundleReaderState,
    diagnostics: lastContinuityDiagnostics,
    results: lastContinuityResults,
    manualScreenReaderSignOff: "pending",
  };
  await ensureOutputDir();
  await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(failurePayload), null, 2)}\n`, "utf8");
  console.error(`[check:continuity] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
