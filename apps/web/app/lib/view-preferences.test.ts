import { describe, expect, it } from "vitest";

import {
  defaultViewPreferences,
  getReaderViewControlsFromPreference,
  normalizeViewPreference,
  normalizeViewPreferences,
  patchViewPreferenceMap,
  shouldApplyReaderViewPreference,
  type ReaderViewControlSnapshot,
  type ViewPreferenceSnapshot,
} from "./view-preferences";

describe("view preference helpers", () => {
  it("maps stored preferences into reader controls", () => {
    const preference: ViewPreferenceSnapshot = {
      sort: "oldest",
      density: "compact",
      showReadItems: true,
    };

    expect(getReaderViewControlsFromPreference(preference)).toEqual({
      itemSortMode: "oldest",
      isCompactList: true,
      showReadItems: true,
    });
  });

  it("skips applying preferences when controls already match", () => {
    const preference: ViewPreferenceSnapshot = {
      sort: "newest",
      density: "comfortable",
      showReadItems: false,
    };
    const current: ReaderViewControlSnapshot = {
      itemSortMode: "newest",
      isCompactList: false,
      showReadItems: false,
    };

    expect(shouldApplyReaderViewPreference(preference, current)).toBe(false);
  });

  it("requests an update when at least one control differs", () => {
    const preference: ViewPreferenceSnapshot = {
      sort: "oldest",
      density: "compact",
      showReadItems: true,
    };
    const current: ReaderViewControlSnapshot = {
      itemSortMode: "newest",
      isCompactList: false,
      showReadItems: true,
    };

    expect(shouldApplyReaderViewPreference(preference, current)).toBe(true);
  });

  it("normalizes malformed stored view preferences with per-view defaults", () => {
    expect(
      normalizeViewPreference(
        {
          sort: "sideways",
          density: "compact",
          showReadItems: "yes",
        },
        defaultViewPreferences.inbox,
      ),
    ).toEqual({
      ...defaultViewPreferences.inbox,
      density: "compact",
    });
  });

  it("preserves legacy compact preference across all library views", () => {
    expect(normalizeViewPreferences(null, { legacyCompact: true }).archive).toEqual({
      ...defaultViewPreferences.archive,
      density: "compact",
    });
    expect(normalizeViewPreferences(null, { legacyCompact: true }).inbox.density).toBe("compact");
  });

  it("patches one view preference without mutating the other views", () => {
    const patched = patchViewPreferenceMap(defaultViewPreferences, "saved", {
      showReadItems: false,
    });

    expect(patched.saved.showReadItems).toBe(false);
    expect(patched.inbox).toEqual(defaultViewPreferences.inbox);
  });
});
