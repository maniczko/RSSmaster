import fs from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const appDir = path.join(rootDir, "apps", "web");
const envFile = path.join(rootDir, ".env");
const command = process.argv[2] ?? "dev";
const outputDir = path.join(rootDir, "output");
const buildLockPath = path.join(outputDir, "web-build.lock");
const buildLockPollMs = 1000;
const buildLockStaleMs = positiveInt(process.env.RSSMASTER_WEB_BUILD_LOCK_STALE_MS, "RSSMASTER_WEB_BUILD_LOCK_STALE_MS", 10 * 60 * 1000);
const buildLockTimeoutMs = positiveInt(process.env.RSSMASTER_WEB_BUILD_LOCK_TIMEOUT_MS, "RSSMASTER_WEB_BUILD_LOCK_TIMEOUT_MS", 5 * 60 * 1000);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function positiveInt(rawValue, label, fallback) {
  const resolved = rawValue ?? fallback;
  const parsed = Number.parseInt(String(resolved), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer. Received "${resolved}".`);
  }

  return parsed;
}

function validateHttpUrl(rawValue, label, fallback) {
  const resolved = rawValue ?? fallback;
  const parsed = new URL(resolved);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  return parsed.toString().replace(/\/$/, "");
}

function quoteForCmd(value) {
  if (!/[ \t"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeStaleBuildLock(startedAt) {
  try {
    const lockStats = await stat(buildLockPath);
    const ageMs = Date.now() - lockStats.mtimeMs;
    if (ageMs < buildLockStaleMs) {
      return false;
    }
    await rm(buildLockPath, { force: true });
    console.warn(
      `[run_web] removed stale web build lock after ${Math.round(ageMs)}ms; waited ${Date.now() - startedAt}ms`,
    );
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

async function acquireBuildLock() {
  if (command !== "build") {
    return async () => {};
  }

  await mkdir(outputDir, { recursive: true });
  const startedAt = Date.now();

  while (Date.now() - startedAt < buildLockTimeoutMs) {
    try {
      const handle = await open(buildLockPath, "wx");
      await handle.writeFile(
        JSON.stringify({
          acquiredAt: new Date().toISOString(),
          pid: process.pid,
        }),
        "utf8",
      );
      await handle.close();
      return async () => {
        await rm(buildLockPath, { force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      await removeStaleBuildLock(startedAt);
      await sleep(buildLockPollMs);
    }
  }

  throw new Error(
    `harness_build_lock: timed out waiting ${buildLockTimeoutMs}ms for ${buildLockPath}. Another Next build is still running.`,
  );
}

const fileEnv = readEnvFile(envFile);
const mergedEnv = { ...fileEnv, ...process.env };

const webPort = positiveInt(mergedEnv.RSSMASTER_WEB_PORT, "RSSMASTER_WEB_PORT", 3000);
positiveInt(mergedEnv.RSSMASTER_API_PORT, "RSSMASTER_API_PORT", 8000);
validateHttpUrl(mergedEnv.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000");

const nextBinary = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");

const argsByCommand = {
  build: ["build"],
  dev: ["dev", "--hostname", "127.0.0.1", "--port", String(webPort)],
  start: ["start", "--hostname", "127.0.0.1", "--port", String(webPort)],
};

if (!(command in argsByCommand)) {
  throw new Error(`Unsupported web command "${command}". Expected one of: ${Object.keys(argsByCommand).join(", ")}.`);
}

const spawnTarget = process.platform === "win32" ? "cmd.exe" : nextBinary;
const spawnArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", [quoteForCmd(nextBinary), ...argsByCommand[command].map(quoteForCmd)].join(" ")]
    : argsByCommand[command];

const releaseBuildLock = await acquireBuildLock();
const child = spawn(spawnTarget, spawnArgs, {
  cwd: appDir,
  env: {
    ...process.env,
    ...fileEnv,
    NEXT_PUBLIC_API_BASE_URL: mergedEnv.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000",
    RSSMASTER_API_PORT: String(mergedEnv.RSSMASTER_API_PORT ?? 8000),
    RSSMASTER_WEB_PORT: String(webPort),
  },
  stdio: "inherit",
});

child.on("exit", async (code) => {
  await releaseBuildLock();
  process.exit(code ?? 0);
});

child.on("error", async (error) => {
  await releaseBuildLock();
  throw error;
});
