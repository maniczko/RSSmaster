import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareSmokeRuntime } from "./lib/local-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "reader-interaction-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "reader-interaction-smoke.png");

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

function buildArticleDocument(title, lead) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <meta property="og:title" content="${title}" />
      </head>
      <body>
        <main>
          <article>
            <h1>${title}</h1>
            <p>${lead}</p>
            <p>Second paragraph verifies the premium reader decision loop can stay in-app and move to the next article.</p>
            <p>Third paragraph gives the extractor enough editorial body to render cleaned article prose.</p>
          </article>
        </main>
      </body>
    </html>`;
}

async function startFixtureServer() {
  const articles = new Map([
    ["/old-article", buildArticleDocument("Reader interaction older article", "Older article body for next navigation.")],
    ["/new-article", buildArticleDocument("Reader interaction newer article", "Newer article body for action plus next.")],
  ]);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const body = articles.get(url.pathname);
    if (!body) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(body);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert(address && typeof address === "object", "Fixture server did not expose a TCP address.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
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
  if (!response.ok || !payload?.item?.id) {
    throw new Error(`Capture failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.item;
}

async function waitForReaderArticle(page, title) {
  await page.waitForFunction((expectedTitle) => document.body.innerText.includes(expectedTitle), title, {
    timeout: 30000,
  });
  const proseVisible = await page.locator(".reader-article-prose").first().isVisible().catch(() => false);
  if (!proseVisible) {
    const readButton = page.getByRole("button", {
      name: /Czytaj (artykul|artykuł|oczyszczony|fallback|skrot|skrót)/i,
    }).first();
    if ((await readButton.count()) > 0 && (await readButton.isVisible())) {
      await readButton.click({ timeout: 8000 });
    }
  }
  await page.waitForSelector(".reader-article-prose", { timeout: 20000 });
  await page.waitForSelector('[data-testid="reader-decision-bar"]', { timeout: 20000 });
}

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const requestedWebUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const requestedApiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const runtime = await prepareSmokeRuntime({
    apiUrl: requestedApiUrl,
    forceExistingRuntime: process.env.RSSMASTER_USE_EXISTING_RUNTIME === "1",
    label: "reader-interaction-smoke",
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const results = {
      openedNewerArticle: false,
      decisionBarVisible: false,
      actionAdvancedToNext: false,
      undoEnabled: false,
      mobileTargetMinHeight: false,
      noHorizontalOverflow: false,
      consoleErrors,
      pageErrors,
      runtime: {
        apiUrl,
        isolated: runtime.isolated,
        runDir: runtime.runDir,
        webUrl,
      },
    };

    try {
      await captureReaderArticle(apiUrl, `${fixtureServer.origin}/old-article`);
      const newerItem = await captureReaderArticle(apiUrl, `${fixtureServer.origin}/new-article`);

      await page.goto(`${webUrl}/read/saved?scope=all&sort=newest&surface=article&item=${encodeURIComponent(newerItem.id)}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForReaderArticle(page, "Reader interaction newer article");
      results.openedNewerArticle = true;
      results.decisionBarVisible = await page.getByTestId("reader-decision-bar").isVisible();

      const readNextButton = page.getByTestId("reader-decision-read-next");
      const buttonMetrics = await readNextButton.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return {
          cursor: style.cursor,
          height: rect.height,
        };
      });
      results.mobileTargetMinHeight = buttonMetrics.cursor === "pointer" && buttonMetrics.height >= 44;

      await readNextButton.click();
      await page.waitForFunction(
        () => document.body.innerText.includes("Reader interaction older article"),
        undefined,
        { timeout: 30000 },
      );
      results.actionAdvancedToNext = true;
      results.undoEnabled = await page.getByTestId("reader-decision-undo").isEnabled();
      results.noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

      assert(results.decisionBarVisible, "Reader decision bar is not visible.");
      assert(results.mobileTargetMinHeight, `Primary mobile target is too small or not pointer: ${JSON.stringify(buttonMetrics)}`);
      assert(results.actionAdvancedToNext, "Reader action + next did not advance to the next article.");
      assert(results.undoEnabled, "Undo action is not enabled after decision action.");
      assert(results.noHorizontalOverflow, "Mobile reader has horizontal overflow.");
      assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
      assert(consoleErrors.length === 0, `consoleErrors=${JSON.stringify(consoleErrors)}`);

      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });
    } finally {
      await browser.close();
      await fixtureServer.close();
    }

    console.log(JSON.stringify(results, null, 2));
    await writeFile(OUTPUT_JSON, JSON.stringify(results, null, 2), "utf8");
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
