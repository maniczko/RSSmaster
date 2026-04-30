import { createRequire } from "node:module";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSmokeRuntime } from "./lib/local-runtime.mjs";
import {
  attachPlaywrightArtifact,
  buildVisualSnapshot,
  collectScreenshotEvidence,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "layout-qa.json");
const LAYOUT_HISTORY_DIR = path.join(OUTPUT_DIR, "layout-history");
const RUN_STARTED_AT = new Date();
const RUN_ID = `layout-${RUN_STARTED_AT.getTime()}`;
const HARD_TIMEOUT_MS = Number.parseInt(
  process.env.RSSMASTER_LAYOUT_TIMEOUT_MS ?? process.env.RSSMASTER_SMOKE_TIMEOUT_MS ?? "480000",
  10,
);

let lastActiveStep = "starting";
let activeTargetUrls = {
  webUrl: (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
  apiUrl: (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, ""),
};
const cleanupCallbacks = [];
let previousVisualBaseline = null;

const DESKTOP_VIEWPORT = { id: "desktop", width: 1440, height: 1080 };
const RESPONSIVE_VIEWPORTS = [
  { id: "tablet", width: 1024, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

const DESKTOP_ROUTES = [
  { id: "read-inbox", path: "/read/inbox" },
  { id: "read-continue", path: "/read/continue" },
  { id: "read-saved", path: "/read/saved" },
  { id: "read-digest", path: "/read/digest" },
  { id: "read-archive", path: "/read/archive" },
  { id: "discover", path: "/discover" },
  { id: "sources", path: "/sources" },
  { id: "digest", path: "/digest" },
  { id: "settings", path: "/settings" },
  { id: "capture", path: "/capture" },
];

const RESPONSIVE_ROUTES = [
  { id: "read-inbox", path: "/read/inbox" },
  { id: "discover", path: "/discover" },
  { id: "sources", path: "/sources" },
  { id: "digest", path: "/digest" },
  { id: "settings", path: "/settings" },
  { id: "capture", path: "/capture" },
];

const REPRESENTATIVE_STATE_PROOFS = [
  {
    id: "read-inbox-desktop-sidebar-collapsed",
    route: "/read/inbox",
    viewport: DESKTOP_VIEWPORT,
    toggleText: "Zamknij",
    interactionLabel: "collapse left shell sidebar",
  },
  {
    id: "sources-desktop-sidebar-collapsed",
    route: "/sources",
    viewport: DESKTOP_VIEWPORT,
    toggleText: "Zamknij",
    interactionLabel: "collapse source shell sidebar",
  },
  {
    id: "read-inbox-tablet-menu-open",
    route: "/read/inbox",
    viewport: RESPONSIVE_VIEWPORTS[0],
    toggleText: "Menu",
    interactionLabel: "open tablet drawer",
  },
  {
    id: "sources-mobile-menu-open",
    route: "/sources",
    viewport: RESPONSIVE_VIEWPORTS[1],
    toggleText: "Menu",
    interactionLabel: "open mobile drawer",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function setActiveStep(step) {
  lastActiveStep = step;
  console.log(`[check:layout] ${step}`);
}

function createRunPayload(status, extra = {}) {
  const completedAt = new Date();
  return {
    id: RUN_ID,
    startedAt: RUN_STARTED_AT.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds: Math.round((completedAt.getTime() - RUN_STARTED_AT.getTime()) / 100) / 10,
    timeoutMs: HARD_TIMEOUT_MS,
    status,
    lastActiveStep,
    nextDiagnosticCommand: "npm run check:layout",
    ...extra,
  };
}

function runtimeEvidence(runtime) {
  if (!runtime) {
    return null;
  }

  return {
    isolated: Boolean(runtime.isolated),
    authMode: runtime.authMode ?? null,
    runDir: runtime.runDir ?? null,
    databasePath: runtime.databasePath ?? null,
    accountsDatabasePath: runtime.accountsDatabasePath ?? null,
    accountsWorkspaceDir: runtime.accountsWorkspaceDir ?? null,
  };
}

function routeStatus(route) {
  return !route.ready ||
    route.overflow ||
    (route.semanticIssues?.length ?? 0) > 0 ||
    route.keyboardProbe?.looksReachable === false ||
    (route.blockingConsoleErrors?.length ?? 0) > 0 ||
    (route.pageErrors?.length ?? 0) > 0
    ? "failed"
    : "passed";
}

function stateStatus(state) {
  return !state.ready ||
    state.interactionStatus !== "passed" ||
    state.overflow ||
    (state.semanticIssues?.length ?? 0) > 0 ||
    state.keyboardProbe?.looksReachable === false ||
    (state.blockingConsoleErrors?.length ?? 0) > 0 ||
    (state.pageErrors?.length ?? 0) > 0
    ? "failed"
    : "passed";
}

function buildLayoutRoutes(routes) {
  return routes.map((route) => ({
    id: route.id,
    route: route.route,
    viewport: route.viewport,
    status: routeStatus(route),
    finalUrl: route.finalUrl,
    screenshot: route.screenshot,
    ready: route.ready,
    overflow: route.overflow,
    keyboardReachable: route.keyboardProbe?.looksReachable ?? null,
    semanticIssues: route.semanticIssues ?? [],
    consoleErrorCount: route.blockingConsoleErrors?.length ?? 0,
    pageErrorCount: route.pageErrors?.length ?? 0,
  }));
}

function buildLayoutActions(representativeStates, clickthrough) {
  return [
    ...representativeStates.map((state) => ({
      id: state.id,
      label: state.interactionLabel,
      route: state.route,
      viewport: state.viewport,
      status: stateStatus(state),
      finalUrl: state.finalUrl,
      screenshot: state.screenshot,
      notes: {
        interactionTarget: state.interactionTarget,
        interactionStatus: state.interactionStatus,
      },
    })),
    ...clickthrough.map((entry) => ({
      id: `nav-${String(entry.target ?? "unknown").toLowerCase()}`,
      label: entry.target,
      route: entry.expect,
      status: entry.status === "passed" ? "passed" : "failed",
      finalUrl: entry.url,
      notes: {
        expectedPathFragment: entry.expect,
        observedStatus: entry.status,
      },
    })),
  ];
}

function collectLayoutErrors(entries, error = null) {
  return {
    console: entries.flatMap((entry) => entry.blockingConsoleErrors ?? []),
    page: entries.flatMap((entry) => entry.pageErrors ?? []),
    harness: error
      ? [
          {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack ?? null : null,
            lastActiveStep,
          },
        ]
      : [],
  };
}

function attachLayoutArtifact({
  clickthrough = [],
  desktopRoutes = [],
  error = null,
  representativeStates = [],
  responsiveRoutes = [],
  runtime,
  screenshotPaths = [],
  status,
  summary,
  targetUrls,
}) {
  const screenshots = collectScreenshotEvidence(screenshotPaths, {
    rootDir: ROOT_DIR,
    runStartedAt: RUN_STARTED_AT,
  });
  const allRouteEntries = [...desktopRoutes, ...responsiveRoutes, ...representativeStates];
  return attachPlaywrightArtifact(summary, {
    actions: buildLayoutActions(representativeStates, clickthrough),
    checkName: "check:layout",
    errors: collectLayoutErrors(allRouteEntries, error),
    metadata: {
      desktop_route_count: desktopRoutes.length,
      responsive_route_count: responsiveRoutes.length,
      representative_state_count: representativeStates.length,
      clickthrough_count: clickthrough.length,
      last_active_step: lastActiveStep,
    },
    routes: buildLayoutRoutes([...desktopRoutes, ...responsiveRoutes]),
    runtime: runtimeEvidence(runtime),
    screenshots,
    startedAt: RUN_STARTED_AT,
    status,
    targetUrls,
    visualRegression: buildVisualSnapshot(screenshots, { baseline: previousVisualBaseline }),
  });
}

function getArtifactFreshness(paths) {
  return paths.map((artifactPath) => {
    if (!artifactPath || !existsSync(artifactPath)) {
      return {
        path: artifactPath,
        exists: false,
        fresh: false,
      };
    }

    const stats = statSync(artifactPath);
    return {
      path: artifactPath,
      exists: true,
      fresh: stats.mtimeMs >= RUN_STARTED_AT.getTime() - 1000,
      modifiedAt: stats.mtime.toISOString(),
      runStartedAt: RUN_STARTED_AT.toISOString(),
    };
  });
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runCleanup() {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      try {
        await cleanup();
      } catch {
        // Cleanup is best-effort; the terminal artifact is more important than masking the real failure.
      }
    }
  }

  async function writeTerminalArtifact({ error, runtime, status, timedOut = false }) {
    await ensureOutputDir();
    const artifactPaths = [OUTPUT_JSON];
    const summary = {
      checkedAt: new Date().toISOString(),
      webUrl: activeTargetUrls.webUrl,
      apiUrl: activeTargetUrls.apiUrl,
      run: createRunPayload(status, {
        timedOut,
        failureKind: timedOut ? "harness_timeout" : "harness_failure",
        error: error instanceof Error ? error.message : String(error),
      }),
      runtime: runtimeEvidence(runtime),
      artifactFreshness: {
        outputJson: {
          path: OUTPUT_JSON,
          fresh: true,
          note: "This failure artifact is written for the current run.",
        },
        previousOutputJson: getArtifactFreshness(artifactPaths)[0],
      },
      desktopRoutes: [],
      responsiveRoutes: [],
      representativeStates: [],
      clickthrough: [],
      releaseSignal: {
        browserSweepGreen: false,
        visualProofGreen: false,
        clickthroughGreen: false,
        manualVisualReviewRequired: true,
        manualScreenReaderSignOff: "pending",
      },
      problemRoutes: [],
      problemStates: [],
      failedClicks: [],
    };

    const summaryWithArtifact = attachLayoutArtifact({
      error,
      runtime,
      status,
      summary,
      targetUrls: activeTargetUrls,
    });

    await writeFile(OUTPUT_JSON, JSON.stringify(summaryWithArtifact, null, 2), "utf-8");
    await writeHistoryArtifact(summaryWithArtifact);
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
    await mkdir(LAYOUT_HISTORY_DIR, { recursive: true });
  }

  async function loadPreviousVisualBaseline() {
    if (!existsSync(OUTPUT_JSON)) {
      return null;
    }

    try {
      const previousArtifact = JSON.parse(await readFile(OUTPUT_JSON, "utf-8"));
      return previousArtifact?.artifact?.visual_regression ?? null;
    } catch {
      return null;
    }
  }

  async function writeHistoryArtifact(summary) {
    const historyPath = path.join(LAYOUT_HISTORY_DIR, `${RUN_ID}.json`);
    await writeFile(historyPath, JSON.stringify(summary, null, 2), "utf-8");
    return historyPath;
  }

  async function assertJsonHealth(name, url) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`${name} health failed: ${response.status} for ${url}`);
    }
    const payload = await response.json();
    if (!payload || payload.status !== "ok") {
      throw new Error(`${name} health returned unexpected payload: ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  async function assertWebReachable(url) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`web reachability failed: ${response.status} for ${url}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`web reachability returned unexpected content type "${contentType}" for ${url}`);
    }
  }

  async function waitForAppReady(page, routePath) {
    const isCaptureRoute = routePath === "/capture";
    const probeReady = (timeout) =>
      page
        .waitForFunction(
          ({ isCaptureRoute }) => {
            const bodyText = document.body?.textContent ?? "";
            const isSessionLoading =
              bodyText.includes("Sprawdzam lokalna sesje") ||
              bodyText.includes("Otwieram odpowiednia baze");

            if (isSessionLoading) {
              return false;
            }

            if (isCaptureRoute) {
              return Boolean(document.querySelector(".capture-page") || document.querySelector("h1"));
            }

            return Boolean(document.querySelector(".app-shell") && document.querySelector("main"));
          },
          { isCaptureRoute },
          { timeout },
        )
        .then(() => true)
        .catch(() => false);

    let isReady = await probeReady(8000);
    if (!isReady) {
      await page
        .reload({
          timeout: 60000,
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
      isReady = await probeReady(12000);
    }

    if (!isReady) {
      await page
        .goto(page.url(), {
          timeout: 60000,
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
      isReady = await probeReady(20000);
    }

    await page.waitForTimeout(300);
    if (isReady) {
      return true;
    }

    return page.evaluate(
      ({ isCaptureRoute: isCaptureRouteForFinalCheck }) => {
        const bodyText = document.body?.textContent ?? "";
        const isSessionLoading =
          bodyText.includes("Sprawdzam lokalna sesje") ||
          bodyText.includes("Otwieram odpowiednia baze");

        if (isSessionLoading) {
          return false;
        }

        if (isCaptureRouteForFinalCheck) {
          return Boolean(document.querySelector(".capture-page") || document.querySelector("h1"));
        }

        return Boolean(document.querySelector(".app-shell") && document.querySelector("main"));
      },
      { isCaptureRoute },
    );
  }

  async function collectRouteMetrics(page) {
    return page.evaluate(() => {
      const h1Nodes = Array.from(document.querySelectorAll("h1"))
        .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const main = document.querySelector("main");
      const isCaptureRoute = window.location.pathname === "/capture";
      const mainText = main?.textContent?.trim().slice(0, 280) || null;
      const mainId = main?.id ?? null;
      const skipTargetsMain = mainId
        ? Array.from(document.querySelectorAll("a[href]")).some((element) => element.getAttribute("href") === `#${mainId}`)
        : false;
      const semanticIssues = [];

      if (h1Nodes.length !== 1) {
        semanticIssues.push(`expected exactly one h1, found ${h1Nodes.length}`);
      }
      if (!main) {
        semanticIssues.push("missing main landmark");
      }
      if (main && !main.getAttribute("aria-label") && !main.getAttribute("aria-labelledby")) {
        semanticIssues.push("main landmark is missing accessible label");
      }
      if (!isCaptureRoute && !document.querySelector("header")) {
        semanticIssues.push("missing header landmark");
      }
      if (!isCaptureRoute && document.querySelectorAll("nav").length < 1) {
        semanticIssues.push("missing product navigation landmark");
      }
      if (!isCaptureRoute && !skipTargetsMain) {
        semanticIssues.push("missing skip link to main content");
      }

      const buttons = Array.from(document.querySelectorAll("button"))
        .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 20);
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const offenders = Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const text = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
          return {
            tag: element.tagName.toLowerCase(),
            className: String(element.className || "").slice(0, 120),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            overflowX: style.overflowX,
            text,
          };
        })
        .filter((item) => item.right > window.innerWidth + 2 || item.width > window.innerWidth + 2)
        .slice(0, 15);

      return {
        h1: h1Nodes[0] ?? null,
        h1Count: h1Nodes.length,
        h1Nodes,
        hasMain: Boolean(main),
        mainId,
        mainAriaLabel: main?.getAttribute("aria-label") ?? null,
        mainAriaLabelledBy: main?.getAttribute("aria-labelledby") ?? null,
        headerCount: document.querySelectorAll("header").length,
        navCount: document.querySelectorAll("nav").length,
        skipTargetsMain,
        semanticIssues,
        mainText,
        buttons,
        overflow,
        offenders,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
  }

  async function collectKeyboardProbe(page) {
    const sequence = [];

    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      sequence.push(
        await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement)) {
            return "none";
          }
          const text = (element.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.className ? `.${String(element.className).split(/\s+/).filter(Boolean).slice(0, 3).join(".")}` : ""}:${text}`;
        }),
      );
    }

    const uniqueTargets = [...new Set(sequence.filter((entry) => entry !== "body:" && entry !== "none"))];
    return {
      sequence,
      uniqueTargetCount: uniqueTargets.length,
      looksReachable: uniqueTargets.length >= 2,
    };
  }

  function isExpectedConsoleNoise(entry, routePath) {
    return (
      routePath === "/digest" &&
      entry?.type === "error" &&
      typeof entry.text === "string" &&
      entry.text.includes("Failed to load resource: the server responded with a status of 400")
    );
  }

  function getBlockingConsoleEntries(entries, routePath) {
    return entries.filter((entry) => !isExpectedConsoleNoise(entry, routePath));
  }

  async function prepareForScreenshot(page) {
    await page.evaluate(() => {
      const activeElement = document.activeElement;

      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        activeElement.blur();
        return;
      }

      if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
        activeElement.blur();
        return;
      }

      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
    });
    await page.waitForTimeout(50);
  }

  async function scanRoute(page, route, viewportId, baseUrl, consoleBucket, pageErrorBucket) {
    const beforeConsole = consoleBucket.length;
    const beforePageErrors = pageErrorBucket.length;

    await page.goto(`${baseUrl}${route.path}`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    const ready = await waitForAppReady(page, route.path);
    const metrics = await collectRouteMetrics(page);
    const keyboardProbe = await collectKeyboardProbe(page);
    const consoleErrors = consoleBucket.slice(beforeConsole);

    const screenshotPath = path.join(OUTPUT_DIR, `page-audit-${route.id}-${viewportId}.png`);
    await prepareForScreenshot(page);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return {
      id: route.id,
      route: route.path,
      viewport: viewportId,
      finalUrl: page.url(),
      ready,
      screenshot: screenshotPath,
      consoleErrors,
      blockingConsoleErrors: getBlockingConsoleEntries(consoleErrors, route.path),
      pageErrors: pageErrorBucket.slice(beforePageErrors),
      keyboardProbe,
      ...metrics,
    };
  }

  async function captureRepresentativeState(page, proof, baseUrl, consoleBucket, pageErrorBucket) {
    const beforeConsole = consoleBucket.length;
    const beforePageErrors = pageErrorBucket.length;

    await page.goto(`${baseUrl}${proof.route}`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    const ready = await waitForAppReady(page, proof.route);

    let interactionStatus = ready ? "missing" : "not-ready";
    const button = page.locator("button").filter({ hasText: proof.toggleText }).first();
    if (ready && (await button.count())) {
      try {
        await button.click({ timeout: 5000 });
        await page.waitForTimeout(900);
        interactionStatus = "passed";
      } catch (error) {
        interactionStatus = `failed:${String(error).slice(0, 160)}`;
      }
    }

    const metrics = await collectRouteMetrics(page);
    const keyboardProbe = await collectKeyboardProbe(page);
    const consoleErrors = consoleBucket.slice(beforeConsole);
    const screenshotPath = path.join(OUTPUT_DIR, `page-audit-${proof.id}.png`);
    await prepareForScreenshot(page);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return {
      id: proof.id,
      route: proof.route,
      viewport: proof.viewport.id,
      finalUrl: page.url(),
      ready,
      screenshot: screenshotPath,
      interactionLabel: proof.interactionLabel,
      interactionTarget: proof.toggleText,
      interactionStatus,
      consoleErrors,
      blockingConsoleErrors: getBlockingConsoleEntries(consoleErrors, proof.route),
      pageErrors: pageErrorBucket.slice(beforePageErrors),
      keyboardProbe,
      ...metrics,
    };
  }

  async function findVisibleButton(page, text) {
    const matches = page.locator("button").filter({ hasText: text });
    const count = await matches.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = matches.nth(index);
      if (await candidate.isVisible()) {
        return candidate;
      }
    }

    return null;
  }

  async function runClickthrough(page, baseUrl) {
    const clickTargets = [
      { text: "Odkrywaj", labels: ["Odkrywaj"], expect: "/discover" },
      { text: "Źródła", labels: ["Źródła", "Zrodla"], expect: "/sources" },
      { text: "Digest", labels: ["Digest"], expect: "/digest" },
      { text: "Ustawienia", labels: ["Ustawienia"], expect: "/settings" },
      { text: "Czytaj", labels: ["Czytaj"], expect: "/read/" },
    ];

    const results = [];

    for (const target of clickTargets) {
      let status = "missing";
      const startRoute = target.text === "Czytaj" ? "/discover" : "/read/inbox";

      try {
        await page.goto(`${baseUrl}${startRoute}`, {
          timeout: 60000,
          waitUntil: "domcontentloaded",
        });
        await waitForAppReady(page, startRoute);

        let button = null;
        for (const label of target.labels) {
          button = await findVisibleButton(page, label);
          if (button) {
            break;
          }
        }
        if (button) {
          await button.click({ timeout: 5000 });
          await page.waitForURL((url) => url.pathname.includes(target.expect), { timeout: 5000 }).catch(() => {});
          await waitForAppReady(page, new URL(page.url()).pathname);
          status = page.url().includes(target.expect) ? "passed" : `unexpected:${page.url()}`;
        }
      } catch (error) {
        status = `failed:${String(error).slice(0, 160)}`;
      }

      results.push({
        target: target.text,
        expect: target.expect,
        status,
        url: page.url(),
      });
    }

    return results;
  }

async function main() {
  await ensureOutputDir();
  previousVisualBaseline = await loadPreviousVisualBaseline();
  let runtime = null;
  let browser = null;
  let terminalArtifactWritten = false;
  const timeout = setTimeout(() => {
    void (async () => {
      const error = new Error(`check:layout timed out after ${HARD_TIMEOUT_MS}ms at step "${lastActiveStep}"`);
      await writeTerminalArtifact({ error, runtime, status: "timeout", timedOut: true });
      await runCleanup();
      console.error(error);
      process.exit(124);
    })();
  }, HARD_TIMEOUT_MS);

  try {
    const { chromium } = loadPlaywright();
    const requestedWebUrl = activeTargetUrls.webUrl;
    const requestedApiUrl = activeTargetUrls.apiUrl;

    setActiveStep("prepare runtime");
    runtime = await prepareSmokeRuntime({
      apiUrl: requestedApiUrl,
      forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
      label: "layout-qa",
      outputDir: OUTPUT_DIR,
      webUrl: requestedWebUrl,
    });
    cleanupCallbacks.push(() => runtime.close());

    const webUrl = runtime.webUrl;
    const apiUrl = runtime.apiUrl;
    activeTargetUrls = { webUrl, apiUrl };

    setActiveStep("assert web and api health");
    await assertWebReachable(`${webUrl}/`);
    await assertJsonHealth("api", `${apiUrl}/health`);

    setActiveStep("launch browser");
    browser = await chromium.launch({ headless: true });
    cleanupCallbacks.push(() => browser?.close().catch(() => {}));
    const desktopContext = await browser.newContext({
      viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
    });
    const desktopPage = await desktopContext.newPage();
    const desktopConsoleErrors = [];
    const desktopPageErrors = [];

    desktopPage.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        desktopConsoleErrors.push({
          type: message.type(),
          text: message.text(),
          url: desktopPage.url(),
        });
      }
    });

    desktopPage.on("pageerror", (error) => {
      desktopPageErrors.push({
        message: String(error),
        url: desktopPage.url(),
      });
    });

    const desktopRoutes = [];
    for (const route of DESKTOP_ROUTES) {
      setActiveStep(`scan desktop ${route.path}`);
      desktopRoutes.push(
        await scanRoute(desktopPage, route, DESKTOP_VIEWPORT.id, webUrl, desktopConsoleErrors, desktopPageErrors),
      );
    }

    const representativeStates = [];
    for (const proof of REPRESENTATIVE_STATE_PROOFS) {
      setActiveStep(`capture representative state ${proof.id}`);
      const context = await browser.newContext({
        viewport: { width: proof.viewport.width, height: proof.viewport.height },
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

      representativeStates.push(
        await captureRepresentativeState(page, proof, webUrl, consoleErrors, pageErrors),
      );

      await context.close();
    }

    setActiveStep("run primary nav clickthrough");
    const clickthrough = await runClickthrough(desktopPage, webUrl);
    await desktopContext.close();

    const responsiveRoutes = [];
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      setActiveStep(`scan responsive viewport ${viewport.id}`);
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

      for (const route of RESPONSIVE_ROUTES) {
        setActiveStep(`scan ${viewport.id} ${route.path}`);
        responsiveRoutes.push(await scanRoute(page, route, viewport.id, webUrl, consoleErrors, pageErrors));
      }

      await context.close();
    }

    setActiveStep("close browser");
    await browser.close();
    browser = null;

    const allRoutes = [...desktopRoutes, ...responsiveRoutes];
    const problemRoutes = allRoutes.filter(
      (route) =>
        !route.ready ||
        route.overflow ||
        route.semanticIssues.length > 0 ||
        !route.keyboardProbe.looksReachable ||
        route.blockingConsoleErrors.length > 0 ||
        route.pageErrors.length > 0,
    );
    const problemStates = representativeStates.filter(
      (state) =>
        !state.ready ||
        state.interactionStatus !== "passed" ||
        state.overflow ||
        state.semanticIssues.length > 0 ||
        !state.keyboardProbe.looksReachable ||
        state.blockingConsoleErrors.length > 0 ||
        state.pageErrors.length > 0,
    );
    const failedClicks = clickthrough.filter((entry) => entry.status !== "passed");
    const layoutStatus =
      problemRoutes.length === 0 && problemStates.length === 0 && failedClicks.length === 0 ? "passed" : "failed";
    const screenshotPaths = [
      ...desktopRoutes,
      ...responsiveRoutes,
      ...representativeStates,
    ].map((entry) => entry.screenshot);

    const summary = {
      checkedAt: new Date().toISOString(),
      webUrl,
      apiUrl,
      run: createRunPayload(layoutStatus, {
        timedOut: false,
        failureKind: layoutStatus === "passed" ? null : "product_or_layout_failure",
      }),
      runtime: runtimeEvidence(runtime),
      artifactFreshness: {
        outputJson: {
          path: OUTPUT_JSON,
          fresh: true,
          note: "This artifact is written at the end of the current run.",
        },
        screenshots: getArtifactFreshness(screenshotPaths),
      },
      desktopRoutes,
      responsiveRoutes,
      representativeStates,
      clickthrough,
      releaseSignal: {
        browserSweepGreen: problemRoutes.length === 0,
        visualProofGreen: problemStates.length === 0,
        clickthroughGreen: failedClicks.length === 0,
        manualVisualReviewRequired: true,
        manualScreenReaderSignOff: "pending",
      },
      problemRoutes,
      problemStates,
      failedClicks,
    };

    const summaryWithArtifact = attachLayoutArtifact({
      clickthrough,
      desktopRoutes,
      representativeStates,
      responsiveRoutes,
      runtime,
      screenshotPaths,
      status: layoutStatus,
      summary,
      targetUrls: { webUrl, apiUrl },
    });

    await writeFile(OUTPUT_JSON, JSON.stringify(summaryWithArtifact, null, 2), "utf-8");
    await writeHistoryArtifact(summaryWithArtifact);
    terminalArtifactWritten = true;

    assert(problemRoutes.length === 0, `Layout sweep detected issues: ${problemRoutes.map((route) => `${route.viewport}:${route.route}`).join(", ")}`);
    assert(problemStates.length === 0, `Layout representative states failed: ${problemStates.map((state) => `${state.viewport}:${state.id}`).join(", ")}`);
    assert(failedClicks.length === 0, `Primary nav clickthrough failed: ${failedClicks.map((entry) => entry.target).join(", ")}`);

    console.log(
      JSON.stringify(
        {
          output: OUTPUT_JSON,
          desktopRouteCount: desktopRoutes.length,
          responsiveRouteCount: responsiveRoutes.length,
          representativeStateCount: representativeStates.length,
          clickthrough,
        },
        null,
        2,
      ),
    );
    setActiveStep("complete");
    clearTimeout(timeout);
    await runCleanup();
  } catch (error) {
    clearTimeout(timeout);
    if (!terminalArtifactWritten) {
      await writeTerminalArtifact({ error, runtime, status: "failed" });
    }
    await runCleanup();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
