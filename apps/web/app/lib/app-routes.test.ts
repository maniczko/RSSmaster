import { describe, expect, it } from "vitest";
import {
  buildBrowserPath,
  buildAppHref,
  parseMagazineRouteSearch,
  parseAppPath,
  parseLegacyQueryPath,
  parseReadRouteSearch,
  resolveReadRouteBootState,
  shouldHoldForPendingRouteRestore,
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
        mode: "hidden",
      }),
    ).toBe("/read/archive?scope=all&sort=oldest&q=money.pl&item=itm_123&surface=article&mode=hidden");
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

  it("parses and builds the magazines section route", () => {
    expect(parseAppPath("/magazines")).toEqual({
      section: "magazines",
      libraryView: "inbox",
    });
    expect(buildAppHref({ section: "magazines" })).toBe("/magazines");
    expect(buildAppHref({ section: "magazines", issue: "dig_123" })).toBe("/magazines?issue=dig_123");
    expect(parseMagazineRouteSearch("?issue=%20dig_123%20")).toEqual({ issue: "dig_123" });
  });

  it("keeps magazine issue params separate from reader params", () => {
    expect(
      buildAppHref({
        section: "magazines",
        scope: "all",
        sort: "oldest",
        q: "money.pl",
        item: "itm_123",
        surface: "article",
        issue: "dig_456",
      }),
    ).toBe("/magazines?issue=dig_456");
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

  it("parses canonical reader query params without leaking invalid values", () => {
    expect(parseReadRouteSearch("?view=unknown&scope=all&sort=oldest&q=money.pl&item=%20itm_123%20&surface=article&mode=hidden")).toEqual({
      legacyLibraryView: undefined,
      scope: "all",
      sort: "oldest",
      q: "money.pl",
      item: "itm_123",
      surface: "article",
      mode: "hidden",
    });
  });

  it("builds the current browser path from location-like input", () => {
    expect(buildBrowserPath({ pathname: "/read/inbox", search: "?scope=all" })).toBe("/read/inbox?scope=all");
  });

  it("holds route sync while continuity restore has not reached its target URL", () => {
    expect(
      shouldHoldForPendingRouteRestore({
        currentSection: "read",
        currentUrl: "/read/inbox",
        pending: {
          href: "/read/saved?item=itm_123",
          section: "read",
        },
      }),
    ).toBe(true);

    expect(
      shouldHoldForPendingRouteRestore({
        currentSection: "read",
        currentUrl: "/read/saved?item=itm_123",
        pending: {
          href: "/read/saved?item=itm_123",
          section: "read",
        },
      }),
    ).toBe(false);
  });

  it("resolves boot state from stored continuity plus canonical read URL", () => {
    expect(
      resolveReadRouteBootState({
        pathname: "/read/saved",
        search: "?scope=all&sort=oldest&q=money.pl&item=itm_123&surface=article",
        section: "discover",
        libraryView: "inbox",
        activeItemId: null,
        readingItemId: null,
        itemSearch: "stored",
        readSurface: "browse",
      }),
    ).toEqual({
      activeItemId: "itm_123",
      itemSearch: "money.pl",
      libraryView: "saved",
      readingItemId: "itm_123",
      readSurface: "article",
      scope: "all",
      section: "read",
      sort: "oldest",
    });
  });

  it("lets legacy root view query override stored non-read section", () => {
    expect(
      resolveReadRouteBootState({
        pathname: "/",
        search: "?view=digest&scope=unread",
        section: "settings",
        libraryView: "saved",
        activeItemId: null,
        readingItemId: null,
        itemSearch: "",
        readSurface: "browse",
      }),
    ).toMatchObject({
      libraryView: "digest",
      scope: "unread",
      section: "read",
    });
  });
});
