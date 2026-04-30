export type ReaderEmptyLibraryView = "inbox" | "continue" | "saved" | "digest" | "archive";

export type ReaderEmptySourceCandidate = {
  title: string;
  itemCount?: number | null;
  lastFetchAt?: string | null;
  lastSuccessfulFetchAt?: string | null;
  lastErrorMessage?: string | null;
};

export type ReaderEmptySourceLookupCandidate = ReaderEmptySourceCandidate & {
  feedUrl?: string | null;
  siteUrl?: string | null;
  category?: string | null;
  groupName?: string | null;
};

export type ReaderEmptyStateInput = {
  libraryView: ReaderEmptyLibraryView;
  currentLibraryLabel: string;
  search: string;
  hasAnySource: boolean;
  hasAnyItem: boolean;
  hasScopeFilteredItems: boolean;
  problematicSourceCount: number;
  matchingSource?: ReaderEmptySourceCandidate | null;
};

export type ReaderEmptyStateCopy = {
  title: string;
  description: string;
  diagnosticTitle: string;
  diagnosticDescription: string;
};

function quote(value: string) {
  return `„${value}”`;
}

function normalizeLookup(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("pl-PL");
}

function sourceTextMatchesSearch(search: string, values: Array<string | null | undefined>) {
  const normalizedSearch = normalizeLookup(search);
  if (!normalizedSearch) {
    return false;
  }
  return values.some((value) => {
    const normalizedValue = normalizeLookup(value);
    return Boolean(normalizedValue) && (normalizedValue.includes(normalizedSearch) || normalizedSearch.includes(normalizedValue));
  });
}

function getSourceTitle(source: ReaderEmptySourceCandidate) {
  return source.title.trim() || "wybrane źródło";
}

function hasNeverSynced(source: ReaderEmptySourceCandidate) {
  return !source.lastFetchAt && !source.lastSuccessfulFetchAt;
}

function hasNoKnownItems(source: ReaderEmptySourceCandidate) {
  return source.itemCount === undefined || source.itemCount === 0 || source.itemCount === null;
}

export function findReaderEmptySourceCandidate(
  search: string,
  candidates: ReaderEmptySourceLookupCandidate[],
): ReaderEmptySourceCandidate | null {
  const candidate = candidates.find((entry) =>
    sourceTextMatchesSearch(search, [entry.title, entry.feedUrl, entry.siteUrl, entry.category, entry.groupName]),
  );

  if (!candidate) {
    return null;
  }

  return {
    title: candidate.title,
    itemCount: candidate.itemCount,
    lastFetchAt: candidate.lastFetchAt,
    lastSuccessfulFetchAt: candidate.lastSuccessfulFetchAt,
    lastErrorMessage: candidate.lastErrorMessage,
  };
}

export function buildReaderEmptyStateCopy(input: ReaderEmptyStateInput): ReaderEmptyStateCopy {
  const search = input.search.trim();
  const matchingSource = input.matchingSource ?? null;
  const diagnosticTitle = "Dlaczego nic tu nie ma?";

  if (search && matchingSource) {
    const sourceTitle = getSourceTitle(matchingSource);

    if (hasNeverSynced(matchingSource) && hasNoKnownItems(matchingSource)) {
      return {
        title: `Źródło ${quote(sourceTitle)} czeka na pierwszy sync`,
        description: `${sourceTitle} jest dodane do źródeł, ale nie ma jeszcze pobranych artykułów. Uruchom sync, aby pobrać pierwsze wpisy, albo wyczyść wyszukiwanie, żeby zobaczyć pozostałą kolejkę.`,
        diagnosticTitle,
        diagnosticDescription:
          "Ten filtr pasuje do zapisanego źródła, ale RSSmaster nie ma jeszcze historii pobrania ani lokalnych artykułów dla tego źródła.",
      };
    }

    if (matchingSource.lastErrorMessage && hasNoKnownItems(matchingSource)) {
      return {
        title: `Źródło ${quote(sourceTitle)} ma problem z synchronizacją`,
        description: `Ostatni sync nie pobrał artykułów z tego źródła. Sprawdź szczegóły w Źródłach albo uruchom sync ponownie.`,
        diagnosticTitle,
        diagnosticDescription: `Ostatni znany komunikat źródła: ${matchingSource.lastErrorMessage}`,
      };
    }

    if (input.libraryView !== "inbox") {
      return {
        title: `Brak wyników dla ${quote(search)} w widoku ${input.currentLibraryLabel}`,
        description: `Źródło ${quote(sourceTitle)} jest w bibliotece, ale bieżący widok ${input.currentLibraryLabel} nie zawiera pasujących artykułów. Pokaż artykuły do czytania albo wyczyść wyszukiwanie.`,
        diagnosticTitle,
        diagnosticDescription: `Aktualnie przeglądasz widok ${input.currentLibraryLabel}, który ma własną kolejkę i może ukrywać artykuły z pozostałej biblioteki. To nie oznacza, że feed jest pusty.`,
      };
    }

    return {
      title: `Brak wyników dla ${quote(search)}`,
      description: `Źródło ${quote(sourceTitle)} istnieje, ale bieżące filtry nie pokazują pasujących artykułów. Wyczyść wyszukiwanie, pokaż wszystkie albo uruchom sync.`,
      diagnosticTitle,
      diagnosticDescription:
        "RSSmaster znalazł pasujące źródło, więc problem najpewniej leży w filtrze, braku nowych wpisów albo stanie synchronizacji tego feedu.",
    };
  }

  if (search) {
    return {
      title: `Brak wyników dla ${quote(search)}`,
      description: `Wyszukiwanie działa w bieżącym widoku ${input.currentLibraryLabel}. Wyczyść frazę, pokaż całą skrzynkę albo uruchom sync, jeśli spodziewasz się nowych artykułów.`,
      diagnosticTitle,
      diagnosticDescription:
        "Nie znaleziono źródła ani artykułu pasującego do tej frazy w aktualnie widocznej kolejce.",
    };
  }

  if (input.libraryView !== "inbox") {
    if (input.libraryView === "saved") {
      return {
        title: "Nie masz jeszcze zapisanych artykułów",
        description: input.hasAnyItem
          ? "W bibliotece są artykuły do czytania, ale żaden nie jest teraz oznaczony jako zapisany. Przejdź do skrzynki Czytaj, żeby zobaczyć bieżącą kolejkę."
          : "Widok Zapisane pokazuje tylko artykuły oznaczone przyciskiem Zapisz. Dodaj źródło i uruchom sync albo przejdź do źródeł.",
        diagnosticTitle,
        diagnosticDescription: input.hasAnyItem
          ? "Pusta kolejka Zapisane nie oznacza pustej biblioteki. Artykuły są w głównej skrzynce czytania, dopóki ręcznie ich nie zapiszesz."
          : "Nie znaleziono zapisanych artykułów ani lokalnych pozycji do pokazania w tym widoku.",
      };
    }

    return {
      title: `Brak artykułów w widoku: ${input.currentLibraryLabel}`,
      description: `Widok ${input.currentLibraryLabel} ma własną kolejkę. Przejdź do skrzynki Czytaj, aby sprawdzić pełną bibliotekę.`,
      diagnosticTitle,
      diagnosticDescription: `Aktualnie widzisz tylko materiały z kolejki ${input.currentLibraryLabel}, nie całą bibliotekę.`,
    };
  }

  if (!input.hasAnySource) {
    return {
      title: "Nie dodano jeszcze żadnych źródeł",
      description: "Dodaj źródło RSS albo stronę z autodiscovery, a potem uruchom pierwszy sync.",
      diagnosticTitle,
      diagnosticDescription: "Czytnik potrzebuje co najmniej jednego źródła, zanim będzie mógł pobrać artykuły.",
    };
  }

  if (!input.hasAnyItem) {
    return {
      title: "Źródła są dodane, ale nie ma jeszcze artykułów",
      description:
        "RSSmaster widzi zapisane źródła, ale lokalna kolejka jest pusta. Najlepszy następny krok to ręczny sync.",
      diagnosticTitle,
      diagnosticDescription:
        "To zwykle oznacza świeżo dodane źródła, brak pierwszego syncu albo feed, który nie zwrócił jeszcze wpisów.",
    };
  }

  if (input.hasScopeFilteredItems) {
    return {
      title: "Bieżący filtr ukrywa artykuły",
      description:
        "Wybrany feed albo kategoria odfiltrowuje aktualną kolejkę. Pokaż wszystkie albo przejdź do źródeł, żeby sprawdzić stan feedu.",
      diagnosticTitle,
      diagnosticDescription:
        "W bibliotece są artykuły, ale obecny zakres widoku nie zawiera pasujących pozycji.",
    };
  }

  if (input.problematicSourceCount > 0) {
    return {
      title: "Niektóre źródła wymagają uwagi",
      description: `${input.problematicSourceCount} źródło/źródła mają problem z czytelnością lub synchronizacją. Sprawdź źródła albo uruchom sync.`,
      diagnosticTitle,
      diagnosticDescription:
        "Źródła z błędami mogą nie dostarczać nowych artykułów albo mogą mieć tylko ograniczony fallback do czytania.",
    };
  }

  return {
    title: "Brak artykułów w tym widoku",
    description: "Kolejka nie ma teraz artykułów dla wybranych filtrów. Możesz pokazać wszystkie materiały albo odświeżyć feedy.",
    diagnosticTitle,
    diagnosticDescription:
      "Najczęstsze przyczyny to aktywny filtr, brak nowych wpisów od ostatniego syncu albo przejście do węższego widoku biblioteki.",
  };
}
