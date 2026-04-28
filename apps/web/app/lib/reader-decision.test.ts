import { describe, expect, it } from "vitest";

import {
  buildReaderDecisionPatch,
  didReaderDecisionAdvance,
  getReaderDecisionActionLabel,
  getReaderDecisionButtonLabel,
  getReaderDecisionNextLine,
  getReaderDecisionResultLine,
  readerDecisionActions,
  resolveReaderDecisionNextItemId,
} from "./reader-decision";

describe("reader decision helpers", () => {
  it("keeps canonical reader decision action order stable", () => {
    expect(readerDecisionActions).toEqual(["read_next", "save_next", "digest_next", "archive_next"]);
  });

  it("maps action labels used by undo and feedback", () => {
    expect(getReaderDecisionActionLabel("read_next")).toBe("Przeczytaj i dalej");
    expect(getReaderDecisionActionLabel("save_next")).toBe("Zapisz i dalej");
    expect(getReaderDecisionActionLabel("digest_next")).toBe("Do digestu i dalej");
    expect(getReaderDecisionActionLabel("archive_next")).toBe("Archiwizuj i dalej");
  });

  it("maps shorter button labels for the visual decision bar", () => {
    expect(getReaderDecisionButtonLabel("read_next")).toBe("Przeczytaj + dalej");
    expect(getReaderDecisionButtonLabel("digest_next")).toBe("Digest + dalej");
  });

  it("builds next-item context copy", () => {
    expect(getReaderDecisionNextLine("Analiza rynku")).toBe("Dalej: Analiza rynku");
    expect(getReaderDecisionNextLine(null)).toBe("To ostatni artykul w biezacej kolejce.");
  });

  it("maps actions into item mutation patches", () => {
    expect(buildReaderDecisionPatch("read_next")).toEqual({ is_read: true });
    expect(buildReaderDecisionPatch("save_next")).toEqual({ library_action: "save" });
    expect(buildReaderDecisionPatch("digest_next")).toEqual({ digest_candidate: true });
    expect(buildReaderDecisionPatch("archive_next")).toEqual({ library_action: "archive" });
  });

  it("resolves the next item using current queue order", () => {
    const queue = [{ id: "first" }, { id: "second" }, { id: "third" }];

    expect(resolveReaderDecisionNextItemId(queue, "first")).toBe("second");
    expect(resolveReaderDecisionNextItemId(queue, "second")).toBe("third");
    expect(resolveReaderDecisionNextItemId(queue, "third")).toBe("third");
    expect(resolveReaderDecisionNextItemId(queue, "missing")).toBe("second");
    expect(resolveReaderDecisionNextItemId([], "missing")).toBeNull();
  });

  it("keeps feedback copy deterministic for advanced and terminal decisions", () => {
    expect(didReaderDecisionAdvance("second", "first")).toBe(true);
    expect(didReaderDecisionAdvance("first", "first")).toBe(false);
    expect(didReaderDecisionAdvance(null, "first")).toBe(false);
    expect(getReaderDecisionResultLine(true)).toContain("fokus przesunal sie dalej");
    expect(getReaderDecisionResultLine(false)).toContain("nie ma kolejnego artykulu");
  });
});
