import { describe, expect, it } from "vitest";

import {
  getPayloadMessage,
  isAuthRequiredPayload,
  isErrorEnvelope,
  isUnsupportedEndpoint,
  readResponsePayload,
} from "./api-client";

describe("api client helpers", () => {
  it("reads JSON, empty and plain-text response payloads", async () => {
    await expect(readResponsePayload(new Response(JSON.stringify({ ok: true })))).resolves.toEqual({ ok: true });
    await expect(readResponsePayload(new Response(""))).resolves.toBeNull();
    await expect(readResponsePayload(new Response("not-json"))).resolves.toBe("not-json");
  });

  it("normalizes API and fallback error messages", () => {
    expect(getPayloadMessage({ error: { message: "API failed" } }, "fallback")).toBe("API failed");
    expect(getPayloadMessage({ detail: "Fallback failed" }, "fallback")).toBe("Fallback failed");
    expect(getPayloadMessage({ error: {} }, "fallback")).toBe("fallback");
  });

  it("detects auth-required envelopes and unsupported endpoints", () => {
    const payload = { error: { code: "auth_required" } };

    expect(isErrorEnvelope(payload)).toBe(true);
    expect(isAuthRequiredPayload(payload)).toBe(true);
    expect(isUnsupportedEndpoint(404)).toBe(true);
    expect(isUnsupportedEndpoint(500)).toBe(false);
  });
});
