import * as Sentry from "@sentry/nextjs";
import { resolveWebSentryConfig } from "@/lib/sentry-config";

const config = resolveWebSentryConfig();

if (config.enabled && config.dsn) {
  Sentry.init({
    dsn: config.dsn,
    enabled: config.enabled,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate,
    release: config.release,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
