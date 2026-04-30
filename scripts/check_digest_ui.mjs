import { createServer } from "node:http";
import { createRequire } from "node:module";
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
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "digest-smoke");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "digest-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "digest-smoke.png");
const WAIT_TIMEOUT_MS = 120000;
const TERMINAL_SYNC_STATES = new Set(["partial_success", "failed", "canceled", "completed"]);
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

async function waitForAppShell(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector(".app-shell")) || document.body.innerText.includes("Czytnik feedów"),
    undefined,
    { timeout: 45000 },
  );
}

function withStandardArtifact(results) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      {
        id: "digest-preview",
        label: "Podejrzyj digest",
        route: "/digest",
        status: results.previewArticleCount === 1 ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
      },
      {
        id: "digest-build",
        label: "Zbuduj EPUB",
        route: "/digest",
        status: results.builtDigestId ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
      },
    ],
    checkName: "check:digest",
    errors: {
      console: results.consoleErrors ?? [],
      http: results.httpErrors ?? [],
      page: results.pageErrors ?? [],
      harness: results.error ? [{ message: String(results.error) }] : [],
    },
    metadata: {
      preview_article_count: results.previewArticleCount,
      built_digest_id: results.builtDigestId,
      fixture_origin: results.fixtureOrigin,
    },
    routes: [
      {
        id: "digest",
        route: "/digest",
        viewport: "desktop",
        status: results.status,
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.previewArticleCount === 1 && Boolean(results.builtDigestId),
        overflow: null,
        consoleErrorCount: results.consoleErrors?.length ?? 0,
        pageErrorCount: results.pageErrors?.length ?? 0,
      },
    ],
    runtime: {
      authMode: results.authMode ?? "unknown",
      isolated: true,
      runDir: results.runDir,
    },
    screenshots,
    startedAt: RUN_STARTED_AT,
    status: results.status,
    targetUrls: {
      apiUrl: results.apiUrl,
      webUrl: results.webUrl,
    },
  });
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
    <title>Digest Smoke Feed</title>
    <link>${origin}</link>
    <description>Digest smoke fixture</description>
    <item>
      <title>Digest Smoke Candidate</title>
      <link>${origin}/articles/candidate</link>
      <guid>digest-smoke-candidate</guid>
      <description>Artykul oznaczony jako kandydat digestu.</description>
      <pubDate>Tue, 28 Apr 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Digest Smoke Non Candidate</title>
      <link>${origin}/articles/non-candidate</link>
      <guid>digest-smoke-non-candidate</guid>
      <description>Artykul kontrolny, ktory nie powinien wejsc do digestu.</description>
      <pubDate>Tue, 28 Apr 2026 07:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);
        return;
      }

      if (requestUrl.pathname.startsWith("/articles/")) {
        const articleName = requestUrl.pathname.endsWith("candidate") ? "Digest Smoke Candidate" : "Digest Smoke Non Candidate";
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
      <p>Ten tekst jest wystarczająco długi, aby zbudować czytelny lokalny artefakt digestu.</p>
      <p>Smoke sprawdza, że build nie korzysta z aktualnie widocznego filtra czytnika.</p>
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

async function main() {
  await ensureOutputDir();

  const fixtureServer = await createFixtureServer();
  const runtime = await prepareSmokeRuntime({
    apiUrl: "http://127.0.0.1:9",
    label: "digest-smoke",
    outputDir: OUTPUT_DIR,
    webUrl: "http://127.0.0.1:9",
  });
  const results = {
    status: "running",
    runDir: runtime.runDir,
    webUrl: runtime.webUrl,
    apiUrl: runtime.apiUrl,
    authMode: runtime.authMode,
    fixtureOrigin: fixtureServer.origin,
    previewArticleCount: null,
    builtDigestId: null,
    consoleErrors: [],
    httpErrors: [],
    pageErrors: [],
  };
  let browser = null;

  try {
    await readJson(`${runtime.apiUrl}/api/v1/channels`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ input_url: `${fixtureServer.origin}/feed.xml`, category: "smoke" }),
    });

    const syncPayload = await readJson(`${runtime.apiUrl}/api/v1/sync/runs`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    const syncRun = await waitForSyncRun(runtime.apiUrl, syncPayload.run.id);
    assert(["completed", "partial_success"].includes(syncRun.status), `Unexpected sync status: ${JSON.stringify(syncRun)}`);

    const itemPayload = await readJson(`${runtime.apiUrl}/api/v1/items?scope=all&sort=newest&limit=20`);
    const candidate = itemPayload.items.find((item) => item.title === "Digest Smoke Candidate");
    const nonCandidate = itemPayload.items.find((item) => item.title === "Digest Smoke Non Candidate");
    assert(candidate, `Candidate item missing: ${JSON.stringify(itemPayload.items)}`);
    assert(nonCandidate, `Non-candidate item missing: ${JSON.stringify(itemPayload.items)}`);

    await readJson(`${runtime.apiUrl}/api/v1/items/${candidate.id}/state`, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ digest_candidate: true, is_read: true }),
    });
    await readJson(`${runtime.apiUrl}/api/v1/items/${nonCandidate.id}/state`, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ digest_candidate: false }),
    });

    const apiPreview = await readJson(`${runtime.apiUrl}/api/v1/digests/preview`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ digest_candidates_only: true, include_read: true, limit: 25 }),
    });
    results.previewArticleCount = apiPreview.preview.stats.article_count;
    assert(apiPreview.preview.stats.article_count === 1, `Unexpected API preview: ${JSON.stringify(apiPreview)}`);

    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && !text.includes("Failed to load resource: the server responded with a status of 404")) {
        results.consoleErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
        results.httpErrors.push({
          status: response.status(),
          url: response.url(),
        });
      }
    });
    page.on("pageerror", (error) => results.pageErrors.push(String(error)));

    await page.goto(`${runtime.webUrl}/digest?q=hidden-digest-filter`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForAppShell(page);
    await page.getByText(/Filtr czytnika ukrywa część kandydatów|Trwała kolejka digestu jest gotowa/i).waitFor({ timeout: 45000 });
    await page.getByText(/Preview i build użyją/i).waitFor({ timeout: 30000 });

    await page.getByRole("button", { name: /Podejrzyj digest/i }).first().click();
    await page.getByText(/Podglad digestu gotowy|Podgląd digestu gotowy/i).waitFor({ timeout: 45000 });
    await page.getByText(/1 artykul|1 artykuł/i).first().waitFor({ timeout: 30000 });

    await page.getByRole("button", { name: /Zbuduj EPUB/i }).first().click();
    await page.getByText(/Artefakt digestu utworzony/i).waitFor({ timeout: 45000 });
    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

    const historyPayload = await readJson(`${runtime.apiUrl}/api/v1/digests/history`);
    assert(historyPayload.items.length === 1, `Expected one digest history item: ${JSON.stringify(historyPayload)}`);
    assert(historyPayload.items[0].article_count === 1, `Unexpected digest history count: ${JSON.stringify(historyPayload.items[0])}`);
    results.builtDigestId = historyPayload.items[0].id;

    assert(results.pageErrors.length === 0, `pageErrors=${JSON.stringify(results.pageErrors)}`);
    assert(results.httpErrors.length === 0, `httpErrors=${JSON.stringify(results.httpErrors)}`);
    assert(results.consoleErrors.length === 0, `consoleErrors=${JSON.stringify(results.consoleErrors)}`);
    results.status = "passed";
    console.log("[check:digest] PASS");
    console.log(`[check:digest] evidence: ${OUTPUT_JSON}`);
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[check:digest] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    await runtime.close();
    await fixtureServer.close();
    await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(results), null, 2)}\n`, "utf8");
  }
}

main();
