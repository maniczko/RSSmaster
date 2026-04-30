import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_WAIT_TIMEOUT_MS = 120000;
const DEFAULT_COMMAND_TIMEOUT_MS = Number.parseInt(process.env.RSSMASTER_RUNTIME_COMMAND_TIMEOUT_MS ?? "300000", 10);

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === "string") {
    throw new Error("Nie udało się znaleźć wolnego portu.");
  }
  return address.port;
}

async function readJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.json();
}

async function waitForJsonHealth(name, url, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
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

function startProcess({ args, command, env, label, logDir, logPrefix }) {
  const logPath = path.join(logDir, `${logPrefix}-${label}.log`);
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
    logStream.write(`\n[${logPrefix}] ${label} exited with code ${code}\n`);
    logStream.end();
  });
  return { child, label, logPath };
}

async function runLoggedCommand({ args, command, env, label, logDir, logPrefix, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS }) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const processInfo = startProcess({ args, command, env, label, logDir, logPrefix });
    const exitCode = await new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        await stopProcess(processInfo);
        resolve(124);
      }, timeoutMs);

      processInfo.child.once("exit", (code) => {
        clearTimeout(timeout);
        resolve(code ?? 0);
      });
      processInfo.child.once("error", () => {
        clearTimeout(timeout);
        resolve(1);
      });
    });
    if (exitCode === 0) {
      return;
    }

    const logText = await readFile(processInfo.logPath, "utf8").catch(() => "");
    const buildLockActive = logText.includes("Another next build process is already running");
    const timedOut = exitCode === 124;
    if (timedOut) {
      throw new Error(`${label} timed out after ${timeoutMs}ms; see ${processInfo.logPath}`);
    }
    if (!buildLockActive || attempt === 3) {
      throw new Error(`${label} failed with exit code ${exitCode}; see ${processInfo.logPath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
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

async function inspectRuntimeAuth({ apiUrl, forceExistingRuntime }) {
  if (forceExistingRuntime) {
    return {
      authMode: "forced-existing-runtime",
      session: null,
      useIsolatedRuntime: false,
    };
  }

  try {
    const session = await readJson(`${apiUrl}/api/v1/auth/session`);
    if (session?.auth_required && !session?.session) {
      return {
        authMode: "isolated-because-existing-runtime-requires-auth",
        session,
        useIsolatedRuntime: true,
      };
    }
    return {
      authMode: session?.auth_required ? "existing-authenticated-runtime" : "existing-open-runtime",
      session,
      useIsolatedRuntime: false,
    };
  } catch {
    return {
      authMode: "isolated-because-existing-runtime-session-unknown",
      session: null,
      useIsolatedRuntime: true,
    };
  }
}

export async function prepareSmokeRuntime({
  apiUrl,
  forceExistingRuntime = false,
  label,
  outputDir,
  requireAuthenticated = false,
  webUrl,
}) {
  const normalizedApiUrl = apiUrl.replace(/\/$/, "");
  const normalizedWebUrl = webUrl.replace(/\/$/, "");
  const authProbe = await inspectRuntimeAuth({
    apiUrl: normalizedApiUrl,
    forceExistingRuntime,
  });
  const useIsolatedForAuthBaseline = requireAuthenticated && !forceExistingRuntime;

  if (!authProbe.useIsolatedRuntime && !useIsolatedForAuthBaseline) {
    return {
      apiUrl: normalizedApiUrl,
      authMode: authProbe.authMode,
      authProbe: authProbe.session,
      close: async () => {},
      databasePath: null,
      accountsDatabasePath: null,
      accountsWorkspaceDir: null,
      isolated: false,
      runDir: null,
      webUrl: normalizedWebUrl,
    };
  }

  const runId = `run-${Date.now()}`;
  const runDir = path.join(outputDir, `${label}-runtime`, runId);
  const dataDir = path.join(runDir, "data");
  const workspaceDir = path.join(dataDir, "accounts");
  await mkdir(workspaceDir, { recursive: true });

  const apiPort = await findFreePort();
  const webPort = await findFreePort();
  const isolatedApiUrl = `http://127.0.0.1:${apiPort}`;
  const isolatedWebUrl = `http://127.0.0.1:${webPort}`;
  const databasePath = path.join(dataDir, "workspace.db");
  const accountsDatabasePath = path.join(dataDir, "accounts.db");
  const env = {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL: isolatedApiUrl,
    RSSMASTER_API_PORT: String(apiPort),
    RSSMASTER_API_URL: isolatedApiUrl,
    RSSMASTER_DATABASE_PATH: databasePath,
    RSSMASTER_WEB_PORT: String(webPort),
    RSSMASTER_WEB_URL: isolatedWebUrl,
    RSSMASTER_ACCOUNTS_DATABASE_PATH: accountsDatabasePath,
    RSSMASTER_ACCOUNTS_WORKSPACE_DIR: workspaceDir,
    RSSMASTER_ACCOUNTS_COOKIE_NAME: `rssmaster_${label}_${runId.replace(/[^a-z0-9]/gi, "_")}`,
  };

  await runLoggedCommand({
    args: [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "build"],
    command: "node",
    env,
    label: "web-build",
    logDir: runDir,
    logPrefix: label,
  });

  const apiProcess = startProcess({
    args: ["-m", "uvicorn", "app.main:app", "--app-dir", path.join(ROOT_DIR, "apps", "api"), "--host", "127.0.0.1", "--port", String(apiPort)],
    command: pythonExecutable(),
    env,
    label: "api",
    logDir: runDir,
    logPrefix: label,
  });
  const webProcess = startProcess({
    args: [path.join(ROOT_DIR, "scripts", "run_web.mjs"), "start"],
    command: "node",
    env,
    label: "web",
    logDir: runDir,
    logPrefix: label,
  });

  try {
    await waitForJsonHealth("api", `${isolatedApiUrl}/health`);
    await waitForJsonHealth("web", `${isolatedWebUrl}/api/health`);
  } catch (error) {
    await stopProcess(webProcess);
    await stopProcess(apiProcess);
    throw error;
  }

  return {
    apiUrl: isolatedApiUrl,
    authMode: requireAuthenticated ? "isolated-authenticated-baseline-required" : "isolated-no-account-runtime",
    authProbe: authProbe.session,
    close: async () => {
      await stopProcess(webProcess);
      await stopProcess(apiProcess);
    },
    databasePath,
    accountsDatabasePath,
    accountsWorkspaceDir: workspaceDir,
    isolated: true,
    runDir,
    webUrl: isolatedWebUrl,
  };
}
