import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareSmokeRuntime } from "./lib/local-runtime.mjs";
import { attachPlaywrightArtifact } from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "browser-perf-smoke.json");
const HISTORY_DIR = path.join(OUTPUT_DIR, "perf-history");
const HISTORY_JSONL = path.join(HISTORY_DIR, "browser-route-ready.ndjson");
const WARNING_MS = 3000;
const FAIL_MS = 6000;
const SAMPLE_RUNS = 3;
const ROUTES = ["/read/inbox", "/read/saved?scope=all&sort=newest", "/sources", "/digest"];
const ACCOUNT_PASSWORD = "PerfSmoke-12345";
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
  await mkdir(HISTORY_DIR, { recursive: true });
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

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function percentile95(values) {
  return percentile(values, 0.95);
}

function percentile99(values) {
  return percentile(values, 0.99);
}

async function waitForRouteReady(page, routePath) {
  const isSources = routePath.startsWith("/sources");
  const isDigest = routePath.startsWith("/digest");
  await page.waitForFunction(
    ({ isDigest, isSources }) => {
      const bodyText = document.body?.textContent ?? "";
      const isSessionLoading =
        bodyText.includes("Sprawdzam lokalna sesje") ||
        bodyText.includes("Sprawdzam lokalną sesję") ||
        bodyText.includes("Otwieram odpowiednia baze");

      if (isSessionLoading) {
        return false;
      }

      if (isSources) {
        return Boolean(document.querySelector('[data-testid="source-main-heading"]'));
      }

      if (isDigest) {
        return Boolean(document.querySelector(".app-shell") && document.querySelector("main") && bodyText.includes("Digest"));
      }

      return Boolean(document.querySelector(".app-shell") && document.querySelector("main"));
    },
    { isDigest, isSources },
    { timeout: FAIL_MS },
  );
}

function isExpectedConsoleNoise(message) {
  return message.includes("/api/v1/digests/preview") && (message.includes("400") || message.includes("Bad Request"));
}

async function responseJsonOrNull(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildPerfAccount() {
  const timestamp = Date.now();
  return {
    displayName: "Perf Smoke Operator",
    password: ACCOUNT_PASSWORD,
    username: `perfqa${timestamp}`,
  };
}

async function registerPerfAccount(context, apiUrl, account) {
  const response = await context.request.post(`${apiUrl}/api/v1/auth/register`, {
    data: {
      claim_legacy_workspace: false,
      display_name: account.displayName,
      password: account.password,
      username: account.username,
    },
  });
  const payload = await responseJsonOrNull(response);
  assert(response.ok(), `Perf account register failed: ${response.status()} ${JSON.stringify(payload)}`);
  assert(payload?.session?.account?.username === account.username, `Unexpected register payload: ${JSON.stringify(payload)}`);
}

async function authenticatePerfContext(context, apiUrl, account) {
  const response = await context.request.post(`${apiUrl}/api/v1/auth/login`, {
    data: {
      password: account.password,
      username: account.username,
    },
  });
  const payload = await responseJsonOrNull(response);
  assert(response.ok(), `Perf account login failed: ${response.status()} ${JSON.stringify(payload)}`);
  assert(payload?.session?.account?.username === account.username, `Unexpected login payload: ${JSON.stringify(payload)}`);
}

async function createAuthenticatedContext(browser, apiUrl, account) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await authenticatePerfContext(context, apiUrl, account);
  return context;
}

async function measureRoute(page, webUrl, route) {
  const started = performance.now();
  await page.goto(`${webUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForRouteReady(page, route);
  return Math.round(performance.now() - started);
}

function summarizeSamples(samples) {
  const routeP95Ms = {};
  const routeP99Ms = {};
  const routeMaxMs = {};
  for (const [route, values] of Object.entries(samples)) {
    routeP95Ms[route] = percentile95(values);
    routeP99Ms[route] = percentile99(values);
    routeMaxMs[route] = Math.max(...values);
  }
  const allSamples = Object.values(samples).flat();
  return {
    overallP95Ms: percentile95(allSamples),
    overallP99Ms: percentile99(allSamples),
    routeMaxMs,
    routeP95Ms,
    routeP99Ms,
    samplesMs: samples,
  };
}

function deriveStatus(cold, warm) {
  const worstP95 = Math.max(cold.overallP95Ms, warm.overallP95Ms);
  if (worstP95 > FAIL_MS) {
    return "fail";
  }
  if (worstP95 > WARNING_MS) {
    return "warn";
  }
  return "pass";
}

function artifactStatus(status) {
  return status === "fail" ? "failed" : "passed";
}

function withStandardArtifact(result) {
  return attachPlaywrightArtifact(result, {
    actions: [
      {
        id: "browser-perf-cold",
        label: "Cold route-ready baseline",
        status: artifactStatus(result.status),
        notes: {
          overallP95Ms: result.cold?.overallP95Ms ?? null,
          overallP99Ms: result.cold?.overallP99Ms ?? null,
        },
      },
      {
        id: "browser-perf-warm",
        label: "Warm route-ready baseline",
        status: artifactStatus(result.status),
        notes: {
          overallP95Ms: result.warm?.overallP95Ms ?? null,
          overallP99Ms: result.warm?.overallP99Ms ?? null,
        },
      },
    ],
    checkName: "check:perf:browser",
    errors: {
      console: result.blockingConsoleErrors ?? [],
      page: result.pageErrors ?? [],
      harness: result.error ? [{ message: String(result.error) }] : [],
    },
    metadata: {
      perf_status: result.status,
      thresholds: result.thresholds,
      cold: result.cold,
      warm: result.warm,
      routes: result.routes,
      sample_runs: result.sampleRuns,
    },
    routes: (result.routes ?? []).map((route) => ({
      id: `perf-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`,
      route,
      viewport: "desktop",
      status: artifactStatus(result.status),
      ready: true,
      overflow: null,
      notes: {
        coldP95Ms: result.cold?.routeP95Ms?.[route] ?? null,
        coldP99Ms: result.cold?.routeP99Ms?.[route] ?? null,
        warmP95Ms: result.warm?.routeP95Ms?.[route] ?? null,
        warmP99Ms: result.warm?.routeP99Ms?.[route] ?? null,
      },
    })),
    runtime: result.runtime,
    screenshots: [],
    startedAt: RUN_STARTED_AT,
    status: artifactStatus(result.status),
    targetUrls: {
      apiUrl: result.runtime?.apiUrl ?? null,
      webUrl: result.runtime?.webUrl ?? null,
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
    label: "browser-perf-smoke",
    outputDir: OUTPUT_DIR,
    requireAuthenticated: true,
    webUrl: requestedWebUrl,
  });
  const webUrl = runtime.webUrl;
  const apiUrl = runtime.apiUrl;

  try {
    await assertJsonHealth("web", `${webUrl}/api/health`);
    await assertJsonHealth("api", `${apiUrl}/health`);

    const browser = await chromium.launch({ headless: true });
    const consoleErrors = [];
    const blockingConsoleErrors = [];
    const pageErrors = [];
    const account = buildPerfAccount();

    try {
      const setupContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        await registerPerfAccount(setupContext, apiUrl, account);
      } finally {
        await setupContext.close();
      }

      const coldSamples = Object.fromEntries(ROUTES.map((route) => [route, []]));
      const warmSamples = Object.fromEntries(ROUTES.map((route) => [route, []]));

      for (const route of ROUTES) {
        for (let run = 0; run < SAMPLE_RUNS; run += 1) {
          const context = await createAuthenticatedContext(browser, apiUrl, account);
          const page = await context.newPage();
          page.on("console", (message) => {
            if (message.type() === "error") {
              const text = message.text();
              consoleErrors.push(text);
              if (!isExpectedConsoleNoise(text)) {
                blockingConsoleErrors.push(text);
              }
            }
          });
          page.on("pageerror", (error) => pageErrors.push(String(error)));
          try {
            coldSamples[route].push(await measureRoute(page, webUrl, route));
          } finally {
            await context.close();
          }
        }
      }

      const warmContext = await createAuthenticatedContext(browser, apiUrl, account);
      const warmPage = await warmContext.newPage();
      warmPage.on("console", (message) => {
        if (message.type() === "error") {
          const text = message.text();
          consoleErrors.push(text);
          if (!isExpectedConsoleNoise(text)) {
            blockingConsoleErrors.push(text);
          }
        }
      });
      warmPage.on("pageerror", (error) => pageErrors.push(String(error)));
      try {
        for (const route of ROUTES) {
          await warmPage.goto(`${webUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await waitForRouteReady(warmPage, route);
          for (let run = 0; run < SAMPLE_RUNS; run += 1) {
            warmSamples[route].push(await measureRoute(warmPage, webUrl, route));
          }
        }
      } finally {
        await warmContext.close();
      }

      const cold = summarizeSamples(coldSamples);
      const warm = summarizeSamples(warmSamples);
      const status = deriveStatus(cold, warm);
      const generatedAt = new Date().toISOString();
      const result = {
        status,
        generatedAt,
        routes: ROUTES,
        sampleRuns: SAMPLE_RUNS,
        thresholds: {
          routeReadyWarningMs: WARNING_MS,
          routeReadyFailMs: FAIL_MS,
        },
        cold,
        warm,
        consoleErrors,
        blockingConsoleErrors,
        pageErrors,
        runtime: {
          accountUsername: account.username,
          apiUrl,
          authMode: runtime.authMode,
          authenticated: true,
          isolated: runtime.isolated,
          runDir: runtime.runDir,
          webUrl,
        },
      };

      assert(pageErrors.length === 0, `pageErrors=${JSON.stringify(pageErrors)}`);
      assert(blockingConsoleErrors.length === 0, `blockingConsoleErrors=${JSON.stringify(blockingConsoleErrors)}`);

      const resultWithArtifact = withStandardArtifact(result);
      console.log(JSON.stringify(result, null, 2));
      await writeFile(OUTPUT_JSON, `${JSON.stringify(resultWithArtifact, null, 2)}\n`, "utf8");
      await appendFile(HISTORY_JSONL, `${JSON.stringify(resultWithArtifact)}\n`, "utf8");

      if (status === "fail") {
        throw new Error(`Browser route-ready p95 exceeded fail threshold ${FAIL_MS}ms: cold=${cold.overallP95Ms}ms warm=${warm.overallP95Ms}ms`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
