import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const PLAYWRIGHT_ARTIFACT_SCHEMA_VERSION = 1;

const VALID_STATUSES = new Set(["passed", "failed", "timeout", "skipped", "running"]);

function asDate(value, fallback = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(status) {
  return VALID_STATUSES.has(status) ? status : "failed";
}

function toSnakeRuntime(runtime) {
  if (!runtime) {
    return {
      isolated: null,
      auth_mode: "unknown",
      run_dir: null,
    };
  }

  return {
    isolated: typeof runtime.isolated === "boolean" ? runtime.isolated : null,
    auth_mode: runtime.authMode ?? runtime.auth_mode ?? "unknown",
    run_dir: runtime.runDir ?? runtime.run_dir ?? null,
    database_path: runtime.databasePath ?? runtime.database_path ?? null,
    accounts_database_path: runtime.accountsDatabasePath ?? runtime.accounts_database_path ?? null,
    accounts_workspace_dir: runtime.accountsWorkspaceDir ?? runtime.accounts_workspace_dir ?? null,
  };
}

function normalizeRoute(route) {
  return {
    id: route.id ?? route.route ?? "unknown-route",
    route: route.route ?? route.path ?? null,
    viewport: route.viewport ?? null,
    status: normalizeStatus(route.status ?? (route.ready === false ? "failed" : "passed")),
    final_url: route.finalUrl ?? route.final_url ?? null,
    screenshot: route.screenshot ?? null,
    ready: typeof route.ready === "boolean" ? route.ready : null,
    overflow: typeof route.overflow === "boolean" ? route.overflow : null,
    keyboard_reachable:
      typeof route.keyboardReachable === "boolean"
        ? route.keyboardReachable
        : typeof route.keyboard_reachable === "boolean"
          ? route.keyboard_reachable
          : null,
    semantic_issues: asArray(route.semanticIssues ?? route.semantic_issues),
    console_error_count: Number(route.consoleErrorCount ?? route.console_error_count ?? 0),
    page_error_count: Number(route.pageErrorCount ?? route.page_error_count ?? 0),
    notes: route.notes ?? null,
  };
}

function normalizeAction(action) {
  return {
    id: action.id ?? action.target ?? action.label ?? "unknown-action",
    label: action.label ?? action.target ?? action.id ?? null,
    route: action.route ?? null,
    viewport: action.viewport ?? null,
    status: normalizeStatus(action.status ?? (action.passed === false ? "failed" : "passed")),
    final_url: action.finalUrl ?? action.final_url ?? action.url ?? null,
    screenshot: action.screenshot ?? null,
    notes: action.notes ?? null,
  };
}

function normalizeErrors(errors) {
  return {
    console: asArray(errors?.console),
    page: asArray(errors?.page),
    http: asArray(errors?.http),
    harness: asArray(errors?.harness),
  };
}

function hashFile(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export function collectScreenshotEvidence(paths, { rootDir = process.cwd(), runStartedAt = new Date() } = {}) {
  const startedAt = asDate(runStartedAt);
  return [...new Set(asArray(paths).filter(Boolean))].map((screenshotPath) => {
    const absolutePath = path.resolve(screenshotPath);
    const relativePath = path.relative(rootDir, absolutePath);
    if (!existsSync(absolutePath)) {
      return {
        path: screenshotPath,
        relative_path: relativePath,
        exists: false,
        fresh: false,
        bytes: null,
        modified_at: null,
        sha256: null,
      };
    }

    const stats = statSync(absolutePath);
    return {
      path: screenshotPath,
      relative_path: relativePath,
      exists: true,
      fresh: stats.mtimeMs >= startedAt.getTime() - 1000,
      bytes: stats.size,
      modified_at: stats.mtime.toISOString(),
      sha256: hashFile(absolutePath),
    };
  });
}

export function buildVisualSnapshot(screenshots, { baseline = null, mode = "fingerprint" } = {}) {
  const current = asArray(screenshots)
    .filter((entry) => entry.exists)
    .map((entry) => ({
      relative_path: entry.relative_path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    }));

  const baselineEntries = asArray(baseline?.screenshots);
  const baselineByPath = new Map(baselineEntries.map((entry) => [entry.relative_path, entry]));
  const changed = [];
  const missing = [];

  for (const entry of current) {
    const baselineEntry = baselineByPath.get(entry.relative_path);
    if (!baselineEntry) {
      continue;
    }
    if (baselineEntry.sha256 !== entry.sha256 || baselineEntry.bytes !== entry.bytes) {
      changed.push({
        relative_path: entry.relative_path,
        previous_sha256: baselineEntry.sha256,
        current_sha256: entry.sha256,
        previous_bytes: baselineEntry.bytes,
        current_bytes: entry.bytes,
      });
    }
  }

  for (const entry of baselineEntries) {
    if (!current.some((currentEntry) => currentEntry.relative_path === entry.relative_path)) {
      missing.push(entry.relative_path);
    }
  }

  const baselineStatus = baselineEntries.length === 0 ? "not_configured" : changed.length === 0 && missing.length === 0 ? "matched" : "changed";

  return {
    mode,
    status: baselineStatus === "changed" ? "needs_review" : "passed",
    baseline_status: baselineStatus,
    screenshot_count: current.length,
    changed_count: changed.length,
    missing_count: missing.length,
    changed,
    missing,
    screenshots: current,
  };
}

export function buildPlaywrightArtifact({
  actions = [],
  checkName,
  completedAt = new Date(),
  errors = {},
  metadata = {},
  routes = [],
  runtime = null,
  screenshots = [],
  startedAt,
  status,
  targetUrls = {},
  visualRegression = null,
}) {
  const started = asDate(startedAt);
  const completed = asDate(completedAt);
  const normalizedRuntime = toSnakeRuntime(runtime);
  const normalizedScreenshots = asArray(screenshots);

  return {
    schema_version: PLAYWRIGHT_ARTIFACT_SCHEMA_VERSION,
    check_name: checkName,
    status: normalizeStatus(status),
    started_at: started.toISOString(),
    completed_at: completed.toISOString(),
    duration_ms: Math.max(0, completed.getTime() - started.getTime()),
    target: {
      web_url: targetUrls.webUrl ?? targetUrls.web_url ?? null,
      api_url: targetUrls.apiUrl ?? targetUrls.api_url ?? null,
    },
    auth_mode: normalizedRuntime.auth_mode,
    runtime: normalizedRuntime,
    routes: asArray(routes).map(normalizeRoute),
    actions: asArray(actions).map(normalizeAction),
    screenshots: normalizedScreenshots,
    errors: normalizeErrors(errors),
    visual_regression: visualRegression ?? buildVisualSnapshot(normalizedScreenshots),
    metadata,
  };
}

export function validatePlaywrightArtifact(artifact) {
  const issues = [];

  if (!artifact || typeof artifact !== "object") {
    return ["artifact must be an object"];
  }
  if (artifact.schema_version !== PLAYWRIGHT_ARTIFACT_SCHEMA_VERSION) {
    issues.push(`schema_version must be ${PLAYWRIGHT_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (!artifact.check_name) {
    issues.push("check_name is required");
  }
  if (!VALID_STATUSES.has(artifact.status)) {
    issues.push(`status must be one of ${[...VALID_STATUSES].join(", ")}`);
  }
  if (!artifact.started_at || Number.isNaN(new Date(artifact.started_at).getTime())) {
    issues.push("started_at must be an ISO date");
  }
  if (!artifact.completed_at || Number.isNaN(new Date(artifact.completed_at).getTime())) {
    issues.push("completed_at must be an ISO date");
  }
  if (!artifact.target || typeof artifact.target !== "object") {
    issues.push("target is required");
  }
  if (!Array.isArray(artifact.routes)) {
    issues.push("routes must be an array");
  }
  if (!Array.isArray(artifact.actions)) {
    issues.push("actions must be an array");
  }
  if (!Array.isArray(artifact.screenshots)) {
    issues.push("screenshots must be an array");
  }
  if (!artifact.errors || typeof artifact.errors !== "object") {
    issues.push("errors is required");
  }
  if (!artifact.visual_regression || typeof artifact.visual_regression !== "object") {
    issues.push("visual_regression is required");
  }

  return issues;
}

export function attachPlaywrightArtifact(payload, artifactInput) {
  const artifact = buildPlaywrightArtifact(artifactInput);
  const validationIssues = validatePlaywrightArtifact(artifact);
  return {
    ...payload,
    artifact,
    artifactSchemaValidation: {
      valid: validationIssues.length === 0,
      issues: validationIssues,
    },
  };
}
