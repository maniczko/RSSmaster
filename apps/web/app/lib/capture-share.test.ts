import { describe, expect, it } from "vitest";

import { buildCaptureBookmarklet, buildCaptureHref, normalizeCaptureQueryValue } from "@/app/lib/capture-share";

describe("capture-share", () => {
  it("normalizes capture query values from strings and arrays", () => {
    expect(normalizeCaptureQueryValue(" https://example.com ")).toBe("https://example.com");
    expect(normalizeCaptureQueryValue(["  abc  ", "ignored"])).toBe("abc");
    expect(normalizeCaptureQueryValue(undefined)).toBe("");
  });

  it("builds a capture href with only populated values", () => {
    expect(buildCaptureHref({ url: "https://example.com", title: "Example", note: "" })).toBe(
      "/capture?url=https%3A%2F%2Fexample.com&title=Example",
    );
    expect(buildCaptureHref({})).toBe("/capture");
  });

  it("builds a bookmarklet that points to the capture route", () => {
    const bookmarklet = buildCaptureBookmarklet("http://127.0.0.1:3000/");
    expect(bookmarklet.startsWith("javascript:")).toBe(true);
    expect(bookmarklet).toContain("http://127.0.0.1:3000/capture?url=");
    expect(bookmarklet).toContain("document.title");
  });
});
