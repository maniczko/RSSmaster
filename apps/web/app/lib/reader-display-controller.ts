export type ReaderDisplayWidthMode = "narrow" | "comfortable" | "wide";
export type ReaderDisplayTextMode = "standard" | "large";
export type ReaderDisplayImageMode = "safe" | "immersive";

export type ReaderDisplayStateUpdate<T> = T | ((current: T) => T);

export type ReaderDisplayState = {
  isCompactList: boolean;
  isFocusedMode: boolean;
  readerImageMode: ReaderDisplayImageMode;
  readerTextMode: ReaderDisplayTextMode;
  readerWidthMode: ReaderDisplayWidthMode;
};

export type ReaderDisplayAction =
  | { type: "restore_display_state"; state: ReaderDisplayState }
  | { type: "set_compact_list"; value: ReaderDisplayStateUpdate<boolean> }
  | { type: "set_focused_mode"; value: ReaderDisplayStateUpdate<boolean> }
  | { type: "set_image_mode"; value: ReaderDisplayStateUpdate<ReaderDisplayImageMode> }
  | { type: "set_text_mode"; value: ReaderDisplayStateUpdate<ReaderDisplayTextMode> }
  | { type: "set_width_mode"; value: ReaderDisplayStateUpdate<ReaderDisplayWidthMode> }
  | { type: "toggle_compact_list" }
  | { type: "toggle_focused_mode" };

export const readerDisplayInitialState: ReaderDisplayState = {
  isCompactList: false,
  isFocusedMode: false,
  readerImageMode: "safe",
  readerTextMode: "standard",
  readerWidthMode: "comfortable",
};

function applyDisplayUpdate<T>(current: T, value: ReaderDisplayStateUpdate<T>) {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

function patchReaderDisplayState(state: ReaderDisplayState, patch: Partial<ReaderDisplayState>) {
  const changed = Object.entries(patch).some(([key, value]) => {
    const currentValue = state[key as keyof ReaderDisplayState];
    return currentValue !== value;
  });

  return changed ? { ...state, ...patch } : state;
}

export function isReaderDisplayWidthMode(value: unknown): value is ReaderDisplayWidthMode {
  return value === "narrow" || value === "comfortable" || value === "wide";
}

export function isReaderDisplayTextMode(value: unknown): value is ReaderDisplayTextMode {
  return value === "standard" || value === "large";
}

export function isReaderDisplayImageMode(value: unknown): value is ReaderDisplayImageMode {
  return value === "safe" || value === "immersive";
}

export function readerDisplayReducer(state: ReaderDisplayState, action: ReaderDisplayAction): ReaderDisplayState {
  switch (action.type) {
    case "restore_display_state":
      return patchReaderDisplayState(state, action.state);
    case "set_compact_list":
      return patchReaderDisplayState(state, {
        isCompactList: applyDisplayUpdate(state.isCompactList, action.value),
      });
    case "set_focused_mode":
      return patchReaderDisplayState(state, {
        isFocusedMode: applyDisplayUpdate(state.isFocusedMode, action.value),
      });
    case "set_image_mode":
      return patchReaderDisplayState(state, {
        readerImageMode: applyDisplayUpdate(state.readerImageMode, action.value),
      });
    case "set_text_mode":
      return patchReaderDisplayState(state, {
        readerTextMode: applyDisplayUpdate(state.readerTextMode, action.value),
      });
    case "set_width_mode":
      return patchReaderDisplayState(state, {
        readerWidthMode: applyDisplayUpdate(state.readerWidthMode, action.value),
      });
    case "toggle_compact_list":
      return patchReaderDisplayState(state, {
        isCompactList: !state.isCompactList,
      });
    case "toggle_focused_mode":
      return patchReaderDisplayState(state, {
        isFocusedMode: !state.isFocusedMode,
      });
    default:
      return state;
  }
}
