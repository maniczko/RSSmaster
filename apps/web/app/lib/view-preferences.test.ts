import { describe, expect, it } from "vitest";

import {
  getReaderViewControlsFromPreference,
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
});
