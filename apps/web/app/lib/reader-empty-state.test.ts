import { describe, expect, it } from "vitest";

import { buildReaderEmptyStateCopy, findReaderEmptySourceCandidate } from "./reader-empty-state";

describe("reader empty state copy", () => {
  it("explains that a matching source exists but waits for the first sync", () => {
    const copy = buildReaderEmptyStateCopy({
      currentLibraryLabel: "Wszystkie feedy",
      hasAnyItem: true,
      hasAnySource: true,
      hasScopeFilteredItems: false,
      libraryView: "inbox",
      matchingSource: {
        itemCount: 0,
        lastFetchAt: null,
        lastSuccessfulFetchAt: null,
        title: "Money.pl",
      },
      problematicSourceCount: 0,
      search: "money.pl",
    });

    expect(copy.title).toBe("Źródło „Money.pl” czeka na pierwszy sync");
    expect(copy.description).toContain("Money.pl jest dodane do źródeł");
    expect(copy.description).toContain("Uruchom sync");
    expect(copy.diagnosticDescription).toContain("nie ma jeszcze historii pobrania");
  });

  it("does not claim there are no sources when sources exist but the local queue is empty", () => {
    const copy = buildReaderEmptyStateCopy({
      currentLibraryLabel: "Wszystkie feedy",
      hasAnyItem: false,
      hasAnySource: true,
      hasScopeFilteredItems: false,
      libraryView: "inbox",
      problematicSourceCount: 0,
      search: "",
    });

    expect(copy.title).toBe("Źródła są dodane, ale nie ma jeszcze artykułów");
    expect(copy.title).not.toContain("Nie dodano");
    expect(copy.description).toContain("ręczny sync");
  });

  it("separates a saved-view search from the global reader queue", () => {
    const copy = buildReaderEmptyStateCopy({
      currentLibraryLabel: "Zapisane",
      hasAnyItem: true,
      hasAnySource: true,
      hasScopeFilteredItems: false,
      libraryView: "saved",
      matchingSource: {
        itemCount: 10,
        lastFetchAt: "2026-04-29T08:00:00Z",
        lastSuccessfulFetchAt: "2026-04-29T08:00:00Z",
        title: "Money.pl",
      },
      problematicSourceCount: 0,
      search: "money.pl",
    });

    expect(copy.title).toBe("Brak wyników dla „money.pl” w widoku Zapisane");
    expect(copy.description).toContain("bieżący widok Zapisane");
    expect(copy.description).toContain("Pokaż artykuły do czytania");
    expect(copy.diagnosticDescription).toContain("ma własną kolejkę");
    expect(copy.diagnosticDescription).toContain("nie oznacza, że feed jest pusty");
  });

  it("explains that an empty saved view is not an empty reader library", () => {
    const copy = buildReaderEmptyStateCopy({
      currentLibraryLabel: "Zapisane",
      hasAnyItem: true,
      hasAnySource: true,
      hasScopeFilteredItems: false,
      libraryView: "saved",
      problematicSourceCount: 0,
      search: "",
    });

    expect(copy.title).toBe("Nie masz jeszcze zapisanych artykułów");
    expect(copy.description).toContain("W bibliotece są artykuły do czytania");
    expect(copy.description).toContain("Przejdź do skrzynki Czytaj");
    expect(copy.diagnosticDescription).toContain("nie oznacza pustej biblioteki");
  });

  it("surfaces a source sync error without exposing technical stack traces", () => {
    const copy = buildReaderEmptyStateCopy({
      currentLibraryLabel: "Wszystkie feedy",
      hasAnyItem: true,
      hasAnySource: true,
      hasScopeFilteredItems: false,
      libraryView: "inbox",
      matchingSource: {
        itemCount: 0,
        lastErrorMessage: "HTTP 403 Forbidden",
        lastFetchAt: "2026-04-29T08:00:00Z",
        title: "Money.pl",
      },
      problematicSourceCount: 1,
      search: "money.pl",
    });

    expect(copy.title).toBe("Źródło „Money.pl” ma problem z synchronizacją");
    expect(copy.description).toContain("Sprawdź szczegóły w Źródłach");
    expect(copy.diagnosticDescription).toContain("HTTP 403 Forbidden");
    expect(copy.diagnosticDescription).not.toContain("Traceback");
  });

  it("matches an empty-state source by title, feed URL or site URL", () => {
    const candidate = findReaderEmptySourceCandidate("money.pl", [
      {
        feedUrl: "https://example.com/feed.xml",
        itemCount: 10,
        title: "Example",
      },
      {
        feedUrl: "https://www.money.pl/rss/rss.xml",
        itemCount: 0,
        lastFetchAt: null,
        lastSuccessfulFetchAt: null,
        siteUrl: "https://www.money.pl/",
        title: "Money",
      },
    ]);

    expect(candidate).toEqual({
      itemCount: 0,
      lastFetchAt: null,
      lastSuccessfulFetchAt: null,
      lastErrorMessage: undefined,
      title: "Money",
    });
  });
});
