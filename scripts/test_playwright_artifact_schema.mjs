import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachPlaywrightArtifact,
  buildPlaywrightArtifact,
  buildVisualSnapshot,
  collectScreenshotEvidence,
  validatePlaywrightArtifact,
} from "./lib/playwright-artifact-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TMP_DIR = path.join(ROOT_DIR, "output", "playwright", "artifact-schema-test");
const SCREENSHOT_PATH = path.join(TMP_DIR, "sample.png");

async function main() {
  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(SCREENSHOT_PATH, Buffer.from("fake-png-content"));

  const startedAt = new Date(Date.now() - 250);
  const screenshots = collectScreenshotEvidence([SCREENSHOT_PATH], {
    rootDir: ROOT_DIR,
    runStartedAt: startedAt,
  });

  assert.equal(screenshots.length, 1);
  assert.equal(screenshots[0].exists, true);
  assert.equal(screenshots[0].fresh, true);
  assert.ok(screenshots[0].sha256);

  const visualSnapshot = buildVisualSnapshot(screenshots);
  assert.equal(visualSnapshot.baseline_status, "not_configured");
  assert.equal(visualSnapshot.screenshot_count, 1);

  const matchedBaseline = buildVisualSnapshot(screenshots, {
    baseline: { screenshots: visualSnapshot.screenshots },
  });
  assert.equal(matchedBaseline.baseline_status, "matched");
  assert.equal(matchedBaseline.changed_count, 0);

  const changedBaseline = buildVisualSnapshot(screenshots, {
    baseline: {
      screenshots: [
        {
          ...visualSnapshot.screenshots[0],
          sha256: "different",
        },
      ],
    },
  });
  assert.equal(changedBaseline.baseline_status, "changed");
  assert.equal(changedBaseline.changed_count, 1);

  const artifact = buildPlaywrightArtifact({
    checkName: "check:test",
    status: "passed",
    startedAt,
    targetUrls: {
      webUrl: "http://127.0.0.1:3000",
      apiUrl: "http://127.0.0.1:8000",
    },
    runtime: {
      isolated: true,
      authMode: "isolated-no-account-runtime",
    },
    routes: [
      {
        id: "read-inbox",
        route: "/read/inbox",
        viewport: "desktop",
        ready: true,
        status: "passed",
        screenshot: SCREENSHOT_PATH,
        keyboardReachable: true,
      },
    ],
    actions: [{ id: "nav-digest", label: "Digest", status: "passed" }],
    screenshots,
    errors: { console: [], page: [], http: [], harness: [] },
    visualRegression: visualSnapshot,
  });

  assert.deepEqual(validatePlaywrightArtifact(artifact), []);
  assert.equal(artifact.schema_version, 1);
  assert.equal(artifact.auth_mode, "isolated-no-account-runtime");

  const wrapped = attachPlaywrightArtifact(
    { status: "passed" },
    {
      checkName: "check:test",
      status: "passed",
      startedAt,
      screenshots,
      targetUrls: {},
    },
  );
  assert.equal(wrapped.artifactSchemaValidation.valid, true);

  const invalidIssues = validatePlaywrightArtifact({
    schema_version: 999,
    status: "unknown",
  });
  assert.ok(invalidIssues.length >= 3);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
