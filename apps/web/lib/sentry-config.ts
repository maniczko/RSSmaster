type WebSentryConfig = {
  dsn: string | null;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
  release: string | undefined;
};

function normalizeOptionalText(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  const resolved = value ?? String(fallback);
  const parsed = Number.parseFloat(resolved);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1, received "${resolved}".`);
  }
  return parsed;
}

export function resolveWebSentryConfig(env: NodeJS.ProcessEnv = process.env): WebSentryConfig {
  const dsn = normalizeOptionalText(env.NEXT_PUBLIC_SENTRY_DSN);
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: env.RSSMASTER_ENV ?? env.NODE_ENV ?? "development",
    tracesSampleRate: parseSampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, env.NODE_ENV === "development" ? 1 : 0.1),
    release: normalizeOptionalText(env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? env.VERCEL_GIT_COMMIT_SHA) ?? undefined,
  };
}
