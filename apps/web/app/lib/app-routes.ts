export type AppSection = "read" | "discover" | "sources" | "digest" | "settings";
export type AppLibraryView = "inbox" | "continue" | "saved" | "digest" | "archive";
export type AppScope = "all" | "unread";
export type AppSortMode = "newest" | "oldest";
export type AppReadSurface = "browse" | "article";

export type ParsedAppPath = {
  section: AppSection | null;
  libraryView: AppLibraryView;
};

export type AppHrefInput = {
  section: AppSection;
  libraryView?: AppLibraryView;
  scope?: AppScope;
  sort?: AppSortMode;
  q?: string | null;
  item?: string | null;
  surface?: AppReadSurface | null;
};

export function isAppSection(value: string | null | undefined): value is AppSection {
  return value === "read" || value === "discover" || value === "sources" || value === "digest" || value === "settings";
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

export function buildAppHref({
  section,
  libraryView = "inbox",
  scope,
  sort,
  q,
  item,
  surface,
}: AppHrefInput): string {
  const pathname = section === "read" ? `/read/${libraryView}` : `/${section}`;
  const params = new URLSearchParams();

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
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const scope = params.get("scope");
  const sort = params.get("sort");
  const surface = params.get("surface");

  return {
    section: "read",
    libraryView: isAppLibraryView(view) ? view : "inbox",
    scope: isAppScope(scope) ? scope : undefined,
    sort: isAppSortMode(sort) ? sort : undefined,
    q: params.get("q")?.trim() || undefined,
    item: params.get("item")?.trim() || undefined,
    surface: isAppReadSurface(surface) ? surface : undefined,
  };
}
