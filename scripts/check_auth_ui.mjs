import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "playwright", "auth-smoke");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "auth-smoke.json");
const OUTPUT_SCREENSHOT = path.join(OUTPUT_DIR, "auth-smoke.png");
const WAIT_TIMEOUT_MS = 120000;

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

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.json();
}

async function responseJsonOrNull(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
    logStream.write(`\n[check:auth] ${label} exited with code ${code}\n`);
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

async function fillAuthForm(page, { username, displayName, password }) {
  await page.getByLabel(/Nazwa konta/i).fill(username);
  const displayNameInput = page.getByLabel(/Nazwa (wyswietlana|wyświetlana)/i);
  if ((await displayNameInput.count()) > 0 && displayName !== undefined) {
    await displayNameInput.fill(displayName);
  }
  await page.getByLabel(/Haslo|Hasło/i).fill(password);
}

async function waitForAppShell(page) {
  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText ?? "";
      return bodyText.includes("Sesja operatora") || Boolean(document.querySelector(".app-shell"));
    },
    undefined,
    { timeout: 45000 },
  );
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
  const isolatedDatabasePath = path.join(dataDir, "legacy-workspace.db");
  const isolatedAccountsPath = path.join(dataDir, "rssmaster-accounts.db");
  const username = `authqa${Date.now()}`;
  const password = "AuthSmoke-12345";
  const wrongPassword = "WrongSmoke-12345";
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
    RSSMASTER_ACCOUNTS_COOKIE_NAME: `rssmaster_auth_smoke_${runId.replace(/[^a-z0-9]/gi, "_")}`,
  };
  const webCommand = "start";

  const results = {
    status: "running",
    runDir,
    webUrl,
    apiUrl,
    webCommand,
    isolatedPaths: {
      databasePath: isolatedDatabasePath,
      accountsDatabasePath: isolatedAccountsPath,
      accountsWorkspaceDir: workspaceDir,
    },
    noAccountSession: false,
    registerOpenedFromNoAccountMode: false,
    registered: false,
    protectedAppOpenedAfterRegister: false,
    logout: false,
    captureAuthNoticeAfterLogout: false,
    protectedApi401AfterLogout: false,
    invalidPasswordFeedback: false,
    invalidPasswordStatus: null,
    login: false,
    protectedAppOpenedAfterLogin: false,
    readInboxOpenedAfterLogin: false,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  };

  await runLoggedCommand("web build", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "build"], env, "web-build.log");

  const apiProcess = startProcess(
    "api",
    pythonExecutable(),
    ["-m", "uvicorn", "app.main:app", "--app-dir", path.join(ROOT_DIR, "apps", "api"), "--host", "127.0.0.1", "--port", String(apiPort)],
    env,
    "api.log",
  );
  const webProcess = startProcess("web", "node", [path.join(ROOT_DIR, "scripts", "run_web.mjs"), webCommand], env, "web.log");
  let browser = null;
  let page = null;

  try {
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
    assert(results.noAccountSession, `No-account session payload unexpected: ${JSON.stringify(initialSession)}`);

    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        results.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => results.pageErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      const url = request.url();
      const failure = request.failure()?.errorText ?? "unknown";
      if (!url.includes("/api/v1/auth/login") && failure !== "net::ERR_ABORTED") {
        results.failedRequests.push({ url, failure });
      }
    });

    await page.goto(`${webUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForAppShell(page);
    await page.getByRole("button", { name: /Utw[oó]rz pierwsze konto/i }).click();
    await page.getByText(/Utw[oó]rz pierwsze konto RSSmaster/i).waitFor({ timeout: 20000 });
    results.registerOpenedFromNoAccountMode = true;

    await fillAuthForm(page, { username, displayName: "Auth Smoke Operator", password });
    const [registerResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/v1/auth/register") && response.request().method() === "POST",
        { timeout: 30000 },
      ),
      page.getByRole("button", { name: /Utw[oó]rz konto i otw[oó]rz bibliotek[eę]/i }).click(),
    ]);
    const registerPayload = await responseJsonOrNull(registerResponse);
    results.registered = registerResponse.ok() && registerPayload?.session?.account?.username === username;
    if (!results.registered && registerResponse.ok()) {
      const sessionPayload = await page.evaluate(async (apiBaseUrl) => {
        const response = await fetch(`${apiBaseUrl}/api/v1/auth/session`, { credentials: "include" });
        return response.json();
      }, apiUrl);
      results.registered = sessionPayload?.session?.account?.username === username;
    }
    assert(results.registered, `Register failed: ${registerResponse.status()} ${JSON.stringify(registerPayload)}`);
    await waitForAppShell(page);
    results.protectedAppOpenedAfterRegister = await page.locator("text=Sesja operatora").count() > 0;

    const [logoutResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/v1/auth/logout") && response.request().method() === "POST",
        { timeout: 30000 },
      ),
      page.getByRole("button", { name: /^Wyloguj$/i }).first().click(),
    ]);
    results.logout = logoutResponse.ok();
    assert(results.logout, `Logout failed: ${logoutResponse.status()}`);
    await page.getByText(/Zaloguj si[eę] do swojej biblioteki/i).waitFor({ timeout: 30000 });

    await page.goto(`${webUrl}/capture`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByText(/Logowanie jest wymagane/i).waitFor({ timeout: 30000 });
    await page.getByRole("link", { name: /Przejd[zź] do logowania/i }).waitFor({ timeout: 15000 });
    results.captureAuthNoticeAfterLogout = true;

    const apiCookiesAfterLogout = await page.context().cookies(apiUrl);
    const protectedApiResponse = await fetch(`${apiUrl}/api/v1/items`, {
      headers: {
        Cookie: apiCookiesAfterLogout.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      },
    });
    const protectedResponse = {
      status: protectedApiResponse.status,
      payload: await protectedApiResponse.json().catch(() => null),
    };
    results.protectedApi401AfterLogout =
      protectedResponse.status === 401 && protectedResponse.payload?.error?.code === "auth_required";
    assert(results.protectedApi401AfterLogout, `Protected API did not return auth_required after logout: ${JSON.stringify(protectedResponse)}`);

    await page.goto(`${webUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByText(/Zaloguj si[eę] do swojej biblioteki/i).waitFor({ timeout: 30000 });
    await fillAuthForm(page, { username, password: wrongPassword });
    const [invalidLoginResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
        { timeout: 30000 },
      ),
      page.getByRole("button", { name: /^Zaloguj$/i }).click(),
    ]);
    results.invalidPasswordStatus = invalidLoginResponse.status();
    await page.getByText(/Nieprawid[lł]owy login lub has[lł]o/i).waitFor({ timeout: 15000 });
    results.invalidPasswordFeedback = invalidLoginResponse.status() === 401;
    assert(results.invalidPasswordFeedback, `Invalid password did not return 401: ${invalidLoginResponse.status()}`);

    await fillAuthForm(page, { username, password });
    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
        { timeout: 30000 },
      ),
      page.getByRole("button", { name: /^Zaloguj$/i }).click(),
    ]);
    const loginPayload = await responseJsonOrNull(loginResponse);
    results.login = loginResponse.ok() && loginPayload?.session?.account?.username === username;
    if (!results.login && loginResponse.ok()) {
      const sessionPayload = await page.evaluate(async (apiBaseUrl) => {
        const response = await fetch(`${apiBaseUrl}/api/v1/auth/session`, { credentials: "include" });
        return response.json();
      }, apiUrl);
      results.login = sessionPayload?.session?.account?.username === username;
    }
    assert(results.login, `Login failed: ${loginResponse.status()} ${JSON.stringify(loginPayload)}`);
    await waitForAppShell(page);
    results.protectedAppOpenedAfterLogin = await page.locator(`text=Auth Smoke Operator`).count() > 0;

    await page.goto(`${webUrl}/read/inbox?scope=all&sort=newest`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForAppShell(page);
    results.readInboxOpenedAfterLogin =
      page.url().includes("/read/inbox") && (await page.locator(".app-shell").count()) > 0;

    await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true });

    assert(results.protectedAppOpenedAfterRegister, "Protected app shell did not open after register.");
    assert(results.protectedAppOpenedAfterLogin, "Protected app shell did not open after login.");
    assert(results.captureAuthNoticeAfterLogout, "Capture did not show auth-required notice after logout.");
    assert(results.readInboxOpenedAfterLogin, "Read inbox did not open after login.");
    const unexpectedConsoleErrors = results.consoleErrors.filter(
      (message) => !message.includes("401") && !message.includes("Unauthorized"),
    );
    assert(results.pageErrors.length === 0, `pageErrors=${JSON.stringify(results.pageErrors)}`);
    assert(unexpectedConsoleErrors.length === 0, `consoleErrors=${JSON.stringify(unexpectedConsoleErrors)}`);
    assert(results.failedRequests.length === 0, `failedRequests=${JSON.stringify(results.failedRequests)}`);

    results.status = "passed";
    console.log("[check:auth] PASS");
    console.log(`[check:auth] evidence: ${OUTPUT_JSON}`);
  } catch (error) {
    results.status = "failed";
    results.error = error instanceof Error ? error.stack ?? error.message : String(error);
    if (page) {
      results.failureUrl = page.url();
      results.failureBodyText = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
      await page.screenshot({ path: OUTPUT_SCREENSHOT, fullPage: true }).catch(() => {});
    }
    console.error(`[check:auth] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(webProcess);
    await stopProcess(apiProcess);
    await writeFile(OUTPUT_JSON, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  }
}

main();
