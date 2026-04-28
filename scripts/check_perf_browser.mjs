import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "browser-perf-smoke.json");
const WARNING_MS = 3000;
const FAIL_MS = 6000;

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

function percentile95(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

async function waitForRouteReady(page, routePath) {
  const isSources = routePath.startsWith("/sources");
  await page.waitForFunction(
    ({ isSources }) => {
      const bodyText = document.body?.textContent ?? "";
      const isSessionLoading =
        bodyText.includes("Sprawdzam lokalna sesje") ||
        bodyText.includes("Otwieram odpowiednia baze");

      if (isSessionLoading) {
        return false;
      }

      if (isSources) {
        return Boolean(document.querySelector('[data-testid="source-main-heading"]'));
      }

      return Boolean(document.querySelector(".app-shell") && document.querySelector("main"));
    },
    { isSources },
    { timeout: FAIL_MS },
  );
}

async function main() {
  await ensureOutputDir();

  const { chromium } = loadPlaywright();
  const webUrl = (process.env.RSSMASTER_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const apiUrl = (process.env.RSSMASTER_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const routes = ["/read/inbox", "/read/saved?scope=all&sort=newest", "/sources"];

  await assertJsonHealth("web", `${webUrl}/api/health`);
  await assertJsonHealth("api", `${apiUrl}/health`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const samples = {};
  try {
    for (const route of routes) {
      samples[route] = [];
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        await page.goto(`${webUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitForRouteReady(page, route);
        samples[route].push(Math.round(performance.now() - started));
      }
    }
  } finally {
    await browser.close();
  }

  const routeP95 = Object.fromEntries(Object.entries(samples).map(([route, values]) => [route, percentile95(values)]));
  const allSamples = Object.values(samples).flat();
  const warmP95 = percentile95(allSamples);
  const status = warmP95 > FAIL_MS ? "fail" : warmP95 > WARNING_MS ? "warn" : "pass";
  const result = {
    status,
    thresholds: {
      warningMs: WARNING_MS,
      failMs: FAIL_MS,
    },
    warmP95Ms: warmP95,
    routeP95Ms: routeP95,
    samplesMs: samples,
    consoleErrors,
    pageErrors,
  };

  assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
  assert(consoleErrors.length === 0, `consoleErrors=${JSON.stringify(consoleErrors)}`);

  console.log(JSON.stringify(result, null, 2));
  await writeFile(OUTPUT_JSON, JSON.stringify(result, null, 2), "utf8");

  if (status === "fail") {
    throw new Error(`Browser route-ready warm p95 ${warmP95}ms exceeds fail threshold ${FAIL_MS}ms`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
