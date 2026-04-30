import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
const FIXTURE_ROOT = path.join(ROOT_DIR, "scripts", "fixtures", "sources-preview");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const HARNESS_DIR = path.join(OUTPUT_DIR, "sources-a11y-smoke");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "sources-a11y-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "sources-a11y-smoke.png");
const WAIT_TIMEOUT_MS = 120000;
const RUN_STARTED_AT = new Date();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

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

async function waitForJsonHealth(name, url) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const payload = await assertJsonHealth(name, url);
      return payload;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`${name} did not become healthy at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.json();
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
    throw new Error("Nie udalo sie znalezc wolnego portu.");
  }
  return address.port;
}

function pythonExecutable() {
  const venvPython = path.join(ROOT_DIR, ".venv", "Scripts", "python.exe");
  return existsSync(venvPython) ? venvPython : "python";
}

function startProcess(label, command, args, env, logFileName) {
  const logPath = path.join(HARNESS_DIR, logFileName);
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
    logStream.write(`\n[check:sources] ${label} exited with code ${code}\n`);
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

function normalizeFixturePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const requestedPath = decodedPath === "/" ? "/site-single/index.html" : decodedPath;
  const candidatePath = path.resolve(FIXTURE_ROOT, `.${requestedPath.endsWith("/") ? `${requestedPath}index.html` : requestedPath}`);
  if (!candidatePath.startsWith(FIXTURE_ROOT)) {
    return null;
  }
  if (!existsSync(candidatePath)) {
    return candidatePath;
  }
  if (statSync(candidatePath).isDirectory()) {
    return path.join(candidatePath, "index.html");
  }
  return candidatePath;
}

async function ensureOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(HARNESS_DIR, { recursive: true });
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const resolvedPath = normalizeFixturePath(request.url ?? "/");
    if (!resolvedPath || !existsSync(resolvedPath)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Fixture not found");
      return;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
    });
    createReadStream(resolvedPath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Nie udalo sie ustalic portu fixture servera.");
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

async function waitForStableSourcePage(page) {
  await page.waitForSelector('[data-testid="source-main-heading"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="source-search-form"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="source-skip-link"]', { timeout: 30000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="source-input"]')),
    undefined,
    { timeout: 30000 },
  );
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
      name: active.getAttribute("name"),
      ariaLabel: active.getAttribute("aria-label"),
      text: (active.innerText || active.textContent || "").trim().slice(0, 120),
    };
  });
}

function withStandardArtifact(results) {
  const screenshots = collectScreenshotEvidence([OUTPUT_SCREENSHOT], {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  return attachPlaywrightArtifact(results, {
    actions: [
      { id: "keyboard-skip-link", label: "Skip link focus", status: results.keyboardReachedSkip ? "passed" : "failed" },
      { id: "keyboard-source-input", label: "Source input focus", status: results.keyboardReachedInput ? "passed" : "failed" },
      { id: "source-preview", label: "Homepage and feed preview", status: results.multiCandidateWorks ? "passed" : "failed" },
      { id: "source-backoffice", label: "Backoffice focus continuity", status: results.backofficeFocusMoved ? "passed" : "failed" },
    ],
    checkName: "check:sources",
    errors: {
      console: results.consoleErrors ?? [],
      page: results.pageErrors ?? [],
      harness: results.error
        ? [
            {
              message: String(results.error),
              failureUrl: results.failureUrl ?? null,
            },
          ]
        : [],
    },
    metadata: {
      already_followed_works: results.alreadyFollowedWorks,
      stale_preview_guarded: results.stalePreviewGuarded,
      transport_failure_quiet: results.transportFailureQuiet,
      tablet_render: results.tabletRender,
      mobile_render: results.mobileRender,
    },
    routes: [
      {
        id: "sources-desktop",
        route: "/sources",
        viewport: "desktop",
        status: results.status,
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.keyboardReachedInput && results.multiCandidateWorks,
        overflow: null,
        keyboardReachable: results.keyboardReachedInput && results.keyboardReachedSkip,
        consoleErrorCount: results.consoleErrors?.length ?? 0,
        pageErrorCount: results.pageErrors?.length ?? 0,
      },
      {
        id: "sources-tablet",
        route: "/sources",
        viewport: "tablet",
        status: results.tabletRender ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.tabletRender,
        overflow: results.tabletRender ? false : null,
      },
      {
        id: "sources-mobile",
        route: "/sources",
        viewport: "mobile",
        status: results.mobileRender ? "passed" : "failed",
        screenshot: OUTPUT_SCREENSHOT,
        ready: results.mobileRender,
        overflow: results.mobileRender ? false : null,
      },
    ],
    runtime: {
      accountsDatabasePath: results.isolatedPaths?.accountsDatabasePath ?? null,
      accountsWorkspaceDir: results.isolatedPaths?.accountsWorkspaceDir ?? null,
      authMode: results.noAccountSession ? "isolated-no-account-runtime" : "unknown",
      databasePath: results.isolatedPaths?.databasePath ?? null,
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

async function tabUntil(page, matcher, maxTabs = 30) {
  for (let index = 0; index < maxTabs; index += 1) {
    try {
      await page.keyboard.press("Tab");
      const active = await page.evaluate(() => ({
        testId: document.activeElement?.getAttribute("data-testid"),
        text: document.activeElement?.textContent?.trim() ?? null,
        name: document.activeElement?.getAttribute("name"),
      }));
      if (matcher(active)) {
        return active;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Execution context was destroyed")) {
        await waitForStableSourcePage(page);
        continue;
      }
      throw error;
    }
  }

  return null;
}

async function expectActiveTestId(page, expectedTestId, timeout = 5000) {
  await page.waitForFunction(
    (testId) => document.activeElement?.getAttribute("data-testid") === testId,
    expectedTestId,
    { timeout },
  );
}

async function main() {
  await ensureOutputDir();

  const runId = `run-${Date.now()}`;
  const runDir = path.join(HARNESS_DIR, runId);
  const dataDir = path.join(runDir, "data");
  const workspaceDir = path.join(dataDir, "accounts");
  await mkdir(workspaceDir, { recursive: true });

  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const isolatedDatabasePath = path.join(dataDir, "legacy-workspace.db");
  const isolatedAccountsPath = path.join(dataDir, "rssmaster-accounts.db");
  const env = {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL: apiUrl,
    RSSMASTER_API_PORT: String(apiPort),
    RSSMASTER_API_URL: apiUrl,
    RSSMASTER_DATABASE_PATH: isolatedDatabasePath,
    RSSMASTER_WEB_PORT: String(webPort),
    RSSMASTER_WEB_URL: webUrl,
    RSSMASTER_ACCOUNTS_DATABASE_PATH: isolatedAccountsPath,
    RSSMASTER_ACCOUNTS_WORKSPACE_DIR: workspaceDir,
    RSSMASTER_ACCOUNTS_COOKIE_NAME: `rssmaster_sources_smoke_${runId.replace(/[^a-z0-9]/gi, "_")}`,
  };

  const { chromium } = loadPlaywright();
  const fixtureServer = await startFixtureServer();
  let apiProcess = null;
  let webProcess = null;
  let browser = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];

  const results = {
    alreadyFollowedWorks: false,
    backofficeFocusMoved: false,
    categoryFocusAfterOptions: false,
    consoleErrors,
    a11ySnapshots: {
      landing: null,
      resultsRegion: null,
      backofficeRegion: null,
    },
    focusTrail: [],
    keyboardReachedInput: false,
    keyboardReachedSkip: false,
    liveAnnouncement: null,
    manualPreviewMovedFocus: false,
    mobileRender: false,
    multiCandidateWorks: false,
    pageErrors,
    runDir,
    isolatedPaths: {
      databasePath: isolatedDatabasePath,
      accountsDatabasePath: isolatedAccountsPath,
      accountsWorkspaceDir: workspaceDir,
    },
    noAccountSession: false,
    status: "running",
    stalePreviewGuarded: false,
    tabletRender: false,
    transportFailureQuiet: false,
    webUrl,
    apiUrl,
  };

  try {
    await runLoggedCommand("web build", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "build"], env, "web-build.log");

    apiProcess = startProcess(
      "api",
      pythonExecutable(),
      ["-m", "uvicorn", "app.main:app", "--app-dir", path.join(ROOT_DIR, "apps", "api"), "--host", "127.0.0.1", "--port", String(apiPort)],
      env,
      "api.log",
    );
    webProcess = startProcess("web", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "start"], env, "web.log");

    await waitForJsonHealth("api", `${apiUrl}/health`);
    await waitForJsonHealth("web", `${webUrl}/api/health`);

    const apiStartup = await readJson(`${apiUrl}/diagnostics/startup`);
    assert(
      String(apiStartup?.config?.database_path ?? "").startsWith(dataDir),
      `API nie uzywa izolowanej bazy workspace: ${apiStartup?.config?.database_path}`,
    );
    assert(
      String(apiStartup?.config?.accounts_database_path ?? "").startsWith(dataDir),
      `API nie uzywa izolowanej bazy kont: ${apiStartup?.config?.accounts_database_path}`,
    );

    const initialSession = await readJson(`${apiUrl}/api/v1/auth/session`);
    results.noAccountSession = initialSession?.has_accounts === false && initialSession?.auth_required === false;
    assert(results.noAccountSession, `Isolated sources smoke expected no-account mode: ${JSON.stringify(initialSession)}`);

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await page.goto(`${webUrl}/sources`, { waitUntil: "domcontentloaded" });
    await waitForStableSourcePage(page);
    results.focusTrail.push({ step: "landing", focus: await captureFocusState(page) });
    results.a11ySnapshots.landing = await captureAccessibilitySnapshot(page, '[data-testid="source-search-form"]');

    const skipTarget = await tabUntil(page, (active) => active.testId === "source-skip-link", 40);
    assert(Boolean(skipTarget), "Nie udalo sie dojsc Tabem do skip linku dla /sources.");
    results.focusTrail.push({ step: "skip-link", focus: await captureFocusState(page) });
    results.keyboardReachedSkip = true;

    await page.getByTestId("source-skip-link").press("Enter");
    await expectActiveTestId(page, "source-input");
    results.focusTrail.push({ step: "search-input", focus: await captureFocusState(page) });
    results.keyboardReachedInput = true;

    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/site-single/`);
    await page.waitForSelector("text=Local Single Feed", { timeout: 20000 });
    results.liveAnnouncement = await page.getByTestId("source-live-region").textContent();
    assert(results.liveAnnouncement?.includes("Wynik gotowy"), `Nieoczekiwany live region: ${results.liveAnnouncement}`);
    await page.getByRole("button", { name: "Obserwuj" }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Kanał zapisany"), undefined, { timeout: 20000 });
    results.a11ySnapshots.resultsRegion = await captureAccessibilitySnapshot(page, '[data-testid="source-results-region"]');
    await page.getByTestId("source-input").fill("");
    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/site-single/`);
    await page.waitForSelector("text=Już obserwujesz", { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes("Przejdź do feedu"), undefined, { timeout: 5000 });
    results.alreadyFollowedWorks = true;

    await page.getByTestId("source-mode-web_feed").click();
    await expectActiveTestId(page, "source-input");
    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/feeds/manual.xml`);
    await page.getByRole("button", { name: "Znajdź" }).click();
    await page.waitForTimeout(3500);
    await page.waitForFunction(() => document.body.innerText.includes("Local Manual Feed"), undefined, {
      timeout: 5000,
    });
    await expectActiveTestId(page, "source-results-region");
    results.focusTrail.push({ step: "manual-preview-results", focus: await captureFocusState(page) });
    results.manualPreviewMovedFocus = true;

    await page.getByTestId("source-options-toggle").press("Enter");
    await expectActiveTestId(page, "source-category-input");
    results.focusTrail.push({ step: "options-category-input", focus: await captureFocusState(page) });
    results.categoryFocusAfterOptions = true;

    await page.getByTestId("source-mode-website").click();
    await expectActiveTestId(page, "source-input");

    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/site-single/`);
    await page.waitForTimeout(100);
    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/site-multi/`);
    await page.waitForSelector("text=Wiele kandydatów", { timeout: 20000 });
    await page.waitForSelector("text=Alpha Feed", { timeout: 20000 });
    await page.waitForSelector("text=Beta Feed", { timeout: 20000 });
    const staleSingleVisible = await page.locator("text=Local Single Feed").count();
    assert(staleSingleVisible === 0, "Poprzedni preview pozostaje widoczny po zmianie intencji uzytkownika.");
    results.stalePreviewGuarded = true;
    results.multiCandidateWorks = true;

    await page.getByTestId("source-input").fill("http://127.0.0.1:9/nope");
    await page.waitForSelector("text=Feed jest chwilowo niedostepny", { timeout: 20000 });
    const transportAnnouncement = await page.getByTestId("source-live-region").textContent();
    assert(
      transportAnnouncement?.includes("Nie udalo sie polaczyc z podanym zrodlem"),
      `Nieoczekiwany komunikat transport failure: ${transportAnnouncement}`,
    );
    const transportBodyText = await page.locator("body").textContent();
    assert(
      !transportBodyText?.includes("Could not fetch the provided URL."),
      "UI pokazuje surowy angielski komunikat transport failure.",
    );
    results.transportFailureQuiet = true;

    await page.getByTestId("source-manage-toggle").press("Enter");
    await page.waitForFunction(
      () =>
        document.activeElement?.classList.contains("source-backoffice-region") === true &&
        document.querySelector('[data-testid="source-manage-toggle"]')?.getAttribute("aria-expanded") === "true",
      undefined,
      { timeout: 5000 },
    );
    results.a11ySnapshots.backofficeRegion = await captureAccessibilitySnapshot(page, ".source-backoffice-region");
    results.focusTrail.push({ step: "backoffice-region", focus: await captureFocusState(page) });
    results.backofficeFocusMoved = true;

    await page.getByTestId("source-manage-toggle").press("Enter");
    await expectActiveTestId(page, "source-input");

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.waitForSelector('[data-testid="source-main-heading"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="source-input"]', { timeout: 5000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Tablet viewport has horizontal overflow.");
    results.tabletRender = true;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForSelector('[data-testid="source-main-heading"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="source-input"]', { timeout: 5000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Mobile viewport has horizontal overflow.");
    results.mobileRender = true;

    assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
    assert(consoleErrors.length === 0, `consoleErrors=${JSON.stringify(consoleErrors)}`);

    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });
    results.status = "passed";
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[check:sources] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (page && results.status !== "passed") {
      results.failureUrl = page.url();
      results.failureBodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true }).catch(() => {});
    }
    if (browser) {
      await browser.close();
    }
    await fixtureServer.close();
    await stopProcess(webProcess);
    await stopProcess(apiProcess);
  }

  const resultsWithArtifact = withStandardArtifact(results);
  console.log(JSON.stringify(results, null, 2));
  await writeFile(OUTPUT_JSON, `${JSON.stringify(resultsWithArtifact, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
