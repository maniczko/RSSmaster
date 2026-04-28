import { describe, expect, it } from "vitest";
import {
  buildAppHref,
  parseAppPath,
  parseLegacyQueryPath,
} from "@/app/lib/app-routes";

describe("app route helpers", () => {
  it("parses read paths with explicit library view", () => {
    expect(parseAppPath("/read/saved")).toEqual({
      section: "read",
      libraryView: "saved",
    });
  });

  it("falls back to inbox for unknown read paths", () => {
    expect(parseAppPath("/read/unknown")).toEqual({
      section: "read",
      libraryView: "inbox",
    });
  });

  it("builds hrefs with canonical read paths and query params", () => {
    expect(
      buildAppHref({
        section: "read",
        libraryView: "archive",
        scope: "all",
        sort: "oldest",
        q: "money.pl",
        item: "itm_123",
        surface: "article",
      }),
    ).toBe("/read/archive?scope=all&sort=oldest&q=money.pl&item=itm_123&surface=article");
  });

  it("does not leak reader query params into non-read sections", () => {
    expect(
      buildAppHref({
        section: "discover",
        scope: "all",
        sort: "oldest",
        q: "money.pl",
        item: "itm_123",
        surface: "article",
      }),
    ).toBe("/discover");
  });

  it("parses legacy root query params into a read route", () => {
    expect(parseLegacyQueryPath("?view=digest&scope=unread&sort=newest&q=ai&surface=article")).toEqual({
      section: "read",
      libraryView: "digest",
      scope: "unread",
      sort: "newest",
      q: "ai",
      item: undefined,
      surface: "article",
    });
  });
});
