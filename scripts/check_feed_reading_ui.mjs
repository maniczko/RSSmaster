import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachPlaywrightArtifact,
  collectScreenshotEvidence,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "feed-reading");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "feed-reading-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "feed-reading-smoke.png");
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
    "Brak lokalnego runtime Playwright. Oczekiwano modułu pod output/playwright-runtime/node_modules/playwright albo w RSSMASTER_PLAYWRIGHT_MODULE.",
  );
}

async function ensureOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true });
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  if (!address || typeof address === "string") {
    throw new Error("Nie udało się znaleźć wolnego portu.");
  }
  return address.port;
}

function pythonExecutable() {
  const venvPython = path.join(ROOT_DIR, ".venv", "Scripts", "python.exe");
  return existsSync(venvPython) ? venvPython : "python";
}

function startProcess(label, command, args, env, logFileName) {
  const logPath = path.join(OUTPUT_DIR, logFileName);
  const logStream = createWriteStream(logPath, { flags: "w", encoding: "utf8" });
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.once("exit", (code) => {
    logStream.write(`\n[check:feed-reading] ${label} exited with code ${code}\n`);
    logStream.end();
  });
  return { child, label, logPath };
}

async function runLoggedCommand(label, command, args, env, logFileName) {
  const processInfo = startProcess(label, command, args, env, logFileName);
  const exitCode = await new Promise((resolve) => {
    processInfo.child.once("exit", (code) => resolve(code ?? 0));
    processInfo.child.once("error", () => resolve(1));
  });
  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}; see ${processInfo.logPath}`);
  }
}

async function stopProcess(processInfo) {
  if (!processInfo || processInfo.child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(processInfo.child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }

  processInfo.child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (processInfo.child.exitCode === null) {
    processInfo.child.kill("SIGKILL");
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

async function waitForJsonHealth(name, url) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const payload = await readJson(url);
      if (payload?.status === "ok") {
        return payload;
      }
      lastError = new Error(`${name} health returned ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${name} did not become healthy at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const address = server.address();
    const origin = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}` : "http://127.0.0.1";

    if (url.pathname === "/feeds/healthy.xml") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/xml; charset=utf-8" });
      response.end(feedXml({
        title: "Feed Reading Healthy",
        origin,
        items: [
          {
            id: "healthy-local",
            title: "Feed Reading Healthy Article",
            description: "Pełny artykuł powinien być czytelny lokalnie po ekstrakcji.",
          },
        ],
      }));
      return;
    }

    if (url.pathname === "/feeds/fallback.xml") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/xml; charset=utf-8" });
      response.end(feedXml({
        title: "Feed Reading Fallback",
        origin,
        items: [
          {
            id: "fallback-local",
            title: "Feed Reading Fallback Article",
            description: "To jest skrót z feedu, który ma pozostać czytelny w aplikacji mimo błędu ekstrakcji.",
          },
        ],
      }));
      return;
    }

    if (url.pathname === "/feeds/empty.xml") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/xml; charset=utf-8" });
      response.end(feedXml({ title: "Feed Reading Empty", origin, items: [] }));
      return;
    }

    if (url.pathname === "/articles/healthy-local") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" });
      response.end(`
        <html>
          <head><title>Feed Reading Healthy Article</title></head>
          <body>
            <main>
              <article>
                <h1>Feed Reading Healthy Article</h1>
                <p>Ten artykuł ma wystarczająco dużo treści, aby ekstrakcja przygotowała pełny lokalny widok czytania.</p>
                <p>Drugi akapit potwierdza, że czytnik może pokazać oczyszczony tekst bez otwierania źródła.</p>
              </article>
            </main>
          </body>
        </html>
      `);
      return;
    }

    if (url.pathname === "/articles/fallback-local") {
      response.writeHead(500, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Intentional extraction failure for feed-reading smoke.");
      return;
    }

    if (url.pathname === "/favicon.ico") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "image/svg+xml" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#2563eb"/></svg>');
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
    throw new Error("Nie udało się ustalić portu fixture servera.");
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

function feedXml({ title, origin, items }) {
  const renderedItems = items
    .map((item) => `
      <item>
        <title>${item.title}</title>
        <link>${origin}/articles/${item.id}</link>
        <guid>${item.id}</guid>
        <description>${item.description}</description>
        <pubDate>Tue, 28 Apr 2026 08:00:00 GMT</pubDate>
      </item>
    `)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>${title}</title>
        <link>${origin}</link>
        <description>${title}</description>
        <language>pl</language>
        ${renderedItems}
      </channel>
    </rss>
  `;
}

async function addChannel(apiUrl, inputUrl, category) {
  return readJson(`${apiUrl}/api/v1/channels`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ input_url: inputUrl, category }),
  });
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

function withStandardArtifact(results, env) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      { id: "feed-sync", label: "Manual sync", status: results.syncStatus ? "passed" : "failed" },
      {
        id: "empty-state-diagnostics",
        label: "Dlaczego nic tu nie ma?",
        route: "/read/inbox",
        status: results.emptyStateExplained ? "passed" : "failed",
      },
      {
        id: "fallback-article-readable",
        label: "Fallback article opens in app",
        route: "/read/inbox",
        status: results.fallbackArticleReadable ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
      },
      {
        id: "source-readability",
        label: "Source readability diagnostics",
        route: "/sources",
        status: results.sourceHealthReadable ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
      },
    ],
    checkName: "check:feed-reading",
    errors: {
      console: results.consoleErrors ?? [],
      page: results.pageErrors ?? [],
      harness: results.error ? [{ message: String(results.error) }] : [],
    },
    metadata: {
      channels_created: results.channelsCreated,
      sync_status: results.syncStatus,
      reader_statuses: results.readerStatuses,
      source_readiness: results.sourceReadiness,
      fixture_origin: results.fixtureOrigin,
    },
    routes: [
      {
        id: "read-inbox-empty-diagnostics",
        route: "/read/inbox",
        viewport: "desktop",
        status: results.emptyStateExplained && results.cardLabelsVisible ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.emptyStateExplained,
        overflow: null,
      },
      {
        id: "sources-readability",
        route: "/sources",
        viewport: "desktop",
        status: results.sourceHealthReadable ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.sourceHealthReadable,
        overflow: null,
      },
    ],
    runtime: {
      accountsDatabasePath: env.RSSMASTER_ACCOUNTS_DATABASE_PATH,
      accountsWorkspaceDir: env.RSSMASTER_ACCOUNTS_WORKSPACE_DIR,
      authMode: "isolated-no-account-runtime",
      databasePath: env.RSSMASTER_DATABASE_PATH,
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

async function main() {
  await ensureOutputDir();

  const runId = `run-${Date.now()}`;
  const runDir = path.join(OUTPUT_DIR, runId);
  const dataDir = path.join(runDir, "data");
  const workspaceDir = path.join(dataDir, "accounts");
  await mkdir(workspaceDir, { recursive: true });

  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const env = {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL: apiUrl,
    RSSMASTER_API_PORT: String(apiPort),
    RSSMASTER_API_URL: apiUrl,
    RSSMASTER_DATABASE_PATH: path.join(dataDir, "feed-reading-workspace.db"),
    RSSMASTER_WEB_PORT: String(webPort),
    RSSMASTER_WEB_URL: webUrl,
    RSSMASTER_ACCOUNTS_DATABASE_PATH: path.join(dataDir, "rssmaster-accounts.db"),
    RSSMASTER_ACCOUNTS_WORKSPACE_DIR: workspaceDir,
    RSSMASTER_ACCOUNTS_COOKIE_NAME: `rssmaster_feed_reading_${runId.replace(/[^a-z0-9]/gi, "_")}`,
  };

  const fixtureServer = await startFixtureServer();
  const results = {
    status: "running",
    runDir,
    webUrl,
    apiUrl,
    fixtureOrigin: fixtureServer.origin,
    channelsCreated: 0,
    syncStatus: null,
    readerStatuses: {},
    sourceReadiness: {},
    emptyStateExplained: false,
    cardLabelsVisible: false,
    fallbackArticleReadable: false,
    reextractActionVisible: false,
    sourceHealthReadable: false,
    consoleErrors: [],
    pageErrors: [],
  };

  await runLoggedCommand("web build", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "build"], env, "web-build.log");

  const apiProcess = startProcess(
    "api",
    pythonExecutable(),
    ["-m", "uvicorn", "app.main:app", "--app-dir", path.join(ROOT_DIR, "apps", "api"), "--host", "127.0.0.1", "--port", String(apiPort)],
    env,
    "api.log",
  );
  const webProcess = startProcess("web", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "start"], env, "web.log");
  let browser = null;

  try {
    await waitForJsonHealth("api", `${apiUrl}/health`);
    await waitForJsonHealth("web", `${webUrl}/api/health`);

    await addChannel(apiUrl, `${fixtureServer.origin}/feeds/healthy.xml`, "smoke");
    await addChannel(apiUrl, `${fixtureServer.origin}/feeds/fallback.xml`, "smoke");
    await addChannel(apiUrl, `${fixtureServer.origin}/feeds/empty.xml`, "smoke");
    results.channelsCreated = 3;

    const syncPayload = await readJson(`${apiUrl}/api/v1/sync/runs`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    const syncRun = await waitForSyncRun(apiUrl, syncPayload.run.id);
    results.syncStatus = syncRun.status;
    assert(["completed", "partial_success"].includes(syncRun.status), `Unexpected sync status: ${JSON.stringify(syncRun)}`);

    const itemPayload = await readJson(`${apiUrl}/api/v1/items?scope=all&sort=newest&limit=20`);
    const items = itemPayload.items ?? [];
    const healthyItem = items.find((item) => item.title === "Feed Reading Healthy Article");
    const fallbackItem = items.find((item) => item.title === "Feed Reading Fallback Article");
    assert(healthyItem, `Healthy item missing: ${JSON.stringify(items)}`);
    assert(fallbackItem, `Fallback item missing: ${JSON.stringify(items)}`);
    results.readerStatuses.healthy = healthyItem.reader_status;
    results.readerStatuses.fallback = fallbackItem.reader_status;
    assert(healthyItem.reader_status?.mode === "cleaned", `Healthy reader_status unexpected: ${JSON.stringify(healthyItem.reader_status)}`);
    assert(
      ["text_fallback", "excerpt"].includes(fallbackItem.reader_status?.mode),
      `Fallback reader_status unexpected: ${JSON.stringify(fallbackItem.reader_status)}`,
    );

    const sourceHealthPayload = await readJson(`${apiUrl}/api/v1/workspace/source-health`);
    for (const entry of sourceHealthPayload.items ?? []) {
      results.sourceReadiness[entry.title] = {
        readiness: entry.reading_readiness,
        readableItems7d: entry.readable_items_7d,
        localReadableItems7d: entry.local_readable_items_7d,
        excerptFallbackItems7d: entry.excerpt_fallback_items_7d,
        sourceOnlyItems7d: entry.source_only_items_7d,
        failedItems7d: entry.extraction_failed_items_7d,
        summary: entry.reading_summary,
      };
    }
    assert(results.sourceReadiness["Feed Reading Healthy"]?.readiness === "ready", "Healthy source should be ready.");
    assert(results.sourceReadiness["Feed Reading Fallback"]?.readiness === "degraded", "Fallback source should be degraded.");
    assert(results.sourceReadiness["Feed Reading Empty"]?.readiness === "unknown", "Empty source should be unknown.");

    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("console", (message) => {
      if (message.type() === "error") {
        results.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => results.pageErrors.push(String(error)));

    await page.goto(`${webUrl}/read/inbox?scope=all&sort=newest&q=no-such-feed-reading`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForAppShell(page);
    await page.getByText(/Brak wyników dla/i).waitFor({ timeout: 30000 });
    await page.getByText("Dlaczego nic tu nie ma?").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Pokaż wszystkie" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Uruchom sync" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Przejdź do źródeł" }).waitFor({ timeout: 15000 });
    results.emptyStateExplained = true;

    await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
    await page.getByText("Pełny tekst").waitFor({ timeout: 30000 });
    const fallbackLabelVisible =
      (await page.getByText("Tekst z feedu").count()) > 0 || (await page.getByText("Tylko skrót").count()) > 0;
    assert(fallbackLabelVisible, "Fallback card did not show a readable fallback label.");
    results.cardLabelsVisible = true;

    await page.getByRole("button", { name: "Feed Reading Fallback Article" }).click();
    await page.getByText("Feed Reading Fallback Article").waitFor({ timeout: 30000 });
    await page.getByText(/skrót z feedu/i).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Ponów ekstrakcję" }).first().waitFor({ timeout: 30000 });
    results.fallbackArticleReadable = true;
    results.reextractActionVisible = true;

    await page.goto(`${webUrl}/sources`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForAppShell(page);
    await page.getByTestId("source-manage-toggle").click();
    await page.getByText(/Czytelność:/i).first().waitFor({ timeout: 30000 });
    await page.getByText("Lokalny tekst 7d").first().waitFor({ timeout: 30000 });
    await page.getByText("Skrót 7d").first().waitFor({ timeout: 30000 });
    await page.getByText("Błędy ekstr.").first().waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Syncuj teraz" }).first().waitFor({ timeout: 30000 });
    results.sourceHealthReadable = true;

    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

    assert(results.pageErrors.length === 0, `pageErrors=${JSON.stringify(results.pageErrors)}`);
    assert(results.consoleErrors.length === 0, `consoleErrors=${JSON.stringify(results.consoleErrors)}`);
    results.status = "passed";
    console.log("[check:feed-reading] PASS");
    console.log(`[check:feed-reading] evidence: ${OUTPUT_JSON}`);
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[check:feed-reading] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(webProcess);
    await stopProcess(apiProcess);
    await fixtureServer.close();
    await writeFile(OUTPUT_JSON, `${JSON.stringify(withStandardArtifact(results, env), null, 2)}\n`, "utf8");
  }
}

main();
