import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBrowserIssueTracker } from "./lib/browser-issue-tracker.mjs";
import { prepareSmokeRuntime } from "./lib/local-runtime.mjs";
import {
  attachPlaywrightArtifact,
  collectScreenshotEvidence,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "capture-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "capture-smoke.png");
const RUN_STARTED_AT = new Date();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function createFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

      if (requestUrl.pathname === "/article") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(`<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>Outside App Capture Story</title>
  </head>
  <body>
    <article>
      <header>
        <h1>Outside App Capture Story</h1>
        <p>Lead paragraph that should survive capture.</p>
      </header>
      <figure>
        <img src="/hero.jpg" alt="Capture hero" />
        <figcaption>Capture hero caption</figcaption>
      </figure>
      <p>This article is intentionally long enough to become readable cleaned content inside RSSmaster.</p>
      <p>It also includes a <a href="/secondary-source">secondary source link</a> for reader continuity.</p>
    </article>
  </body>
</html>`);
        return;
      }

      if (requestUrl.pathname === "/hero.jpg") {
        response.writeHead(200, {
          "content-type": "image/svg+xml",
          "cache-control": "no-store",
        });
        response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <rect width="800" height="400" fill="#d8e7ff" />
  <text x="400" y="210" text-anchor="middle" font-size="42" fill="#155eef">Capture Hero</text>
</svg>`);
        return;
      }

      if (requestUrl.pathname === "/secondary-source") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end("<!doctype html><html><body><p>Secondary source</p></body></html>");
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

async function readManifest(webUrl) {
  const response = await fetch(`${webUrl}/manifest.webmanifest`);
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  return response.json();
}

async function findVisibleButtonByExactText(page, text) {
  const buttons = page.locator("button");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }
    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (candidateText === text) {
      return candidate;
    }
  }

  return null;
}

async function findVisibleButtonByPrefix(page, prefixes) {
  const normalizedPrefixes = Array.isArray(prefixes) ? prefixes : [prefixes];
  const buttons = page.locator("button");
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }
    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (normalizedPrefixes.some((prefix) => candidateText.startsWith(prefix))) {
      return candidate;
    }
  }

  return null;
}

async function waitForVisibleButtonByPrefix(page, prefixes, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const candidate = await findVisibleButtonByPrefix(page, prefixes);
    if (candidate) {
      return candidate;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function findVisibleAnchorByExactText(page, text) {
  const anchors = page.locator("a");
  const count = await anchors.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = anchors.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }
    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (candidateText === text) {
      return candidate;
    }
  }

  return null;
}

async function isTextVisible(page, text) {
  return page.getByText(text, { exact: true }).first().isVisible().catch(() => false);
}

async function waitForTextVisible(page, text, timeout = 12000) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout });
}

async function revealReaderNotes(page) {
  const noteButton = await waitForVisibleButtonByPrefix(page, ["Ukryj notatki", "Notatki"], 12000);
  if (!noteButton) {
    return false;
  }

  const label = ((await noteButton.textContent()) ?? "").replace(/\s+/g, " ").trim();
  if (!label.startsWith("Ukryj notatki")) {
    await noteButton.click({ timeout: 8000 });
    await page.waitForTimeout(500);
  }
  return true;
}

async function findArticleOpenButton(page) {
  const buttons = page.locator(
    "button.feed-card-primary, .reader-gate-actions button.action-button, .reader-preview-actions button.action-button",
  );
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }

    const candidateText = ((await candidate.textContent()) ?? "").replace(/\s+/g, " ").trim();
    if (
      candidateText === "Czytaj" ||
      candidateText.startsWith("Czytaj artykul") ||
      candidateText.startsWith("Czytaj artykuł") ||
      candidateText.startsWith("Czytaj oczyszczony") ||
      candidateText.startsWith("Czytaj fallback") ||
      candidateText.startsWith("Czytaj skrot")
    ) {
      return candidate;
    }
  }

  return null;
}

async function openReaderNotes(page, noteText) {
  if (await isTextVisible(page, noteText)) {
    return;
  }

  if (await revealReaderNotes(page)) {
    await waitForTextVisible(page, noteText, 15000).catch(() => {});
    if (await isTextVisible(page, noteText)) {
      return;
    }
  }

  const openArticleButton = await findArticleOpenButton(page);
  assert(openArticleButton, "Reader did not expose a visible article-open action after capture.");
  await openArticleButton.click({ timeout: 8000 });
  await page.waitForURL((url) => url.pathname.startsWith("/read/saved"), { timeout: 15000 }).catch(() => {});
  await page.waitForSelector(".feed-reader-topbar", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  if (await isTextVisible(page, noteText)) {
    return;
  }

  const notesRevealed = await revealReaderNotes(page);
  assert(notesRevealed, "Reader did not render the notes toggle after opening the captured article.");
  await waitForTextVisible(page, noteText, 20000);
}

function withStandardArtifact(results) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      { id: "global-capture-action", label: "Global capture action", status: results.globalCaptureAction ? "passed" : "failed" },
      { id: "capture-prefill", label: "Capture prefill", route: "/capture", status: results.prefilledUrl && results.prefilledTitle && results.prefilledNote ? "passed" : "failed" },
      { id: "capture-save", label: "Zapisz do biblioteki", route: "/capture", status: results.captureSucceeded ? "passed" : "failed" },
      { id: "capture-handoff", label: "Open saved reader", route: "/read/saved", status: results.openedSavedReader && results.notePersisted ? "passed" : "failed" },
    ],
    checkName: "check:capture",
    errors: {
      console: results.consoleErrors ?? [],
      page: results.pageErrors ?? [],
      http: [...(results.httpFailures ?? []), ...(results.requestFailures ?? [])],
      harness: results.error ? [{ message: String(results.error) }] : [],
    },
    metadata: {
      article_url: results.articleUrl ?? null,
      browser_issues: {
        ignored_console: results.ignoredConsoleIssues ?? [],
        ignored_request: results.ignoredRequestFailures ?? [],
      },
      item_id: results.itemId ?? null,
      bookmarklet_ready: results.bookmarkletReady ?? false,
      manifest_share_target: results.manifestShareTarget ?? false,
    },
    routes: [
      {
        id: "capture",
        route: "/capture",
        viewport: "desktop",
        status: results.status ?? "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.prefilledUrl && results.captureSucceeded,
        overflow: null,
        consoleErrorCount: results.consoleErrors?.length ?? 0,
        pageErrorCount: results.pageErrors?.length ?? 0,
      },
      {
        id: "saved-reader-handoff",
        route: "/read/saved",
        viewport: "desktop",
        status: results.openedSavedReader && results.notePersisted ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.openedSavedReader,
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

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const requestedWebUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const requestedApiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const runtime = await prepareSmokeRuntime({
    apiUrl: requestedApiUrl,
    forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
    label: "capture-smoke",
    outputDir: OUTPUT_DIR,
    webUrl: requestedWebUrl,
  });
  const webUrl = runtime.webUrl;
  const apiUrl = runtime.apiUrl;

  try {
    await assertWebReachable(`${webUrl}/capture`);
    await assertJsonHealth("api", `${apiUrl}/health`);

    const fixtureServer = await createFixtureServer();
    const articleUrl = `${fixtureServer.origin}/article`;
    const initialTitle = "Shared article title";
    const initialNote = "Remember this outside-app note";

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
    });
    const page = await context.newPage();
    const issueTracker = createBrowserIssueTracker({ consoleTypes: ["error", "warning"] });
    issueTracker.attachToPage(page);

    const results = {
      status: "running",
      articleUrl,
      globalCaptureAction: false,
      prefilledUrl: false,
      prefilledTitle: false,
      prefilledNote: false,
      bookmarkletReady: false,
      manifestShareTarget: false,
      captureSucceeded: false,
      openedSavedReader: false,
      notePersisted: false,
      itemId: null,
      consoleErrors: issueTracker.consoleIssues,
      httpFailures: issueTracker.httpFailures,
      ignoredConsoleIssues: issueTracker.ignoredConsoleIssues,
      ignoredRequestFailures: issueTracker.ignoredRequestFailures,
      pageErrors: issueTracker.pageErrors,
      requestFailures: issueTracker.requestFailures,
      runtime: {
        apiUrl,
        authMode: runtime.authMode,
        isolated: runtime.isolated,
        runDir: runtime.runDir,
        webUrl,
      },
      screenshot: OUTPUT_SCREENSHOT,
      manualScreenReaderSignOff: "pending",
    };

    try {
      const manifest = await readManifest(webUrl);
      results.manifestShareTarget =
        manifest?.share_target?.action === "/capture" &&
        manifest?.share_target?.params?.url === "url" &&
        manifest?.share_target?.params?.title === "title" &&
        manifest?.share_target?.params?.text === "note";

      await page.goto(`${webUrl}/read/inbox`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const globalCaptureAction = page.getByTestId("global-capture-action").first();
      await globalCaptureAction.waitFor({ state: "visible", timeout: 20000 });
      await globalCaptureAction.click({ timeout: 8000 });
      await page.waitForURL((url) => url.pathname === "/capture", { timeout: 15000 });
      results.globalCaptureAction = new URL(page.url()).pathname === "/capture";

      const captureUrl = `${webUrl}/capture?url=${encodeURIComponent(articleUrl)}&title=${encodeURIComponent(initialTitle)}&note=${encodeURIComponent(initialNote)}`;
      await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1200);

      const urlInput = page.getByPlaceholder("https://example.com/artykul");
      const titleInput = page.getByPlaceholder(/Nadpisz tytu[lł]/i);
      const noteInput = page.getByPlaceholder(/Dlaczego warto/i);

      results.prefilledUrl = (await urlInput.inputValue()) === articleUrl;
      results.prefilledTitle = (await titleInput.inputValue()) === initialTitle;
      results.prefilledNote = (await noteInput.inputValue()) === initialNote;

      await page.waitForFunction(
        (expectedText) =>
          Array.from(document.querySelectorAll("a")).some((node) => {
            const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
            const href = node.getAttribute("href") ?? "";
            return text === expectedText && href.startsWith("javascript:");
          }),
        "Zapisz do RSSmastera",
        { timeout: 20000 },
      );
      const bookmarkletLink = await findVisibleAnchorByExactText(page, "Zapisz do RSSmastera");
      assert(bookmarkletLink, "Capture page did not render the bookmarklet action.");
      const bookmarkletHref = await bookmarkletLink.getAttribute("href");
      results.bookmarkletReady = Boolean(bookmarkletHref?.startsWith("javascript:") && bookmarkletHref.includes("/capture?url="));

      let capturedItemId = null;
      const captureResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/v1/workspace/capture") && response.request().method() === "POST",
        { timeout: 20000 },
      );
      await page.getByRole("button", { name: "Zapisz do biblioteki" }).click();
      const captureResponse = await captureResponsePromise;
      const capturePayload = await captureResponse.json();

      capturedItemId = capturePayload?.item?.id ?? null;
      results.itemId = capturedItemId;
      results.captureSucceeded = captureResponse.ok() && typeof capturedItemId === "string";
      assert(results.captureSucceeded, `Capture request failed: ${captureResponse.status()} ${JSON.stringify(capturePayload)}`);
      await page.waitForSelector("text=/Artyku[lł] jest ju[zż] w RSSmasterze/", { timeout: 20000 });

      const annotationsResponse = await fetch(
        `${apiUrl}/api/v1/workspace/annotations?item_id=${encodeURIComponent(capturedItemId)}&limit=10`,
      );
      assert(annotationsResponse.ok, `Annotations request failed with ${annotationsResponse.status}`);
      const annotationsPayload = await annotationsResponse.json();
      results.notePersisted = Array.isArray(annotationsPayload?.items)
        && annotationsPayload.items.some((entry) => entry.kind === "note" && entry.note_text === initialNote);
      await page.getByRole("button", { name: /Otw[oó]rz zapisany artyku[lł]/i }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/read/saved"), { timeout: 30000 });
      await page.waitForTimeout(1800);
      results.openedSavedReader = page.url().includes("/read/saved");

      await openReaderNotes(page, initialNote);

      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

      assert(results.prefilledUrl, "Capture page did not prefill the shared URL.");
      assert(results.prefilledTitle, "Capture page did not prefill the shared title.");
      assert(results.prefilledNote, "Capture page did not prefill the shared note.");
      assert(results.globalCaptureAction, "Main app shell did not expose a working global capture action.");
      assert(results.bookmarkletReady, "Capture page did not expose a ready bookmarklet href.");
      assert(results.manifestShareTarget, "Manifest share target does not point to /capture with the expected params.");
      assert(results.openedSavedReader, "Capture flow did not navigate into the saved reader.");
      assert(results.notePersisted, "Capture note was not persisted as an item note annotation.");
      assert(!issueTracker.hasBlockingIssues, `Capture smoke saw browser issues: ${issueTracker.formatBlockingIssues()}`);
      results.status = "passed";
    } catch (error) {
      results.status = "failed";
      results.error = error instanceof Error ? error.stack ?? error.message : String(error);
      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(results), null, 2)}\n`, "utf8");
      await browser.close();
      await fixtureServer.close();
    }

    console.log("[check:capture] PASS");
    console.log(`[check:capture] manual UI target: ${webUrl}/capture`);
    console.log(`[check:capture] evidence: ${OUTPUT_JSON}`);
  } finally {
    await runtime.close();
  }
}

main().catch(async (error) => {
  const failurePayload = {
    status: "failed",
    error: String(error),
    manualScreenReaderSignOff: "pending",
  };
  await ensureOutputDir();
  await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(failurePayload), null, 2)}\n`, "utf8");
  console.error(`[check:capture] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
