export type AppSection = "read" | "discover" | "sources" | "magazines" | "digest" | "settings";
export type AppLibraryView = "inbox" | "continue" | "saved" | "digest" | "archive";
export type AppScope = "all" | "unread";
export type AppSortMode = "newest" | "oldest";
export type AppReadSurface = "browse" | "article";
export type AppReaderMode = "for_you" | "latest" | "all" | "hidden";

export type ParsedAppPath = {
  section: AppSection | null;
  libraryView: AppLibraryView;
};

export type ParsedReadRouteSearch = {
  legacyLibraryView?: AppLibraryView;
  scope?: AppScope;
  sort?: AppSortMode;
  q?: string;
  item?: string;
  surface?: AppReadSurface;
  mode?: AppReaderMode;
};

export type ParsedMagazineRouteSearch = {
  issue?: string;
};

export type PendingRouteRestoreState = {
  href: string;
  section: AppSection;
} | null;

export type ReadRouteBootInput = {
  pathname: string;
  search: string | Pick<URLSearchParams, "get">;
  section: AppSection;
  libraryView: AppLibraryView;
  activeItemId: string | null;
  readingItemId: string | null;
  itemSearch: string;
  readSurface: AppReadSurface;
};

export type ReadRouteBootState = {
  section: AppSection;
  libraryView: AppLibraryView;
  activeItemId: string | null;
  readingItemId: string | null;
  itemSearch: string;
  readSurface: AppReadSurface;
  scope?: AppScope;
  sort?: AppSortMode;
};

export type AppHrefInput = {
  section: AppSection;
  libraryView?: AppLibraryView;
  scope?: AppScope;
  sort?: AppSortMode;
  q?: string | null;
  item?: string | null;
  surface?: AppReadSurface | null;
  issue?: string | null;
  mode?: AppReaderMode | null;
};

export function isAppSection(value: string | null | undefined): value is AppSection {
  return (
    value === "read" ||
    value === "discover" ||
    value === "sources" ||
    value === "magazines" ||
    value === "digest" ||
    value === "settings"
  );
}

export function isAppLibraryView(value: string | null | undefined): value is AppLibraryView {
  return value === "inbox" || value === "continue" || value === "saved" || value === "digest" || value === "archive";
}

export function isAppScope(value: string | null | undefined): value is AppScope {
  return value === "all" || value === "unread";
}

export function isAppSortMode(value: string | null | undefined): value is AppSortMode {
  return value === "newest" || value === "oldest";
}

export function isAppReadSurface(value: string | null | undefined): value is AppReadSurface {
  return value === "browse" || value === "article";
}

export function isAppReaderMode(value: string | null | undefined): value is AppReaderMode {
  return value === "for_you" || value === "latest" || value === "all" || value === "hidden";
}

export function parseAppPath(pathname: string): ParsedAppPath {
  const normalized = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return {
      section: null,
      libraryView: "inbox",
    };
  }

  if (segments[0] === "read") {
    return {
      section: "read",
      libraryView: isAppLibraryView(segments[1]) ? segments[1] : "inbox",
    };
  }

  if (isAppSection(segments[0])) {
    return {
      section: segments[0],
      libraryView: "inbox",
    };
  }

  return {
    section: null,
    libraryView: "inbox",
  };
}

function getRouteSearchParams(search: string | Pick<URLSearchParams, "get">): Pick<URLSearchParams, "get"> {
  return typeof search === "string" ? new URLSearchParams(search) : search;
}

function getTrimmedParam(params: Pick<URLSearchParams, "get">, name: string) {
  const value = params.get(name)?.trim();
  return value || undefined;
}

export function parseReadRouteSearch(search: string | Pick<URLSearchParams, "get">): ParsedReadRouteSearch {
  const params = getRouteSearchParams(search);
  const legacyView = params.get("view");
  const scope = params.get("scope");
  const sort = params.get("sort");
  const surface = params.get("surface");
  const mode = params.get("mode");
  const q = params.get("q");

  return {
    legacyLibraryView: isAppLibraryView(legacyView) ? legacyView : undefined,
    scope: isAppScope(scope) ? scope : undefined,
    sort: isAppSortMode(sort) ? sort : undefined,
    q: q ?? undefined,
    item: getTrimmedParam(params, "item"),
    surface: isAppReadSurface(surface) ? surface : undefined,
    mode: isAppReaderMode(mode) ? mode : undefined,
  };
}

export function parseMagazineRouteSearch(search: string | Pick<URLSearchParams, "get">): ParsedMagazineRouteSearch {
  const params = getRouteSearchParams(search);
  return {
    issue: getTrimmedParam(params, "issue"),
  };
}

export function buildBrowserPath(location: Pick<Location, "pathname" | "search">): string {
  return `${location.pathname}${location.search}`;
}

export function shouldHoldForPendingRouteRestore({
  currentSection,
  currentUrl,
  pending,
}: {
  currentSection: AppSection | null;
  currentUrl: string;
  pending: PendingRouteRestoreState;
}) {
  return Boolean(pending && (currentUrl !== pending.href || currentSection !== pending.section));
}

export function resolveReadRouteBootState({
  pathname,
  search,
  section,
  libraryView,
  activeItemId,
  readingItemId,
  itemSearch,
  readSurface,
}: ReadRouteBootInput): ReadRouteBootState {
  const pathState = parseAppPath(pathname);
  let nextSection = section;
  let nextLibraryView = libraryView;
  let nextActiveItemId = activeItemId;
  let nextReadingItemId = readingItemId;
  let nextItemSearch = itemSearch;
  let nextReadSurface = readSurface;

  if (pathState.section) {
    nextSection = pathState.section;
    if (pathState.section === "read") {
      nextLibraryView = pathState.libraryView;
    }
  }

  const readRouteSearch = parseReadRouteSearch(search);
  if (readRouteSearch.legacyLibraryView) {
    nextLibraryView = readRouteSearch.legacyLibraryView;
    nextSection = "read";
  }

  if (nextSection === "read") {
    if (readRouteSearch.item) {
      nextActiveItemId = readRouteSearch.item;
      nextReadingItemId = readRouteSearch.item;
    }
    if (nextActiveItemId && readRouteSearch.surface === "article") {
      nextReadSurface = "article";
    }
    if (typeof readRouteSearch.q === "string") {
      nextItemSearch = readRouteSearch.q;
    }
  }

  return {
    activeItemId: nextActiveItemId,
    itemSearch: nextItemSearch,
    libraryView: nextLibraryView,
    readingItemId: nextReadingItemId,
    readSurface: nextReadSurface,
    scope: nextSection === "read" ? readRouteSearch.scope : undefined,
    section: nextSection,
    sort: nextSection === "read" ? readRouteSearch.sort : undefined,
  };
}

export function buildAppHref({
  section,
  libraryView = "inbox",
  scope,
  sort,
  q,
  item,
  surface,
  issue,
  mode,
}: AppHrefInput): string {
  const pathname = section === "read" ? `/read/${libraryView}` : `/${section}`;
  const params = new URLSearchParams();

  if (section === "read") {
    if (scope) {
      params.set("scope", scope);
    }
    if (sort) {
      params.set("sort", sort);
    }
    if (q && q.trim()) {
      params.set("q", q.trim());
    }
    if (item && item.trim()) {
      params.set("item", item.trim());
    }
    if (surface === "article") {
      params.set("surface", "article");
    }
    if (mode && mode !== "for_you") {
      params.set("mode", mode);
    }
  }

  if (section === "magazines" && issue && issue.trim()) {
    params.set("issue", issue.trim());
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function parseLegacyQueryPath(search: string): {
  section: AppSection;
  libraryView: AppLibraryView;
  scope?: AppScope;
  sort?: AppSortMode;
  q?: string;
  item?: string;
  surface?: AppReadSurface;
} {
  const parsedSearch = parseReadRouteSearch(search);

  return {
    section: "read",
    libraryView: parsedSearch.legacyLibraryView ?? "inbox",
    scope: parsedSearch.scope,
    sort: parsedSearch.sort,
    q: parsedSearch.q?.trim() || undefined,
    item: parsedSearch.item,
    surface: parsedSearch.surface,
  };
}
