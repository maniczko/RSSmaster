type WebRuntimeConfig = {
  apiBaseUrl: string;
  apiPort: number;
  appName: string;
  environment: string;
  sentryDsnConfigured: boolean;
  sentryTracesSampleRate: number;
  webPort: number;
};

type WebStartupDiagnostics = {
  checkedAt: string;
  config: WebRuntimeConfig | null;
  errors: string[];
  valid: boolean;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_WEB_PORT = 3000;
const DEFAULT_API_PORT = 8000;

function parsePositiveInt(rawValue: string | undefined, fallback: number, label: string): number {
  const resolved = rawValue ?? String(fallback);
  const parsed = Number.parseInt(resolved, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, received "${resolved}".`);
  }

  return parsed;
}

function normalizeUrl(rawValue: string): string {
  const parsed = new URL(rawValue);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use http or https.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function parseSampleRate(rawValue: string | undefined, fallback: number): number {
  const resolved = rawValue ?? String(fallback);
  const parsed = Number.parseFloat(resolved);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Sentry sample rate must be between 0 and 1, received "${resolved}".`);
  }

  return parsed;
}

function buildRuntimeConfig(): WebRuntimeConfig {
  return {
    apiBaseUrl: normalizeUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    apiPort: parsePositiveInt(process.env.RSSMASTER_API_PORT, DEFAULT_API_PORT, "RSSMASTER_API_PORT"),
    appName: process.env.RSSMASTER_APP_NAME ?? "rssmaster",
    environment: process.env.RSSMASTER_ENV ?? "development",
    sentryDsnConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()),
    sentryTracesSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    webPort: parsePositiveInt(process.env.RSSMASTER_WEB_PORT, DEFAULT_WEB_PORT, "RSSMASTER_WEB_PORT"),
  };
}

export function getWebStartupDiagnostics(): WebStartupDiagnostics {
  try {
    return {
      checkedAt: new Date().toISOString(),
      config: buildRuntimeConfig(),
      errors: [],
      valid: true,
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      config: null,
      errors: [error instanceof Error ? error.message : "Unknown frontend runtime error."],
      valid: false,
    };
  }
}
