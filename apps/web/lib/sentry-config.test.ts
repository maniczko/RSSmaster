import { describe, expect, it } from "vitest";
import { resolveWebSentryConfig } from "@/lib/sentry-config";

describe("resolveWebSentryConfig", () => {
  it("disables sentry when no dsn is configured", () => {
    const config = resolveWebSentryConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_SENTRY_DSN: "",
    });

    expect(config.enabled).toBe(false);
    expect(config.dsn).toBeNull();
    expect(config.tracesSampleRate).toBe(1);
  });

  it("returns enabled config when dsn is present", () => {
    const config = resolveWebSentryConfig({
      NODE_ENV: "production",
      RSSMASTER_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.25",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://public@example.ingest.sentry.io/1");
    expect(config.environment).toBe("production");
    expect(config.tracesSampleRate).toBe(0.25);
    expect(config.release).toBe("abc123");
  });

  it("rejects invalid sample rates", () => {
    expect(() =>
      resolveWebSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "2",
      }),
    ).toThrow("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE");
  });
});
