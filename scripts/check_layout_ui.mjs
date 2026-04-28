import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "layout-qa.json");

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
    const h1 = document.querySelector("h1")?.textContent?.trim() || null;
    const mainText = document.querySelector("main")?.textContent?.trim().slice(0, 280) || null;
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
      h1,
      mainText,
      buttons,
      overflow,
      offenders,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
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
    consoleErrors: consoleBucket.slice(beforeConsole),
    pageErrors: pageErrorBucket.slice(beforePageErrors),
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
    consoleErrors: consoleBucket.slice(beforeConsole),
    pageErrors: pageErrorBucket.slice(beforePageErrors),
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
    { text: "Odkrywaj", expect: "/discover" },
    { text: "Zrodla", expect: "/sources" },
    { text: "Digest", expect: "/digest" },
    { text: "Ustawienia", expect: "/settings" },
    { text: "Czytaj", expect: "/read/" },
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

      const button = await findVisibleButton(page, target.text);
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

  const { chromium } = loadPlaywright();
  const webUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const apiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

  await assertWebReachable(`${webUrl}/`);
  await assertJsonHealth("api", `${apiUrl}/health`);

  const browser = await chromium.launch({ headless: true });
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
    desktopRoutes.push(
      await scanRoute(desktopPage, route, DESKTOP_VIEWPORT.id, webUrl, desktopConsoleErrors, desktopPageErrors),
    );
  }

  const representativeStates = [];
  for (const proof of REPRESENTATIVE_STATE_PROOFS) {
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

  const clickthrough = await runClickthrough(desktopPage, webUrl);
  await desktopContext.close();

  const responsiveRoutes = [];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
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
      responsiveRoutes.push(await scanRoute(page, route, viewport.id, webUrl, consoleErrors, pageErrors));
    }

    await context.close();
  }

  await browser.close();

  const allRoutes = [...desktopRoutes, ...responsiveRoutes];
  const problemRoutes = allRoutes.filter(
    (route) => !route.ready || route.overflow || route.consoleErrors.length > 0 || route.pageErrors.length > 0,
  );
  const problemStates = representativeStates.filter(
    (state) =>
      !state.ready ||
      state.interactionStatus !== "passed" ||
      state.overflow ||
      state.consoleErrors.length > 0 ||
      state.pageErrors.length > 0,
  );
  const failedClicks = clickthrough.filter((entry) => entry.status !== "passed");

  const summary = {
    checkedAt: new Date().toISOString(),
    webUrl,
    apiUrl,
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

  await writeFile(OUTPUT_JSON, JSON.stringify(summary, null, 2), "utf-8");

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
