import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const FIXTURE_ROOT = path.join(ROOT_DIR, "scripts", "fixtures", "sources-preview");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "sources-a11y-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "sources-a11y-smoke.png");

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

  const { chromium } = loadPlaywright();
  const webUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const apiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

  await assertJsonHealth("web", `${webUrl}/api/health`);
  await assertJsonHealth("api", `${apiUrl}/health`);

  const fixtureServer = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
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
    stalePreviewGuarded: false,
    tabletRender: false,
    transportFailureQuiet: false,
  };

  try {
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
    await page.waitForFunction(() => document.body.innerText.includes("Kanal zapisany"), undefined, { timeout: 20000 });
    results.a11ySnapshots.resultsRegion = await captureAccessibilitySnapshot(page, '[data-testid="source-results-region"]');
    await page.getByTestId("source-input").fill("");
    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/site-single/`);
    await page.waitForSelector("text=Juz obserwujesz", { timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes("Przejdz do feedu"), undefined, { timeout: 5000 });
    results.alreadyFollowedWorks = true;

    await page.getByTestId("source-mode-web_feed").click();
    await expectActiveTestId(page, "source-input");
    await page.getByTestId("source-input").fill(`${fixtureServer.origin}/feeds/manual.xml`);
    await page.getByRole("button", { name: "Znajdz" }).click();
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
    await page.waitForSelector("text=Wiele kandydatow", { timeout: 20000 });
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
  } finally {
    await browser.close();
    await fixtureServer.close();
  }

  console.log(JSON.stringify(results, null, 2));
  await writeFile(OUTPUT_JSON, JSON.stringify(results, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
