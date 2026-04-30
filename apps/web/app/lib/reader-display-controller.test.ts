import { describe, expect, it } from "vitest";

import {
  isReaderDisplayImageMode,
  isReaderDisplayTextMode,
  isReaderDisplayWidthMode,
  readerDisplayInitialState,
  readerDisplayReducer,
  type ReaderDisplayAction,
  type ReaderDisplayState,
} from "./reader-display-controller";

function reduce(action: ReaderDisplayAction, state: ReaderDisplayState = readerDisplayInitialState) {
  return readerDisplayReducer(state, action);
}

describe("reader display controller reducer", () => {
  it("keeps display defaults centralized", () => {
    expect(readerDisplayInitialState).toEqual({
      isCompactList: false,
      isFocusedMode: false,
      readerImageMode: "safe",
      readerTextMode: "standard",
      readerWidthMode: "comfortable",
    });
  });

  it("restores the complete display state from continuity import", () => {
    expect(
      reduce({
        type: "restore_display_state",
        state: {
          isCompactList: true,
          isFocusedMode: true,
          readerImageMode: "immersive",
          readerTextMode: "large",
          readerWidthMode: "wide",
        },
      }),
    ).toEqual({
      isCompactList: true,
      isFocusedMode: true,
      readerImageMode: "immersive",
      readerTextMode: "large",
      readerWidthMode: "wide",
    });
  });

  it("supports direct and functional updates for display toggles", () => {
    const focused = reduce({ type: "set_focused_mode", value: true });
    const compact = reduce({ type: "set_compact_list", value: (current) => !current }, focused);

    expect(compact.isFocusedMode).toBe(true);
    expect(compact.isCompactList).toBe(true);
  });

  it("sets typography, width, and media modes independently", () => {
    const wide = reduce({ type: "set_width_mode", value: "wide" });
    const large = reduce({ type: "set_text_mode", value: "large" }, wide);
    const immersive = reduce({ type: "set_image_mode", value: "immersive" }, large);

    expect(immersive).toMatchObject({
      readerImageMode: "immersive",
      readerTextMode: "large",
      readerWidthMode: "wide",
    });
  });

  it("has semantic toggle actions for keyboard shortcuts", () => {
    const focused = reduce({ type: "toggle_focused_mode" });
    const compact = reduce({ type: "toggle_compact_list" }, focused);

    expect(compact.isFocusedMode).toBe(true);
    expect(compact.isCompactList).toBe(true);
  });

  it("validates display values from localStorage before restoring them", () => {
    expect(isReaderDisplayWidthMode("narrow")).toBe(true);
    expect(isReaderDisplayWidthMode("giant")).toBe(false);
    expect(isReaderDisplayTextMode("large")).toBe(true);
    expect(isReaderDisplayTextMode("tiny")).toBe(false);
    expect(isReaderDisplayImageMode("immersive")).toBe(true);
    expect(isReaderDisplayImageMode("unsafe")).toBe(false);
  });
});
