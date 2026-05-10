"use client";

import {
  ChangeEvent,
  FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AccountStatus,
  AppShell,
  ArchiveIcon,
  AnnotationPanel,
  ArticleQueueList,
  BookmarkIcon,
  CaptureIcon,
  DigestIcon,
  DigestSection,
  DiscoverIcon,
  FeedBrowser,
  FeedStream,
  HighlightIcon,
  KeyboardIcon,
  KindleIcon,
  LibraryIcon,
  LibraryViewsNav,
  LocalAuthGate,
  MagazineSection,
  MenuIcon,
  NoteIcon,
  ReaderArticleCard,
  ReaderIcon,
  ReaderArticleTopbar,
  ReaderBrowseView,
  ReaderDecisionBar,
  SavedViewChip,
  SettingsIcon,
  SourcesIcon,
  SparkIcon,
  StoryClusterCard,
  WorkspaceButton,
  WorkspaceChip,
  WorkspacePanel,
  WorkspaceSettingsSection,
  WorkspaceSourcesSection,
} from "./components";
import {
  buildContinuityBundle,
  buildArticleKindleDigestPayload,
  buildRestoreStateFromContinuityBundle,
  buildFeedBrowserTree,
  buildReaderEmptyStateCopy,
  defaultViewPreferences,
  getPayloadMessage,
  findReaderEmptySourceCandidate,
  buildSourcePreviewMetrics,
  buildSourcePreviewRequestKey,
  buildSourcePreviewTopics,
  classifySourcePreviewFailure,
  getSourcePreviewFailureDescription,
  getSourcePreviewFailureLabel,
  getSourcePreviewAnnouncement,
  getSourcePreviewUiState,
  getFeedFolderId,
  getReaderViewControlsFromPreference,
  buildReaderDecisionPatch,
  didReaderDecisionAdvance,
  getReaderDecisionActionLabel,
  getReaderDecisionResultLine,
  getReaderQualityState,
  getReextractFeedbackLines,
  getLibraryViewLabel,
  getPublishedAfterForRecallWindow,
  isAuthRequiredPayload,
  isErrorEnvelope,
  isUnsupportedEndpoint,
  inferLibraryViewForItemState,
  matchesLibraryView,
  mapStoryClusterCard,
  normalizeReaderText,
  normalizeViewPreferences,
  orderQueueItemsWithRanking,
  patchViewPreferenceMap,
  parseContinuityBundle,
  readerControllerInitialState,
  readerControllerReducer,
  readerDisplayInitialState,
  readerDisplayReducer,
  readerPreferenceKeys,
  resolveStoredReaderBootState,
  resolveReaderDecisionNextItemId,
  resolveContinuityExportReaderState,
  renderInlineHighlightHtml,
  readResponsePayload,
  sanitizeReaderHtml,
  sanitizeReaderParagraphs,
  shouldOfferReextract,
  dedupeStoryQueue,
  shouldDropReaderParagraph,
  shouldApplyReaderViewPreference,
} from "./lib";
import type {
  ApiErrorEnvelope,
  ContinuityBundle,
  FeedBrowserTreeFolder,
  ReaderDecisionAction,
  ReaderDisplayStateUpdate,
  PendingReaderContinuityRouteRestore,
  ReaderQualityState,
  ReaderContinuitySnapshot,
  ReaderProgressSnapshot,
  ReaderStateUpdate,
  ReaderStatus,
  ViewPreferenceSnapshot,
  WorkspaceSourceHealthEntry,
} from "./lib";
import {
  buildBrowserPath,
  buildAppHref,
  parseAppPath,
  parseMagazineRouteSearch,
  parseReadRouteSearch,
  shouldHoldForPendingRouteRestore,
  type AppReaderMode,
  type AppSection,
} from "@/app/lib/app-routes";
import {
  buildPersistedDigestSelectionPayload,
  getDigestQueueCopy,
  getDigestStatusLabel,
  type DigestCandidatePreviewStatus,
} from "./lib/digest-selection";
import { buildAISettingsPatch, createAISettingsDraft } from "./lib/ai-settings";
import { sourceAddModes, type SourceAddModeId } from "./lib/source-add-modes";

import type {
  Channel,
  LibraryView,
  Item,
  ItemDetail,
  DigestPreview,
  DigestHistory,
  AISettings,
  AISettingsDraft,
  AISettingsPreflight,
  DeliverySettings,
  DeliverySettingsDraft,
  DeliveryPreflight,
  DeliveryLog,
  SyncRun,
  WorkspaceInterest,
  WorkspaceProfile,
  WorkspaceRankingItem,
  WorkspaceBriefing,
  WorkspaceAnnotation,
  WorkspaceTag,
  WorkspaceCollection,
  WorkspaceSavedSearch,
  WorkspaceSourceGroup,
  WorkspaceStoryCluster,
  ListPage,
  AuthSessionPayload,
  AuthStatus,
  ChannelListPayload,
  ChannelMutationPayload,
  ChannelPreviewCandidate,
  ChannelPreviewPayload,
  SourceOpmlImportPayload,
  SourceOpmlPreviewPayload,
  SourceCreatePayload,
  SourceSyncPayload,
  SourceSurfaceMode,
  SyncRunPayload,
  SyncRunListPayload,
  ItemListPayload,
  ItemDetailPayload,
  ItemReextractPayload,
  DigestPreviewPayload,
  DigestHistoryListPayload,
  DigestHistoryPayload,
  AISettingsPayload,
  AISettingsPreflightPayload,
  DeliverySettingsPayload,
  DeliverySettingsPreflightPayload,
  DeliveryPreflightPayload,
  DeliveryDispatchPayload,
  DeliveryLogListPayload,
  ItemStatePatch,
  ItemMutationPayload,
  WorkspaceProfilePayload,
  ReaderFeedbackAction,
  ReaderFeedbackPayload,
  WorkspaceBriefingPayload,
  WorkspaceRankingPayload,
  WorkspaceAnnotationListPayload,
  WorkspaceAnnotationMutationPayload,
  WorkspaceTagListPayload,
  WorkspaceItemTagPayload,
  WorkspaceCollectionListPayload,
  WorkspaceCollectionMutationPayload,
  WorkspaceSavedSearchListPayload,
  WorkspaceSourceHealthPayload,
  WorkspaceSourceGroupListPayload,
  WorkspaceSourceGroupMutationPayload,
  WorkspaceChannelControlPayload,
  WorkspaceStoryClusterPayload,
  WorkspaceCapturePayload,
  WorkspaceExportPayload,
  WorkspaceContinuityImportPayload,
  FeedbackState,
  ArticleKindleFeedbackState,
  ItemSortMode,
  ViewDensity,
  ReaderWidthMode,
  ReaderTextMode,
  ReaderImageMode,
  RecallWindow,
  FeedFilter,
  ReadSurfaceMode,
  ReaderCommandGroup,
  UndoOperation,
  UndoEntry,
} from "./lib/channel-lab-types";

type DeliveryDigestTarget = Pick<DigestHistory, "id" | "title">;

type MagazineArticleHydration = {
  itemId: string;
  author: string | null;
  channelTitle: string | null;
  category: string | null;
  contentHtml: string | null;
  excerpt: string | null;
  wordCount: number | null;
};

const initialFeedback: FeedbackState = {
  tone: "idle",
  title: "Dodawanie źródeł gotowe",
  lines: [
    "Dodaj adres feedu albo strony głównej, a potem pobierz pierwsze wpisy.",
    "Kolejka czytnika wypełni się po pierwszym udanym pobraniu.",
  ],
};

const terminalSyncStates = new Set<SyncRun["status"]>(["partial_success", "failed", "canceled", "completed"]);

const shortcutHints = [
  { key: "J / Down", label: "nastepny" },
  { key: "K / Up", label: "poprzedni" },
  { key: "M", label: "przeczytany" },
  { key: "F", label: "zapisz" },
  { key: "D", label: "digest" },
  { key: "Shift + M/F/D", label: "akcja + dalej" },
  { key: "S", label: "widok zapisanych" },
  { key: "E", label: "widok archiwum" },
  { key: "X", label: "zaznacz" },
  { key: "*", label: "zaznacz wszystko" },
  { key: "?", label: "pomoc" },
  { key: "/", label: "szukaj" },
  { key: "U / A", label: "filtr" },
  { key: "C", label: "gestosc" },
  { key: "Z", label: "tryb focus" },
];

const commandGroups: ReaderCommandGroup[] = [
  {
    title: "Nawigacja",
    items: [
      { keys: "J / Down", label: "Nastepny artykul", note: "Przejdz nizej w biezacej kolejce." },
      { keys: "K / Up", label: "Poprzedni artykul", note: "Przejdz wyzej bez zmiany stanu czytania." },
      { keys: "O", label: "Otworz zrodlo", note: "Otworz oryginalny artykul w nowej karcie." },
      { keys: "/", label: "Przejdz do szukania", note: "Od razu ustaw fokus na wyszukiwaniu kolejki." },
    ],
  },
  {
    title: "Selekcja",
    items: [
      { keys: "M", label: "Przelacz przeczytane", note: "Oznacz aktywny artykul jako przeczytany albo nieprzeczytany." },
      { keys: "F", label: "Przelacz zapisanie", note: "Dodaj lub usun artykul z zapisanych." },
      { keys: "D", label: "Przelacz digest", note: "Dodaj lub usun artykul z kolejki digestu." },
      { keys: "Shift + M", label: "Przeczytaj i dalej", note: "Oznacz jako przeczytany i przejdz dalej jednym ruchem." },
      { keys: "Shift + F", label: "Zapisz i dalej", note: "Zapisz artykul i przejdz dalej." },
      { keys: "Shift + D", label: "Do digestu i dalej", note: "Dodaj do digestu i kontynuuj przeglad." },
    ],
  },
  {
    title: "Zaznaczanie",
    items: [
      { keys: "X", label: "Zaznacz aktywny", note: "Dodaj lub usun aktywny artykul z akcji zbiorczych." },
      { keys: "*", label: "Zaznacz widoczne", note: "Zaznacz cala aktualnie widoczna kolejke jednym ruchem." },
      { keys: "Esc", label: "Wyczysc zaznaczenie", note: "Zamknij zaznaczenie, wyszukiwarke albo nakladke." },
      { keys: "?", label: "Pomoc klawiatury", note: "Otworz mape komend bez wychodzenia z aplikacji." },
    ],
  },
  {
    title: "Widoki",
    items: [
      { keys: "U / A", label: "Nieprzeczytane lub wszystkie", note: "Przelaczaj miedzy nieprzeczytanymi a pelna kolejka." },
      { keys: "S", label: "Widok zapisanych", note: "Przelaczaj miedzy Skrzynka a Zapisane." },
      { keys: "E", label: "Widok archiwum", note: "Otworz archiwum bez wychodzenia z czytnika." },
      { keys: "C", label: "Zwarta lista", note: "Przelaczaj miedzy gesta a wygodna lista." },
      { keys: "Z", label: "Tryb focus", note: "Ukryj boczne panele dla czystszej powierzchni czytania." },
    ],
  },
];

function sleep(delayMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function escapeReaderPreviewHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function paragraphsToReaderPreviewHtml(paragraphs: string[]) {
  return paragraphs.map((paragraph) => `<p>${escapeReaderPreviewHtml(paragraph)}</p>`).join("");
}

function countWordsFromHtml(value: string | null | undefined) {
  return countWords(value ? value.replace(/<[^>]+>/g, " ") : null);
}

function buildMagazineArticleHydration(detail: ItemDetail, snapshotTitle: string): MagazineArticleHydration {
  const sanitizedHtml = sanitizeReaderHtml(detail.cleaned_html, snapshotTitle);
  const fallbackParagraphs = sanitizedHtml
    ? []
    : sanitizeReaderParagraphs(splitReaderParagraphs(detail.content_text ?? detail.excerpt), snapshotTitle);
  const fallbackHtml = fallbackParagraphs.length > 0 ? paragraphsToReaderPreviewHtml(fallbackParagraphs) : null;
  const contentHtml = sanitizedHtml ?? fallbackHtml;
  const wordCount = contentHtml ? countWordsFromHtml(contentHtml) : countWords(detail.content_text ?? detail.excerpt);

  return {
    itemId: detail.id,
    author: detail.author,
    category: detail.channel.category,
    channelTitle: detail.channel.title,
    contentHtml,
    excerpt: detail.excerpt,
    wordCount: wordCount > 0 ? wordCount : null,
  };
}

import {
  clamp,
  splitReaderParagraphs,
  countWords,
  getSearchFieldLabel,
  getSortLabel,
  getChannelHealthTone,
  getPreviewTitle,
  getSourceDiscoveryModeLabel,
  getSourceLanguageLabel,
  getSyncRunSummaryLine,
  countKnownSourceItems,
  mapHealthEntryToReaderEmptySource,
  mapChannelToReaderEmptySource,
  getDeliveryStatusLabel,
  getExtractionStatusLabel,
  mapProfileToRankingPreferences,
  mapSavedSearchToChip,
  mapAnnotationsToPanel,
  applyItemPatch,
  buildUndoPatch,
  describeItemMutation,
  isDigestSelectionEmptyPayload,
  isAuthSessionPayload,
  formatTimestamp,
} from "./lib/channel-lab-presenters";


export function ChannelLab({ apiBaseUrl }: { apiBaseUrl: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authSession, setAuthSession] = useState<AuthSessionPayload | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });
  const [inputUrl, setInputUrl] = useState("");
  const [category, setCategory] = useState("");
  const [sourceSurfaceMode, setSourceSurfaceMode] = useState<SourceSurfaceMode>("add");
  const [sourceAddMode, setSourceAddMode] = useState<SourceAddModeId>("website");
  const [showSourceOptions, setShowSourceOptions] = useState(false);
  const [sourceLanguageFilter, setSourceLanguageFilter] = useState("all");
  const [lastAddedSource, setLastAddedSource] = useState<Channel | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [draftCategories, setDraftCategories] = useState<Record<string, string>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [readerState, dispatchReader] = useReducer(readerControllerReducer, readerControllerInitialState);
  const {
    activeItemId,
    feedFilter,
    itemSearch,
    itemSortMode,
    libraryView,
    readingItemId,
    readSurfaceMode,
    recallWindow,
    selectedItemIds,
    showReadItems,
    storyQueueGrouped,
  } = readerState;
  const setReaderActiveItemId = (value: ReaderStateUpdate<string | null>) =>
    dispatchReader({ type: "set_active_item", value });
  const setReaderFeedFilter = (value: ReaderStateUpdate<FeedFilter>) =>
    dispatchReader({ type: "set_feed_filter", value });
  const setReaderItemSearch = (value: ReaderStateUpdate<string>) => dispatchReader({ type: "set_search", value });
  const setReaderItemSortMode = (value: ReaderStateUpdate<ItemSortMode>) =>
    dispatchReader({ type: "set_sort", value });
  const setReaderLibraryView = (value: ReaderStateUpdate<LibraryView>) =>
    dispatchReader({ type: "set_library_view", value });
  const setReaderReadingItemId = (value: ReaderStateUpdate<string | null>) =>
    dispatchReader({ type: "set_reading_item", value });
  const setReaderReadSurfaceMode = (value: ReaderStateUpdate<ReadSurfaceMode>) =>
    dispatchReader({ type: "set_surface", value });
  const setReaderRecallWindow = (value: ReaderStateUpdate<RecallWindow>) =>
    dispatchReader({ type: "set_recall_window", value });
  const setReaderSelectedItemIds = (value: ReaderStateUpdate<string[]>) =>
    dispatchReader({ type: "set_selection", value });
  const setReaderShowReadItems = (value: ReaderStateUpdate<boolean>) =>
    dispatchReader({ type: "set_show_read", value });
  const setReaderStoryQueueGrouped = (value: ReaderStateUpdate<boolean>) =>
    dispatchReader({ type: "set_story_grouping", value });
  const [readerDisplayState, dispatchReaderDisplay] = useReducer(readerDisplayReducer, readerDisplayInitialState);
  const { isCompactList, isFocusedMode, readerImageMode, readerTextMode, readerWidthMode } = readerDisplayState;
  const setIsCompactList = (value: ReaderDisplayStateUpdate<boolean>) =>
    dispatchReaderDisplay({ type: "set_compact_list", value });
  const setIsFocusedMode = (value: ReaderDisplayStateUpdate<boolean>) =>
    dispatchReaderDisplay({ type: "set_focused_mode", value });
  const setReaderImageMode = (value: ReaderDisplayStateUpdate<ReaderImageMode>) =>
    dispatchReaderDisplay({ type: "set_image_mode", value });
  const setReaderTextMode = (value: ReaderDisplayStateUpdate<ReaderTextMode>) =>
    dispatchReaderDisplay({ type: "set_text_mode", value });
  const setReaderWidthMode = (value: ReaderDisplayStateUpdate<ReaderWidthMode>) =>
    dispatchReaderDisplay({ type: "set_width_mode", value });
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const [itemsStatus, setItemsStatus] = useState<ReaderStatus>("loading");
  const [itemsMessage, setItemsMessage] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState<ListPage | null>(null);
  const [itemsRefreshing, setItemsRefreshing] = useState(false);
  const [itemActionId, setItemActionId] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [itemDetailStatus, setItemDetailStatus] = useState<ReaderStatus>("loading");
  const [itemDetailMessage, setItemDetailMessage] = useState<string | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showReadInspector, setShowReadInspector] = useState(false);
  const [collapsedFeedFolders, setCollapsedFeedFolders] = useState<string[]>([]);
  const [readerProgress, setReaderProgress] = useState<Record<string, ReaderProgressSnapshot>>({});
  const [viewPreferences, setViewPreferences] = useState<Record<LibraryView, ViewPreferenceSnapshot>>(defaultViewPreferences);
  const [channelPreview, setChannelPreview] = useState<ChannelPreviewPayload | null>(null);
  const [digestPreview, setDigestPreview] = useState<DigestPreview | null>(null);
  const [digestCandidatePreview, setDigestCandidatePreview] = useState<DigestPreview | null>(null);
  const [digestCandidateStatus, setDigestCandidateStatus] = useState<DigestCandidatePreviewStatus>("idle");
  const [digestCandidateMessage, setDigestCandidateMessage] = useState<string | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestHistory[]>([]);
  const [selectedMagazineIssueId, setSelectedMagazineIssueId] = useState<string | null>(null);
  const [aiSettings, setAISettings] = useState<AISettings | null>(null);
  const [aiSettingsMessage, setAISettingsMessage] = useState<string | null>(null);
  const [aiPreflight, setAIPreflight] = useState<AISettingsPreflight | null>(null);
  const [aiSettingsDraft, setAISettingsDraft] = useState<AISettingsDraft>(() => createAISettingsDraft(null));
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null);
  const [deliverySettingsMessage, setDeliverySettingsMessage] = useState<string | null>(null);
  const [deliveryPreflight, setDeliveryPreflight] = useState<DeliveryPreflight | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<DeliverySettingsDraft>({
    smtp_host: "",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    smtp_from: "",
    kindle_email: "",
  });
  const [digestBusy, setDigestBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [aiSettingsBusy, setAISettingsBusy] = useState(false);
  const [aiPreflightBusy, setAIPreflightBusy] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [articleKindleBusyId, setArticleKindleBusyId] = useState<string | null>(null);
  const [articleKindleFeedback, setArticleKindleFeedback] = useState<ArticleKindleFeedbackState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sourcePreviewSlow, setSourcePreviewSlow] = useState(false);
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferredSection, setPreferredSection] = useState<AppSection>("read");
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  const [workspaceBriefing, setWorkspaceBriefing] = useState<WorkspaceBriefing | null>(null);
  const [rankingItems, setRankingItems] = useState<WorkspaceRankingItem[]>([]);
  const [hiddenRankingItems, setHiddenRankingItems] = useState<WorkspaceRankingItem[]>([]);
  const [readerQueueMode, setReaderQueueMode] = useState<AppReaderMode>("for_you");
  const [sourceHealthEntries, setSourceHealthEntries] = useState<WorkspaceSourceHealthEntry[]>([]);
  const [sourceGroups, setSourceGroups] = useState<WorkspaceSourceGroup[]>([]);
  const [storyClusters, setStoryClusters] = useState<WorkspaceStoryCluster[]>([]);
  const [itemAnnotations, setItemAnnotations] = useState<WorkspaceAnnotation[]>([]);
  const [annotationHubItems, setAnnotationHubItems] = useState<WorkspaceAnnotation[]>([]);
  const [itemTags, setItemTags] = useState<WorkspaceTag[]>([]);
  const [tagCatalog, setTagCatalog] = useState<WorkspaceTag[]>([]);
  const [collections, setCollections] = useState<WorkspaceCollection[]>([]);
  const [savedSearches, setSavedSearches] = useState<WorkspaceSavedSearch[]>([]);
  const [interestDraft, setInterestDraft] = useState("");
  const [interestWeight, setInterestWeight] = useState<WorkspaceInterest["weight"]>(1);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationHubQuery, setAnnotationHubQuery] = useState("");
  const [annotationHubLoading, setAnnotationHubLoading] = useState(false);
  const [selectedTextQuote, setSelectedTextQuote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [sourceGroupDraft, setSourceGroupDraft] = useState("");
  const [sourceGroupColor, setSourceGroupColor] = useState("#155e75");
  const [captureUrl, setCaptureUrl] = useState("");
  const [opmlDraft, setOpmlDraft] = useState("");
  const [opmlPreview, setOpmlPreview] = useState<SourceOpmlPreviewPayload | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [opmlImportBusy, setOpmlImportBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceExportBusy, setWorkspaceExportBusy] = useState(false);
  const [workspaceImportBusy, setWorkspaceImportBusy] = useState(false);
  const [expandedStoryClusterIds, setExpandedStoryClusterIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const routeState = useMemo(() => parseAppPath(pathname ?? "/"), [pathname]);
  const searchParams = useSearchParams();
  const currentSection = routeState.section ?? preferredSection;
  const authRequired = authSession?.auth_required ?? false;
  const hasLocalAccounts = authSession?.has_accounts ?? false;
  const authenticatedAccount = authSession?.session?.account ?? null;
  const resolvedAuthMode = !hasLocalAccounts ? "register" : authMode;
  const requestedReadSurface = useMemo(() => {
    return parseReadRouteSearch(searchParams).surface ?? null;
  }, [searchParams]);
  const requestedMagazineIssueId = useMemo(() => {
    return parseMagazineRouteSearch(searchParams).issue ?? null;
  }, [searchParams]);

  const deferredItemSearch = useDeferredValue(itemSearch);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const itemRowRefs = useRef(new Map<string, HTMLLIElement>());
  const articleContentRef = useRef<HTMLDivElement | null>(null);
  const readingProgressRef = useRef<Record<string, ReaderProgressSnapshot>>({});
  const pendingReaderProgressRestoreRef = useRef<Record<string, true>>({});
  const pendingContinuityRouteRestoreRef = useRef<PendingReaderContinuityRouteRestore | null>(null);
  const lastReadLibraryViewRef = useRef<LibraryView>(libraryView);
  const lastReadShowReadItemsRef = useRef(showReadItems);
  const applyingViewPreferenceRef = useRef(false);
  const sourcePreviewRequestIdRef = useRef(0);
  const sourcePreviewAbortRef = useRef<AbortController | null>(null);
  const lastSourcePreviewKeyRef = useRef<string | null>(null);
  const magazineHydrationAttemptedRef = useRef(new Set<string>());

  function getReaderScrollSnapshot(surface: HTMLDivElement) {
    const computedStyle = window.getComputedStyle(surface);
    const usesDocumentScroll =
      computedStyle.overflowY === "visible" || Math.abs(surface.scrollHeight - surface.clientHeight) < 4;

    if (usesDocumentScroll) {
      const scrollElement = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0);
      return {
        scrollTop: scrollElement.scrollTop,
        maxScroll,
        target: "document" as const,
      };
    }

    return {
      scrollTop: surface.scrollTop,
      maxScroll: Math.max(surface.scrollHeight - surface.clientHeight, 0),
      target: "surface" as const,
    };
  }

  function markReaderProgressRestorePending(progressByItemId: Record<string, ReaderProgressSnapshot>) {
    const pendingEntries = Object.keys(progressByItemId).map((itemId) => [itemId, true] as const);
    if (pendingEntries.length === 0) {
      return;
    }
    pendingReaderProgressRestoreRef.current = {
      ...pendingReaderProgressRestoreRef.current,
      ...Object.fromEntries(pendingEntries),
    };
  }
  const previousSourceAddModeRef = useRef<SourceAddModeId>(sourceAddMode);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const continuityImportInputRef = useRef<HTMLInputElement | null>(null);
  const sourceImportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceCategoryInputRef = useRef<HTMLInputElement | null>(null);
  const sourceResultsRegionRef = useRef<HTMLDivElement | null>(null);
  const sourceBackofficeRegionRef = useRef<HTMLDivElement | null>(null);
  const pendingSourceFocusTargetRef = useRef<"input" | "import" | "category" | "results" | "backoffice" | null>(null);
  const sourcePrimaryModesLabelId = useId();
  const sourceSecondaryActionsLabelId = useId();
  const sourceSearchHintId = useId();
  const sourceSearchOptionsId = useId();
  const sourceSearchOptionsNoteId = useId();
  const sourceResultsHeadingId = useId();
  const sourceResultsRegionId = useId();
  const sourceFeedbackRegionId = useId();
  const sourceBackofficeHeadingId = useId();
  const sourceBackofficeRegionId = useId();
  const libraryScopedItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesLibraryView(item, libraryView)) {
          return false;
        }
        if (libraryView === "continue" && !(readerProgress[item.id]?.progress && readerProgress[item.id].progress > 2)) {
          return false;
        }
        if (!showReadItems && item.is_read) {
          return false;
        }
        return true;
      }),
    [items, libraryView, readerProgress, showReadItems],
  );
  const visibleItems = useMemo(
    () =>
      libraryScopedItems.filter((item) => {
        if (feedFilter.kind === "channel") {
          return item.channel_id === feedFilter.value;
        }
        if (feedFilter.kind === "category") {
          return getFeedFolderId(item.channel.category) === feedFilter.value;
        }
        return true;
      }),
    [feedFilter, libraryScopedItems],
  );
  const queueItems = useMemo(() => {
    const rankingLibraryView = libraryView === "continue" ? "inbox" : libraryView;
    const canUseCuratedQueue = rankingLibraryView === "inbox" && itemSortMode === "newest";
    const queueRankingItems = readerQueueMode === "hidden" ? hiddenRankingItems : rankingItems;
    const rankedIds = new Set(queueRankingItems.map((entry) => entry.item.id));
    const rankedPool = visibleItems.filter((item) => rankedIds.has(item.id));
    const shouldDedupe =
      storyQueueGrouped &&
      (libraryView === "inbox" || libraryView === "continue") &&
      !deferredItemSearch.trim();

    if ((readerQueueMode === "for_you" || readerQueueMode === "hidden") && canUseCuratedQueue) {
      return dedupeStoryQueue(
        orderQueueItemsWithRanking(rankedPool, queueRankingItems, {
          deferredSearch: "",
          libraryView: rankingLibraryView,
          itemSortMode,
        }),
        shouldDedupe,
      );
    }

    return dedupeStoryQueue(
      orderQueueItemsWithRanking(visibleItems, rankingItems, {
        deferredSearch: readerQueueMode === "latest" ? "latest" : deferredItemSearch,
        libraryView: rankingLibraryView,
        itemSortMode,
      }),
      shouldDedupe,
    );
  }, [
    deferredItemSearch,
    hiddenRankingItems,
    itemSortMode,
    libraryView,
    rankingItems,
    readerQueueMode,
    storyQueueGrouped,
    visibleItems,
  ]);
  const visibleUnreadCount = useMemo(
    () => queueItems.filter((item) => !item.is_read).length,
    [queueItems],
  );
  const visibleFavoriteCount = useMemo(
    () => queueItems.filter((item) => item.is_favorite).length,
    [queueItems],
  );
  const rankingExplanations = useMemo(
    () =>
      Object.fromEntries(
        [...hiddenRankingItems, ...rankingItems].map((entry) => [
          entry.item.id,
          {
            negativeSignals: entry.breakdown.matched_negative_signals ?? [],
            positiveSignals: entry.breakdown.matched_positive_signals ?? entry.breakdown.matched_interests ?? [],
            qualityFlags: entry.quality_flags ?? entry.breakdown.quality_flags ?? [],
            reason: entry.breakdown.reason,
            score: entry.breakdown.final_score,
            visibility: entry.visibility ?? entry.breakdown.visibility,
            visibilityReason: entry.visibility_reason ?? entry.breakdown.visibility_reason,
          },
        ]),
      ),
    [hiddenRankingItems, rankingItems],
  );
  const totalUnreadCount = channels.reduce((sum, channel) => sum + channel.unread_count, 0);
  const continueReadingCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.library.state === "inbox" &&
          typeof readerProgress[item.id]?.progress === "number" &&
          (readerProgress[item.id]?.progress ?? 0) > 2,
      ).length,
    [items, readerProgress],
  );
  const digestCandidateIds = useMemo(
    () => queueItems.filter((item) => item.digest_candidate).map((item) => item.id),
    [queueItems],
  );
  const persistedDigestCandidateCount =
    digestCandidatePreview?.stats.digest_candidate_count ?? digestPreview?.stats.digest_candidate_count ?? null;
  const hasDigestReaderFilter =
    deferredItemSearch.trim().length > 0 || feedFilter.kind !== "all" || libraryView !== "digest" || !showReadItems;
  const digestQueueCopy = getDigestQueueCopy({
    hasActiveReaderFilter: hasDigestReaderFilter,
    persistedCount: persistedDigestCandidateCount,
    status: digestCandidateStatus,
    visibleCandidateCount: digestCandidateIds.length,
  });
  const selectedItem = useMemo(
    () => {
      const activeItem = queueItems.find((item) => item.id === activeItemId) ?? null;
      if (activeItem) {
        return activeItem;
      }
      if (requestedReadSurface === "article" && activeItemId) {
        return null;
      }
      return queueItems[0] ?? null;
    },
    [activeItemId, queueItems, requestedReadSurface],
  );
  const selectedItemIndex = useMemo(
    () => (selectedItem ? queueItems.findIndex((item) => item.id === selectedItem.id) : -1),
    [queueItems, selectedItem],
  );
  const activeChannelCount = channels.filter((channel) => channel.state === "active").length;
  const archivedChannelCount = channels.filter((channel) => channel.state === "archived").length;
  const channelTitles = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, channel.title])),
    [channels],
  );
  const channelSiteUrls = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, channel.site_url ?? channel.feed_url])),
    [channels],
  );
  const feedCountsByChannelId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of libraryScopedItems) {
      counts.set(item.channel_id, (counts.get(item.channel_id) ?? 0) + 1);
    }
    return counts;
  }, [libraryScopedItems]);
  const feedBrowserFolders = useMemo(() => {
    return buildFeedBrowserTree(
      channels
        .map((channel) => ({
          id: channel.id,
          label: channel.title,
          category: channel.category,
          siteUrl: channel.site_url ?? channel.feed_url,
          unreadCount: feedCountsByChannelId.get(channel.id) ?? 0,
        }))
        .filter((channel) => channel.unreadCount > 0),
    );
  }, [channels, feedCountsByChannelId]);
  const latestDigest = digestHistory[0] ?? null;
  const selectedMagazineIssue = useMemo(
    () => digestHistory.find((issue) => issue.id === selectedMagazineIssueId) ?? digestHistory[0] ?? null,
    [digestHistory, selectedMagazineIssueId],
  );
  const selectedBulkItems = useMemo(
    () => queueItems.filter((item) => selectedItemIds.includes(item.id)),
    [queueItems, selectedItemIds],
  );
  const selectedReadingProgress = selectedItem ? readerProgress[selectedItem.id] ?? null : null;
  const latestUndoEntry = undoEntries[undoEntries.length - 1] ?? null;
  const rankingPreferences = useMemo(
    () => mapProfileToRankingPreferences(workspaceProfile),
    [workspaceProfile],
  );
  const savedViewChips = useMemo(
    () => savedSearches.map((search) => mapSavedSearchToChip(search, itemSearch, libraryView)),
    [itemSearch, libraryView, savedSearches],
  );
  const annotationPanelModel = useMemo(
    () => mapAnnotationsToPanel(selectedItem, itemAnnotations, selectedTextQuote),
    [itemAnnotations, selectedItem, selectedTextQuote],
  );

  function pushUndoEntry(entry: UndoEntry) {
    setUndoEntries((current) => [...current.slice(-4), entry]);
  }

  function dismissUndoEntry(entryId: string) {
    setUndoEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  function upsertRun(run: SyncRun) {
    startTransition(() => {
      setSyncRuns((current) => [run, ...current.filter((candidate) => candidate.id !== run.id)].slice(0, 8));
    });
  }

  async function loadChannels() {
    const { response, payload } = await fetchApi<ChannelListPayload>("/api/v1/channels?limit=200");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac zapisanych kanalow."));
    }

    startTransition(() => {
      setChannels(payload.items);
      setDraftCategories(Object.fromEntries(payload.items.map((channel) => [channel.id, channel.category ?? ""])));
    });
  }

  async function loadSyncRuns() {
    const { response, payload } = await fetchApi<SyncRunListPayload>("/api/v1/sync/runs");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac historii syncow."));
    }

    startTransition(() => {
      setSyncRuns(payload.items);
    });
  }

  async function loadDigestHistory() {
    const { response, payload } = await fetchApi<DigestHistoryListPayload>("/api/v1/digests/history?limit=8");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac historii digestow."));
    }

    startTransition(() => {
      setDigestHistory(payload.items);
    });
  }

  async function loadDeliverySettings() {
    const { response, payload } = await fetchApi<DeliverySettingsPayload>("/api/v1/settings/delivery");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac ustawien wysylki."));
    }

    startTransition(() => {
      setDeliverySettings(payload.settings);
      setSettingsDraft({
        smtp_host: payload.settings.smtp_host ?? "",
        smtp_port: String(payload.settings.smtp_port ?? 587),
        smtp_username: payload.settings.smtp_username ?? "",
        smtp_password: "",
        smtp_from: payload.settings.smtp_from ?? "",
        kindle_email: payload.settings.kindle_email ?? "",
      });
    });
    return payload.settings;
  }

  async function loadAISettings() {
    const { response, payload } = await fetchApi<AISettingsPayload>("/api/v1/settings/ai");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udało się wczytać ustawień AI."));
    }

    startTransition(() => {
      setAISettings(payload.settings);
      setAISettingsDraft(createAISettingsDraft(payload.settings));
    });
    return payload.settings;
  }

  async function loadDeliveryLogs(digestId?: string) {
    const params = new URLSearchParams({
      limit: "8",
    });
    if (digestId) {
      params.set("digest_id", digestId);
    }

    const { response, payload } = await fetchApi<DeliveryLogListPayload>(`/api/v1/delivery/logs?${params.toString()}`);
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac logow wysylki."));
    }

    startTransition(() => {
      setDeliveryLogs(payload.items);
    });
  }

  function handleAuthRequired(message?: string) {
    setAuthSession((current) => ({
      has_accounts: current?.has_accounts ?? true,
      auth_required: true,
      session: null,
    }));
    setAuthStatus("unauthenticated");
    setAuthMessage(message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
  }

  async function fetchApi<TPayload = unknown>(path: string, init?: RequestInit) {
    const { headers, ...restInit } = init ?? {};
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...restInit,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
    });
    const payload = (await readResponsePayload(response)) as TPayload | ApiErrorEnvelope;

    if (response.status === 401 && isAuthRequiredPayload(payload)) {
      handleAuthRequired(payload.error?.message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
      throw new Error(payload.error?.message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
    }

    return {
      response,
      payload,
    };
  }

  async function fetchWorkspace<TPayload>(path: string, init?: RequestInit) {
    const { response, payload } = await fetchApi<TPayload>(path, init);
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, `Workspace request failed for ${path}.`));
    }
    return payload as TPayload;
  }

  async function loadAuthSession() {
    try {
      const { response, payload } = await fetchApi<AuthSessionPayload>("/api/v1/auth/session");
      if (!response.ok || !isAuthSessionPayload(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie sprawdzic lokalnej sesji RSSmaster."));
      }

      setAuthSession(payload);
      setAuthStatus(payload.auth_required && !payload.session ? "unauthenticated" : "ready");
      setAuthMode(payload.has_accounts ? "login" : "register");
      setAuthMessage(null);
    } catch (error) {
      setAuthSession({
        has_accounts: false,
        auth_required: false,
        session: null,
      });
      setAuthStatus("ready");
      setAuthMessage(null);
      setFeedback({
        tone: "error",
        title: "Nie udalo sie sprawdzic sesji",
        lines: [error instanceof Error ? error.message : "Nieznany blad frontendu."],
      });
    }
  }

  async function handleAuthSubmit() {
    const username = authForm.username.trim();
    const password = authForm.password;
    const displayName = authForm.displayName.trim();

    if (!username || !password) {
      setAuthMessage("Podaj nazwę konta i hasło.");
      return;
    }

    if (resolvedAuthMode === "register" && password.length < 8) {
      setAuthMessage("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage(null);

    try {
      const { response, payload } = await fetchApi<AuthSessionPayload>(
        resolvedAuthMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            resolvedAuthMode === "register"
              ? {
                  username,
                  password,
                  display_name: displayName || undefined,
                  claim_legacy_workspace: !hasLocalAccounts,
                }
              : {
                  username,
                  password,
                },
          ),
        },
      );

      if (!response.ok || !isAuthSessionPayload(payload)) {
        throw new Error(
          getPayloadMessage(
            payload,
            resolvedAuthMode === "register"
              ? "Nie udało się utworzyć lokalnego konta."
              : "Nie udało się zalogować do RSSmaster.",
          ),
        );
      }

      setAuthSession(payload);
      setAuthStatus("ready");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Nieznany blad logowania.");
    } finally {
      setAuthBusy(false);
    }
  }

  function openAuthScreen(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthStatus("unauthenticated");
    setAuthMessage(null);
    setAuthSession((current) => ({
      has_accounts: mode === "login" ? true : (current?.has_accounts ?? false),
      auth_required: mode === "login" ? true : (current?.auth_required ?? false),
      session: null,
    }));
  }

  async function handleLogout() {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await fetchApi<AuthSessionPayload>("/api/v1/auth/logout", {
        method: "POST",
      });
      setAuthSession({
        has_accounts: true,
        auth_required: true,
        session: null,
      });
      setAuthStatus("unauthenticated");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Nie udalo sie wylogowac.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadWorkspaceOverview() {
    const [
      profileResult,
      briefingResult,
      rankingResult,
      hiddenRankingResult,
      sourceHealthResult,
      sourceGroupResult,
      storyResult,
      tagResult,
      savedSearchResult,
      collectionResult,
    ] = await Promise.allSettled([
      fetchWorkspace<WorkspaceProfilePayload>("/api/v1/workspace/profile"),
      fetchWorkspace<WorkspaceBriefingPayload>("/api/v1/workspace/briefing"),
      fetchWorkspace<WorkspaceRankingPayload>("/api/v1/workspace/ranking?limit=14&mode=for_you"),
      fetchWorkspace<WorkspaceRankingPayload>("/api/v1/workspace/ranking?limit=30&mode=hidden&include_hidden=true"),
      fetchWorkspace<WorkspaceSourceHealthPayload>("/api/v1/workspace/source-health"),
      fetchWorkspace<WorkspaceSourceGroupListPayload>("/api/v1/workspace/source-groups"),
      fetchWorkspace<WorkspaceStoryClusterPayload>("/api/v1/workspace/stories?limit=6"),
      fetchWorkspace<WorkspaceTagListPayload>("/api/v1/workspace/tags"),
      fetchWorkspace<WorkspaceSavedSearchListPayload>("/api/v1/workspace/saved-searches"),
      fetchWorkspace<WorkspaceCollectionListPayload>("/api/v1/workspace/collections"),
    ]);

    startTransition(() => {
      if (profileResult.status === "fulfilled") {
        setWorkspaceProfile(profileResult.value.profile);
      }
      if (briefingResult.status === "fulfilled") {
        setWorkspaceBriefing(briefingResult.value.briefing);
      }
      if (rankingResult.status === "fulfilled") {
        setRankingItems(rankingResult.value.items);
      }
      if (hiddenRankingResult.status === "fulfilled") {
        setHiddenRankingItems(hiddenRankingResult.value.items);
      }
      if (sourceHealthResult.status === "fulfilled") {
        setSourceHealthEntries(sourceHealthResult.value.items);
      }
      if (sourceGroupResult.status === "fulfilled") {
        setSourceGroups(sourceGroupResult.value.items);
      }
      if (storyResult.status === "fulfilled") {
        setStoryClusters(storyResult.value.items);
      }
      if (tagResult.status === "fulfilled") {
        setTagCatalog(tagResult.value.items);
      }
      if (savedSearchResult.status === "fulfilled") {
        setSavedSearches(savedSearchResult.value.items);
      }
      if (collectionResult.status === "fulfilled") {
        setCollections(collectionResult.value.items);
      }
    });

  }

  async function loadSelectedItemWorkspace(itemId: string | null) {
    if (!itemId) {
      startTransition(() => {
        setItemAnnotations([]);
        setItemTags([]);
      });
      return;
    }

    const [annotationPayload, tagPayload] = await Promise.all([
      fetchWorkspace<WorkspaceAnnotationListPayload>(`/api/v1/workspace/annotations?item_id=${encodeURIComponent(itemId)}&limit=30`),
      fetchWorkspace<WorkspaceItemTagPayload>(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/tags`),
    ]);

    startTransition(() => {
      setItemAnnotations(annotationPayload.items);
      setItemTags(tagPayload.tags);
    });
  }

  async function focusArticleById(itemId: string, options: { origin?: "discover" | "knowledge" } = {}) {
    try {
      const payload = await fetchWorkspace<ItemDetailPayload>(`/api/v1/items/${encodeURIComponent(itemId)}`);
      const resolvedView = inferLibraryViewForItemState(payload.item);
      startTransition(() => {
        setItems((current) => [payload.item, ...current.filter((entry) => entry.id !== payload.item.id)]);
      });
      if (options.origin === "discover") {
        setFeedback({
          tone: "idle",
          title: "Otwieram artykuł z Discover",
          lines: [
            "Artykuł otworzy się w czytniku. Użyj Wstecz w przeglądarce, aby wrócić do przeglądu dnia, rankingu i klastrów historii.",
          ],
        });
      }
      setReaderRecallWindow("all");
      navigateToReadLibraryView(resolvedView, {
        itemId: payload.item.id,
        showReadItems: true,
        surface: "article",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie ponownie otworzyc artykulu",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    }
  }

  async function loadAnnotationHub(search = annotationHubQuery) {
    setAnnotationHubLoading(true);
    try {
      const query = search.trim();
      const path = query
        ? `/api/v1/workspace/annotations?search=${encodeURIComponent(query)}&limit=12`
        : "/api/v1/workspace/annotations?limit=12";
      const payload = await fetchWorkspace<WorkspaceAnnotationListPayload>(path);
      startTransition(() => {
        setAnnotationHubItems(payload.items);
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie wczytac centrum adnotacji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setAnnotationHubLoading(false);
    }
  }

  async function saveWorkspaceProfile(patch: Partial<WorkspaceProfile> & { interests?: WorkspaceInterest[] }) {
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceProfilePayload>("/api/v1/workspace/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      startTransition(() => {
        setWorkspaceProfile(payload.profile);
      });
      await Promise.all([loadWorkspaceOverview(), loadItems()]);
      setFeedback({
        tone: "success",
        title: "Ustawienia czytnika zaktualizowane",
        lines: ["Preferencje rankingu zostaly zapisane, a powierzchnie rekomendacji odswiezone."],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac ustawien czytnika",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateNote() {
    if (!selectedItem || !annotationDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceAnnotationMutationPayload>("/api/v1/workspace/annotations", {
        method: "POST",
        body: JSON.stringify({
          item_id: selectedItem.id,
          kind: "note",
          note_text: annotationDraft.trim(),
        }),
      });
      setAnnotationDraft("");
      await Promise.all([loadSelectedItemWorkspace(selectedItem.id), loadAnnotationHub()]);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac notatki",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateHighlight() {
    if (!selectedItem || !selectedTextQuote.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceAnnotationMutationPayload>("/api/v1/workspace/annotations", {
        method: "POST",
        body: JSON.stringify({
          item_id: selectedItem.id,
          kind: "highlight",
          quote_text: selectedTextQuote.trim(),
          note_text: annotationDraft.trim() || null,
        }),
      });
      setAnnotationDraft("");
      setSelectedTextQuote("");
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
      await Promise.all([loadSelectedItemWorkspace(selectedItem.id), loadAnnotationHub()]);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac podkreslenia",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleSaveTags() {
    if (!selectedItem) {
      return;
    }
    const existingNames = itemTags.map((tag) => tag.name);
    const draftNames = tagDraft
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const names = Array.from(new Set([...existingNames, ...draftNames]));
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceItemTagPayload>(`/api/v1/workspace/items/${selectedItem.id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ names }),
      });
      setItemTags(payload.tags);
      setTagDraft("");
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac tagow",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateCollection() {
    if (!collectionDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCollectionMutationPayload>("/api/v1/workspace/collections", {
        method: "POST",
        body: JSON.stringify({
          name: collectionDraft.trim(),
          item_id: selectedItem?.id ?? null,
        }),
      });
      startTransition(() => {
        setCollections((current) => [payload.collection, ...current.filter((entry) => entry.id !== payload.collection.id)]);
      });
      setCollectionDraft("");
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie utworzyc kolekcji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleAddToCollection(collectionId: string) {
    if (!selectedItem) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCollectionMutationPayload>(`/api/v1/workspace/collections/${collectionId}/items`, {
        method: "POST",
        body: JSON.stringify({ item_id: selectedItem.id }),
      });
      startTransition(() => {
        setCollections((current) => current.map((entry) => (entry.id === payload.collection.id ? payload.collection : entry)));
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie dodac artykulu do kolekcji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateSavedSearch() {
    const query = deferredItemSearch.trim();
    if (!query) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceSavedSearchListPayload>("/api/v1/workspace/saved-searches", {
        method: "POST",
        body: JSON.stringify({
          name: query.length > 28 ? `${query.slice(0, 28)}...` : query,
          query,
          default_view: libraryView,
        }),
      });
      startTransition(() => {
        setSavedSearches(payload.items);
      });
      setFeedback({
        tone: "success",
        title: "Zapisane wyszukiwanie utworzone",
        lines: [`${query} jest teraz dostepne jako wielokrotnie uzywany widok czytnika.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac wyszukiwania",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleSourceTierChange(channelId: string, tier: "priority" | "default" | "muted") {
    await handleSourceControlUpdate(channelId, { tier });
  }

  async function handleSourceControlUpdate(
    channelId: string,
    patch: Partial<WorkspaceSourceHealthEntry["control"]>,
  ) {
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceChannelControlPayload>(`/api/v1/workspace/source-controls/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadWorkspaceOverview();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zaktualizowac kontroli zrodla",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateSourceGroup() {
    if (!sourceGroupDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceSourceGroupMutationPayload>("/api/v1/workspace/source-groups", {
        method: "POST",
        body: JSON.stringify({
          name: sourceGroupDraft.trim(),
          color: sourceGroupColor,
        }),
      });
      startTransition(() => {
        setSourceGroups((current) => [payload.group, ...current.filter((entry) => entry.id !== payload.group.id)]);
      });
      setSourceGroupDraft("");
      setFeedback({
        tone: "success",
        title: "Pakiet zrodel utworzony",
        lines: [`${payload.group.name} jest gotowy do grupowania i wyciszania powiazanych feedow.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie utworzyc pakietu zrodel",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCaptureUrl() {
    if (!captureUrl.trim()) {
      return;
    }
    setCaptureBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCapturePayload>("/api/v1/workspace/capture", {
        method: "POST",
        body: JSON.stringify({ url: captureUrl.trim() }),
      });
      setCaptureUrl("");
      await Promise.all([loadChannels(), loadItems(), loadWorkspaceOverview()]);
      setReaderLibraryView("saved");
      setReaderActiveItemId(payload.item.id);
      setFeedback({
        tone: "success",
        title: "Artykul do pozniejszego czytania zapisany",
        lines: [`${payload.item.title} jest teraz w zapisanej bibliotece.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie przechwycic artykulu",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setCaptureBusy(false);
    }
  }

  async function handleExportWorkspace() {
    setWorkspaceExportBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceExportPayload>("/api/v1/workspace/export");
      const continuityActiveItemId = activeItemId;
      const continuityReadingItemId = readingItemId ?? (currentSection !== "read" && activeItemId ? activeItemId : null);
      const continuityReaderState = resolveContinuityExportReaderState({
        currentSection,
        libraryView,
        showReadItems,
        contextItemId: continuityReadingItemId ?? continuityActiveItemId,
        lastReadLibraryView: lastReadLibraryViewRef.current,
        lastReadShowReadItems: lastReadShowReadItemsRef.current,
        items,
        viewPreferences,
      });
      const bundle = buildContinuityBundle({
        workspaceExport: payload,
        knownItems: items.map((item) => ({ id: item.id, source_url: item.source_url })),
        activeItemId: continuityActiveItemId,
        readingItemId: continuityReadingItemId,
        section:
          currentSection === "read" || continuityActiveItemId || continuityReadingItemId ? "read" : currentSection,
        libraryView: continuityReaderState.libraryView,
        showReadItems: continuityReaderState.showReadItems,
        itemSearch,
        widthMode: readerWidthMode,
        textMode: readerTextMode,
        imageMode: readerImageMode,
        focusedMode: isFocusedMode,
        viewPreferences,
        progressByItemId: readerProgress,
      });
      if (typeof window !== "undefined") {
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const objectUrl = URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = objectUrl;
        link.download = `rssmaster-continuity-${payload.exported_at.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      }
      setFeedback({
        tone: "success",
        title: "Continuity bundle gotowy",
        lines: [
          "Bundle zawiera feedy, stany biblioteki oraz lokalny kontekst czytnika do odtworzenia na drugiej instancji RSSmastera.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie wyeksportowac workspace",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceExportBusy(false);
    }
  }

  async function handleImportContinuityBundleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setWorkspaceImportBusy(true);
    try {
      const rawBundle = await file.text();
      const bundle = parseContinuityBundle(rawBundle);
      const payload = await fetchWorkspace<WorkspaceContinuityImportPayload>("/api/v1/workspace/continuity/import", {
        method: "POST",
        body: JSON.stringify({
          sources_opml: bundle.sources_opml,
          continuity_items: bundle.continuity_items.map((item) => ({
            item_id: item.id,
            source_url: item.source_url,
            is_read: Boolean(item.is_read),
            is_favorite: Boolean(item.is_favorite),
            digest_candidate: Boolean(item.digest_candidate),
            is_archived: Boolean(item.is_archived),
          })),
          annotations: bundle.annotations,
          tags: bundle.tags,
          collections: bundle.collections,
          saved_searches: bundle.saved_searches,
          item_tags: bundle.item_tags,
          collection_items: bundle.collection_items,
        }),
      });
      const matchedItemIdBySourceUrl = Object.fromEntries(payload.matched_items.map((entry) => [entry.source_url, entry.item_id]));
      const restoreState = buildRestoreStateFromContinuityBundle(bundle, matchedItemIdBySourceUrl);
      const restoredViewPreferences = normalizeViewPreferences(bundle.reader_state.viewPreferences, { legacyCompact: false });
      let resolvedRestoreLibraryView = restoreState.libraryView;
      let resolvedRestoreShowReadItems = restoreState.showReadItems;

      if (restoreState.section === "read" && restoreState.activeItemId && restoreState.libraryView === "inbox") {
        try {
          const restoredItemPayload = await fetchWorkspace<ItemDetailPayload>(
            `/api/v1/items/${encodeURIComponent(restoreState.activeItemId)}`,
          );
          const inferredRestoreLibraryView = inferLibraryViewForItemState(restoredItemPayload.item);
          if (inferredRestoreLibraryView !== "inbox") {
            resolvedRestoreLibraryView = inferredRestoreLibraryView;
            resolvedRestoreShowReadItems = restoredViewPreferences[inferredRestoreLibraryView].showReadItems;
          }
        } catch {
          // Keep the bundle-provided inbox view when the post-import item detail is temporarily unavailable.
        }
      }

      const restoredViewPreference = restoredViewPreferences[resolvedRestoreLibraryView];
      const restoredContinuitySnapshot: ReaderContinuitySnapshot = {
        section: restoreState.section,
        activeItemId: restoreState.activeItemId,
        readingItemId: restoreState.readingItemId,
        showReadItems: resolvedRestoreShowReadItems,
        libraryView: resolvedRestoreLibraryView,
        itemSearch: restoreState.itemSearch,
      };

      setViewPreferences(restoredViewPreferences);
      setPreferredSection(restoreState.section);
      dispatchReader({
        type: "restore_boot_state",
        state: {
          activeItemId: restoreState.activeItemId,
          itemSearch: restoreState.itemSearch,
          itemSortMode: restoredViewPreference.sort,
          libraryView: resolvedRestoreLibraryView,
          readingItemId: restoreState.readingItemId,
          readSurfaceMode: restoreState.readingItemId ? "article" : "browse",
          showReadItems: resolvedRestoreShowReadItems,
        },
      });
      dispatchReaderDisplay({
        type: "restore_display_state",
        state: {
          isCompactList: restoredViewPreference.density === "compact",
          isFocusedMode: restoreState.focusedMode,
          readerImageMode: restoreState.imageMode,
          readerTextMode: restoreState.textMode,
          readerWidthMode: restoreState.widthMode,
        },
      });
      markReaderProgressRestorePending(restoreState.progressByItemId);
      setReaderProgress(restoreState.progressByItemId);

      const restoreHref = buildAppHref({
        section: restoreState.section,
        libraryView: resolvedRestoreLibraryView,
        scope: resolvedRestoreShowReadItems ? "all" : "unread",
        sort: restoredViewPreference.sort,
        q: restoreState.itemSearch.trim() || null,
        item: restoreState.activeItemId,
        surface:
          restoreState.section === "read" &&
          restoreState.activeItemId &&
          restoreState.readingItemId &&
          restoreState.activeItemId === restoreState.readingItemId
            ? "article"
            : null,
      });

      pendingContinuityRouteRestoreRef.current = {
        href: restoreHref,
        section: restoreState.section,
        continuity: restoredContinuitySnapshot,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(readerPreferenceKeys.continuity, JSON.stringify(restoredContinuitySnapshot));
        window.localStorage.setItem(readerPreferenceKeys.progress, JSON.stringify(restoreState.progressByItemId));
        window.history.replaceState(null, "", restoreHref);
      }

      router.replace(restoreHref);

      await Promise.all([loadChannels(), loadWorkspaceOverview()]);

      const feedbackLines = [
        `Dopasowano ${payload.matched_item_count} ${payload.matched_item_count === 1 ? "artykul" : "artykulow"} i odtworzono lokalny kontekst czytnika.`,
      ];
      if (payload.imported_source_count > 0 || payload.duplicate_source_count > 0) {
        feedbackLines.push(
          `Feedy: +${payload.imported_source_count}, duplikaty pominiete: ${payload.duplicate_source_count}.`,
        );
      }
      if (
        payload.restored_annotation_count > 0 ||
        payload.restored_tag_assignment_count > 0 ||
        payload.restored_collection_item_count > 0 ||
        payload.restored_saved_search_count > 0
      ) {
        feedbackLines.push(
          `Warstwa wiedzy: notatki i podkreslenia ${payload.restored_annotation_count}, tagi ${payload.restored_tag_assignment_count}, kolekcje ${payload.restored_collection_item_count}, zapisane wyszukiwania ${payload.restored_saved_search_count}.`,
        );
      }
      if (payload.unmatched_item_count > 0) {
        feedbackLines.push(
          `${payload.unmatched_item_count} pozycji nie dopasowano jeszcze lokalnie. Po synchronizacji mozesz zaimportowac bundle ponownie, aby odzyskac ich stany.`,
        );
      }
      setFeedback({
        tone: "success",
        title: "Continuity bundle odtworzony",
        lines: feedbackLines,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie odtworzyc continuity bundle",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      event.target.value = "";
      setWorkspaceImportBusy(false);
    }
  }

  function handleOpmlDraftChange(value: string) {
    setOpmlDraft(value);
    setOpmlPreview(null);
  }

  async function handlePreviewOpmlImport() {
    if (!opmlDraft.trim()) {
      return;
    }
    setOpmlImportBusy(true);
    try {
      const { response, payload } = await fetchApi<SourceOpmlPreviewPayload>("/api/v1/source-management/opml/import/preview", {
        method: "POST",
        body: JSON.stringify({ opml_content: opmlDraft.trim() }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się sprawdzić OPML."));
      }
      setOpmlPreview(payload);
      setFeedback({
        tone: "success",
        title: "Podgląd OPML gotowy",
        lines: [
          `Nowe źródła: ${payload.summary.new_feeds}, duplikaty: ${payload.summary.existing_feeds + payload.summary.duplicate_feeds}.`,
          `Foldery: ${payload.summary.folder_count}, błędne wpisy: ${payload.summary.invalid_feeds}.`,
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udało się sprawdzić OPML",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setOpmlImportBusy(false);
    }
  }

  async function handleReaderFeedback(itemId: string, action: ReaderFeedbackAction) {
    const item = items.find((entry) => entry.id === itemId) ?? (selectedItem?.id === itemId ? selectedItem : null);
    if (!item) {
      return;
    }
    setItemActionId(itemId);
    try {
      await fetchWorkspace<ReaderFeedbackPayload>("/api/v1/workspace/feedback", {
        method: "POST",
        body: JSON.stringify({
          action,
          item_id: itemId,
          source_id: item.channel_id,
          reason: "reader_action",
        }),
      });
      await loadWorkspaceOverview();
      setFeedback({
        tone: "success",
        title:
          action === "more_like_this" || action === "important"
            ? "Zapamietalem, ze to jest wazne"
            : action === "mute_source"
              ? "Zrodlo zostalo wyciszone"
              : action === "hide_topic"
                ? "Temat zostal ukryty"
                : "Podobne wpisy beda ukrywane",
        lines: [
          action === "more_like_this" || action === "important"
            ? "Ranking Dla mnie bedzie mocniej szukal podobnych tekstow."
            : "Ranking Dla mnie odswiezyl sygnaly i ograniczy podobny szum.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac feedbacku czytelnika",
        lines: [error instanceof Error ? error.message : "Nieznany blad rankingu."],
      });
    } finally {
      setItemActionId(null);
    }
  }

  async function handleImportOpml() {
    if (!opmlDraft.trim()) {
      return;
    }
    if (!opmlPreview) {
      await handlePreviewOpmlImport();
      return;
    }
    setOpmlImportBusy(true);
    try {
      const { response, payload } = await fetchApi<SourceOpmlImportPayload>("/api/v1/source-management/opml/import", {
        method: "POST",
        body: JSON.stringify({ opml_content: opmlDraft.trim() }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się zaimportować OPML."));
      }
      setOpmlDraft("");
      setOpmlPreview(null);
      await Promise.all([loadChannels(), loadWorkspaceOverview()]);
      setFeedback({
        tone: "success",
        title: "Import OPML zakończony",
        lines: [
          `Zaimportowano ${payload.summary.new_feeds} ${payload.summary.new_feeds === 1 ? "źródło" : "źródła"}.`,
          `Pominięto ${payload.summary.existing_feeds + payload.summary.duplicate_feeds} duplikatów.`,
          "Możesz teraz pobrać wpisy z aktywnych źródeł.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udało się zaimportować OPML",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setOpmlImportBusy(false);
    }
  }

  function buildItemQueryParams(cursor?: string) {
    const params = new URLSearchParams({
      limit: "40",
    });

    if (libraryView === "digest") {
      params.set("digest_candidate", "true");
    } else {
      params.set("view", libraryView === "continue" ? "inbox" : libraryView);
    }

    if (cursor) {
      params.set("cursor", cursor);
    }
    params.set("sort", itemSortMode);
    if (!showReadItems && libraryView !== "archive") {
      params.set("is_read", "false");
    }
    if (deferredItemSearch.trim()) {
      params.set("search", deferredItemSearch.trim());
    }
    const publishedAfter = getPublishedAfterForRecallWindow(recallWindow);
    if (publishedAfter) {
      params.set("published_after", publishedAfter);
    }

    return params;
  }

  async function loadItems(options?: { signal?: AbortSignal; cursor?: string; append?: boolean }) {
    const { signal, cursor, append = false } = options ?? {};

    if (!append && (items.length === 0 || itemsStatus === "error" || itemsStatus === "unsupported")) {
      setItemsStatus("loading");
    } else {
      setItemsRefreshing(true);
    }

    try {
      const { response, payload } = await fetchApi<ItemListPayload>(`/api/v1/items?${buildItemQueryParams(cursor).toString()}`, {
        signal,
      });

      if (!response.ok) {
        if (isUnsupportedEndpoint(response.status)) {
          setItems([]);
          setItemsPage(null);
          setItemsStatus("unsupported");
          setItemsMessage("Endpoint biblioteki artykulow jest niedostepny w tym runtime.");
          return;
        }

        setItemsStatus("error");
        setItemsMessage(getPayloadMessage(payload, "Nie udalo sie wczytac artykulow."));
        return;
      }

      if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) {
        setItemsStatus("error");
        setItemsMessage("API zwrocilo nieoczekiwany payload listy artykulow.");
        return;
      }

      startTransition(() => {
        setItems((current) =>
          append
            ? [
                ...current,
                ...payload.items.filter((candidate) => !current.some((existing) => existing.id === candidate.id)),
              ]
            : payload.items,
        );
        setItemsPage(payload.page ?? null);
      });
      setItemsStatus("ready");
      setItemsMessage(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setItemsStatus("error");
      setItemsMessage(error instanceof Error ? error.message : "Nieznany blad przegladarki.");
    } finally {
      setItemsRefreshing(false);
    }
  }

  async function loadMoreItems() {
    if (!itemsPage?.has_more || !itemsPage.next_cursor || itemsRefreshing) {
      return;
    }

    await loadItems({
      cursor: itemsPage.next_cursor,
      append: true,
    });
  }

  useEffect(() => {
    void loadAuthSession();
  }, [apiBaseUrl]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }

    async function loadDashboard() {
      try {
        await Promise.all([
          loadChannels(),
          loadSyncRuns(),
          loadDigestHistory(),
          loadAISettings(),
          loadDeliverySettings(),
          loadWorkspaceOverview(),
          loadAnnotationHub(""),
        ]);
      } catch (error) {
        setFeedback({
          tone: "error",
          title: "Nie udalo sie polaczyc z API",
          lines: [error instanceof Error ? error.message : "Nieznany blad frontendu."],
        });
      }
    }

    void loadDashboard();
  }, [apiBaseUrl, authStatus]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    void loadDeliveryLogs(latestDigest?.id);
  }, [apiBaseUrl, authStatus, latestDigest?.id]);

  useEffect(() => {
    setSelectedMagazineIssueId((current) => {
      const requestedIssue =
        currentSection === "magazines" && requestedMagazineIssueId && digestHistory.some((issue) => issue.id === requestedMagazineIssueId)
          ? requestedMagazineIssueId
          : null;
      if (requestedIssue) {
        return requestedIssue;
      }

      if (current && digestHistory.some((issue) => issue.id === current)) {
        return current;
      }

      return digestHistory[0]?.id ?? null;
    });
  }, [currentSection, digestHistory, requestedMagazineIssueId]);

  useEffect(() => {
    if (authStatus !== "ready" || currentSection !== "magazines" || !selectedMagazineIssue) {
      return;
    }

    const articlesToHydrate = selectedMagazineIssue.selection_snapshot.filter((article) => {
      const hydrationKey = `${selectedMagazineIssue.id}:${article.item_id}`;
      return article.item_id && !article.content_html && !magazineHydrationAttemptedRef.current.has(hydrationKey);
    });

    if (articlesToHydrate.length === 0) {
      return;
    }

    const controller = new AbortController();
    for (const article of articlesToHydrate) {
      magazineHydrationAttemptedRef.current.add(`${selectedMagazineIssue.id}:${article.item_id}`);
    }

    async function hydrateMagazineIssueArticles() {
      const hydratedEntries = await Promise.all(
        articlesToHydrate.map(async (article) => {
          try {
            const { response, payload } = await fetchApi<ItemDetailPayload>(`/api/v1/items/${encodeURIComponent(article.item_id)}`, {
              signal: controller.signal,
            });
            if (!response.ok || isErrorEnvelope(payload)) {
              return null;
            }

            return buildMagazineArticleHydration(payload.item, article.title);
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              throw error;
            }
            return null;
          }
        }),
      );

      const hydrationByItemId = new Map(
        hydratedEntries
          .filter((entry): entry is MagazineArticleHydration => Boolean(entry?.contentHtml || entry?.excerpt))
          .map((entry) => [entry.itemId, entry]),
      );

      if (hydrationByItemId.size === 0 || controller.signal.aborted) {
        return;
      }

      startTransition(() => {
        setDigestHistory((current) =>
          current.map((issue) => {
            if (issue.id !== selectedMagazineIssue.id) {
              return issue;
            }

            return {
              ...issue,
              selection_snapshot: issue.selection_snapshot.map((article) => {
                const hydrated = hydrationByItemId.get(article.item_id);
                if (!hydrated) {
                  return article;
                }

                return {
                  ...article,
                  author: article.author ?? hydrated.author,
                  category: article.category ?? hydrated.category,
                  channel_title: article.channel_title ?? hydrated.channelTitle,
                  content_html: article.content_html ?? hydrated.contentHtml,
                  excerpt: article.excerpt ?? hydrated.excerpt,
                  word_count: article.word_count ?? hydrated.wordCount,
                };
              }),
            };
          }),
        );
      });
    }

    void hydrateMagazineIssueArticles();

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, currentSection, selectedMagazineIssue]);

  useEffect(() => {
    if (authStatus !== "ready" || (currentSection !== "digest" && currentSection !== "magazines")) {
      return;
    }
    const controller = new AbortController();
    void loadDigestCandidatePreview({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, currentSection]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    void loadSelectedItemWorkspace(selectedItem?.id ?? null);
  }, [apiBaseUrl, authStatus, selectedItem?.id]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadAnnotationHub(annotationHubQuery);
    }, annotationHubQuery.trim() ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [annotationHubQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      setSelectedTextQuote(text.length >= 12 ? text : "");
    }

    window.document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (authStatus !== "ready") {
      return;
    }

    const controller = new AbortController();
    void loadItems({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, deferredItemSearch, itemSortMode, libraryView, preferencesReady, recallWindow, showReadItems]);

  useEffect(() => {
    const shouldPreserveActiveItemId = requestedReadSurface === "article" || currentSection !== "read";
    dispatchReader({
      type: "sync_active_item_with_queue",
      itemIds: queueItems.map((item) => item.id),
      preserveMissingActiveItemId: shouldPreserveActiveItemId,
    });
  }, [currentSection, queueItems, requestedReadSurface]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const bootState = resolveStoredReaderBootState({
      location: window.location,
      storage: window.localStorage,
    });
    const bootReadSearch = parseReadRouteSearch(window.location.search);

    setPreferredSection(bootState.preferredSection);
    setReaderQueueMode(bootReadSearch.mode ?? (bootReadSearch.scope === "all" ? "all" : "for_you"));
    setViewPreferences(bootState.viewPreferences);
    dispatchReaderDisplay({
      type: "restore_display_state",
      state: bootState.displayState,
    });
    dispatchReader({
      type: "restore_boot_state",
      state: bootState.readerState,
    });

    if (Object.keys(bootState.progressByItemId).length > 0) {
      markReaderProgressRestorePending(bootState.progressByItemId);
      setReaderProgress(bootState.progressByItemId);
      readingProgressRef.current = bootState.progressByItemId;
    }

    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    const preference = viewPreferences[libraryView];
    if (!preference) {
      return;
    }

    if (
      !shouldApplyReaderViewPreference(preference, {
        showReadItems,
        itemSortMode,
        isCompactList,
      })
    ) {
      return;
    }

    const nextControls = getReaderViewControlsFromPreference(preference);
    applyingViewPreferenceRef.current = true;

    // Apply stored per-view controls only when switching/restoring views; direct user edits persist below.
    if (showReadItems !== nextControls.showReadItems) {
      setReaderShowReadItems(nextControls.showReadItems);
    }
    if (itemSortMode !== nextControls.itemSortMode) {
      setReaderItemSortMode(nextControls.itemSortMode);
    }
    if (isCompactList !== nextControls.isCompactList) {
      setIsCompactList(nextControls.isCompactList);
    }
  }, [libraryView, preferencesReady, viewPreferences]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (applyingViewPreferenceRef.current) {
      applyingViewPreferenceRef.current = false;
      return;
    }

    const density: ViewDensity = isCompactList ? "compact" : "comfortable";
    setViewPreferences((current) => {
      const currentPreference = current[libraryView];
      if (
        currentPreference &&
        currentPreference.showReadItems === showReadItems &&
        currentPreference.sort === itemSortMode &&
        currentPreference.density === density
      ) {
        return current;
      }

      return patchViewPreferenceMap(current, libraryView, {
        showReadItems,
        sort: itemSortMode,
        density,
      });
    });
  }, [isCompactList, itemSortMode, libraryView, preferencesReady, showReadItems]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.focused, String(isFocusedMode));
  }, [isFocusedMode, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.width, readerWidthMode);
  }, [preferencesReady, readerWidthMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.textMode, readerTextMode);
  }, [preferencesReady, readerTextMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.imageMode, readerImageMode);
  }, [preferencesReady, readerImageMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.viewPreferences, JSON.stringify(viewPreferences));
  }, [preferencesReady, viewPreferences]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    const currentUrl = buildBrowserPath(window.location);
    if (
      shouldHoldForPendingRouteRestore({
        currentSection: routeState.section,
        currentUrl,
        pending: pendingContinuityRouteRestoreRef.current,
      })
    ) {
      return;
    }

    const continuity: ReaderContinuitySnapshot = {
      section: currentSection,
      activeItemId,
      readingItemId,
      showReadItems,
      libraryView,
      itemSearch,
    };

    window.localStorage.setItem(readerPreferenceKeys.continuity, JSON.stringify(continuity));
  }, [activeItemId, currentSection, itemSearch, libraryView, preferencesReady, readingItemId, showReadItems]);

  useEffect(() => {
    if (routeState.section !== "read") {
      return;
    }

    lastReadLibraryViewRef.current = routeState.libraryView;
    lastReadShowReadItemsRef.current = viewPreferences[routeState.libraryView]?.showReadItems ?? showReadItems;
  }, [routeState.libraryView, routeState.section, showReadItems, viewPreferences]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const pendingRouteRestore = pendingContinuityRouteRestoreRef.current;
    if (!pendingRouteRestore) {
      return;
    }

    const currentUrl = buildBrowserPath(window.location);
    if (currentUrl === pendingRouteRestore.href && routeState.section === pendingRouteRestore.section) {
      pendingContinuityRouteRestoreRef.current = null;
    }
  }, [pathname, routeState.section, searchParams]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (routeState.section) {
      if (typeof window !== "undefined") {
        const currentUrl = buildBrowserPath(window.location);
        if (
          shouldHoldForPendingRouteRestore({
            currentSection: routeState.section,
            currentUrl,
            pending: pendingContinuityRouteRestoreRef.current,
          })
        ) {
          return;
        }
      }

      const nextSection = routeState.section;
      setPreferredSection((current) => (current === nextSection ? current : nextSection));
    }
  }, [preferencesReady, routeState.section]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentSection, libraryView, pathname]);

  useEffect(() => {
    if (currentSection !== "read") {
      return;
    }

    const shouldOpenRequestedArticle = requestedReadSurface === "article" && activeItemId;
    dispatchReader({
      type: "sync_requested_article_surface",
      shouldOpenArticle: Boolean(shouldOpenRequestedArticle),
    });
  }, [activeItemId, currentSection, requestedReadSurface]);

  useEffect(() => {
    if (currentSection !== "read" || isFocusedMode) {
      setShowReadInspector(false);
    }
  }, [currentSection, isFocusedMode]);

  useEffect(() => {
    if (selectedTextQuote.trim()) {
      setShowReadInspector(true);
    }
  }, [selectedTextQuote]);

  useEffect(() => {
    if (!preferencesReady || routeState.section !== "read" || routeState.libraryView === libraryView) {
      return;
    }

    setReaderLibraryView(routeState.libraryView);
  }, [libraryView, preferencesReady, routeState.libraryView, routeState.section]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    if (window.location.pathname === "/") {
      return;
    }

    const currentUrl = buildBrowserPath(window.location);
    if (
      shouldHoldForPendingRouteRestore({
        currentSection: routeState.section,
        currentUrl,
        pending: pendingContinuityRouteRestoreRef.current,
      })
    ) {
      return;
    }

    const shouldPersistArticleSurface =
      currentSection === "read" &&
      Boolean(activeItemId) &&
      readSurfaceMode === "article" &&
      (readingItemId === activeItemId || requestedReadSurface === "article");

    if (currentSection === "magazines" && requestedMagazineIssueId && !selectedMagazineIssueId) {
      return;
    }

    const nextUrl = buildAppHref({
      section: currentSection,
      libraryView,
      scope: showReadItems ? "all" : "unread",
      sort: itemSortMode,
      q: itemSearch.trim() || null,
      item: activeItemId,
      surface: shouldPersistArticleSurface ? "article" : null,
      issue: currentSection === "magazines" ? selectedMagazineIssueId : null,
      mode: currentSection === "read" ? readerQueueMode : null,
    });
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    activeItemId,
    currentSection,
    itemSearch,
    itemSortMode,
    libraryView,
    preferencesReady,
    readSurfaceMode,
    readingItemId,
    requestedMagazineIssueId,
    requestedReadSurface,
    readerQueueMode,
    selectedMagazineIssueId,
    showReadItems,
  ]);

  useEffect(() => {
    if (!preferencesReady || pathname !== "/") {
      return;
    }

    router.replace(
      buildAppHref({
        section: preferredSection,
        libraryView,
        scope: showReadItems ? "all" : "unread",
        sort: itemSortMode,
        q: itemSearch.trim() || null,
        item: activeItemId,
        mode: preferredSection === "read" ? readerQueueMode : null,
        surface:
          preferredSection === "read" && readSurfaceMode === "article" && readingItemId && readingItemId === activeItemId
            ? "article"
            : null,
      }),
    );
  }, [
    activeItemId,
    itemSearch,
    itemSortMode,
    libraryView,
    pathname,
    preferencesReady,
    preferredSection,
    readSurfaceMode,
    readerQueueMode,
    readingItemId,
    router,
    showReadItems,
  ]);

  useEffect(() => {
    readingProgressRef.current = readerProgress;
  }, [readerProgress]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.progress, JSON.stringify(readerProgress));
  }, [preferencesReady, readerProgress]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const row = itemRowRefs.current.get(selectedItem.id);
    row?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      if (readSurfaceMode === "article" && activeItemId) {
        return;
      }
      dispatchReader({
        type: "sync_reading_item_with_selection",
        selectedItemId: null,
      });
      return;
    }

    dispatchReader({
      type: "sync_reading_item_with_selection",
      selectedItemId: selectedItem.id,
    });
  }, [activeItemId, readSurfaceMode, selectedItem?.id]);

  useEffect(() => {
    dispatchReader({
      type: "filter_selection_to_visible",
      visibleItemIds: queueItems.map((item) => item.id),
    });
  }, [queueItems]);

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id) {
      return;
    }

    articleContentRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [readingItemId, selectedItem?.id, itemDetailStatus]);

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }

    const snapshot = readerProgress[selectedItem.id];
    if (!snapshot) {
      return;
    }

    const applyRestoredScroll = () => {
      if (articleContentRef.current) {
        const { maxScroll, target } = getReaderScrollSnapshot(articleContentRef.current);
        const nextScrollTop = Math.max(0, Math.min(snapshot.scrollTop, maxScroll));
        if (target === "document") {
          window.scrollTo({
            top: nextScrollTop,
            behavior: "auto",
          });
        } else {
          articleContentRef.current.scrollTop = nextScrollTop;
        }
      }
    };

    const timers = [
      window.setTimeout(applyRestoredScroll, 80),
      window.setTimeout(applyRestoredScroll, 220),
      window.setTimeout(applyRestoredScroll, 480),
      window.setTimeout(applyRestoredScroll, 900),
      window.setTimeout(() => {
        applyRestoredScroll();
        delete pendingReaderProgressRestoreRef.current[selectedItem.id];
      }, 1600),
    ];

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [readerProgress, readingItemId, selectedItem?.id, itemDetailStatus]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }

    if (!selectedItem) {
      setItemDetail(null);
      setItemDetailStatus("ready");
      setItemDetailMessage(null);
      return;
    }

    const controller = new AbortController();

    async function loadItemDetail(itemId: string, signal: AbortSignal) {
      setItemDetailStatus("loading");
      setItemDetailMessage(null);

      try {
        const { response, payload } = await fetchApi<ItemDetailPayload>(`/api/v1/items/${itemId}`, {
          signal,
        });

        if (!response.ok) {
          if (isUnsupportedEndpoint(response.status)) {
            setItemDetailStatus("unsupported");
            setItemDetailMessage("Item detail endpoint is not available yet. Falling back to list metadata.");
            return;
          }

          setItemDetailStatus("error");
          setItemDetailMessage(getPayloadMessage(payload, "Nie udalo sie wczytac szczegolow artykulu."));
          return;
        }

        if (!payload || typeof payload !== "object" || !("item" in payload)) {
          setItemDetailStatus("error");
          setItemDetailMessage("The API returned an unexpected article detail payload.");
          return;
        }

        startTransition(() => {
          setItemDetail(payload.item);
        });
        setItemDetailStatus("ready");
        setItemDetailMessage(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setItemDetailStatus("error");
        setItemDetailMessage(error instanceof Error ? error.message : "Nieznany blad przegladarki.");
      }
    }

    void loadItemDetail(selectedItem.id, controller.signal);

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, selectedItem?.id]);

  function cancelSourcePreviewRequest() {
    sourcePreviewRequestIdRef.current += 1;
    sourcePreviewAbortRef.current?.abort();
    sourcePreviewAbortRef.current = null;
    setSourcePreviewSlow(false);
    setPreviewBusy(false);
  }

  function resetSourcePreviewState(options?: { clearFeedbackError?: boolean; clearPreview?: boolean }) {
    cancelSourcePreviewRequest();
    lastSourcePreviewKeyRef.current = null;
    if (options?.clearPreview ?? true) {
      setChannelPreview(null);
    }
    if (options?.clearFeedbackError && feedback.tone === "error") {
      setFeedback(initialFeedback);
    }
  }

  const requestSourcePreview = useEffectEvent(
    async ({
      origin = "manual",
      overrideInput,
    }: {
      origin?: "manual" | "auto";
      overrideInput?: string;
    } = {}) => {
      const resolvedInput = (overrideInput ?? inputUrl).trim();
      if (!resolvedInput) {
        resetSourcePreviewState();
        return;
      }

      const previewMode = sourceAddMode === "web_feed" ? "web_feed" : "website";
      const requestKey = buildSourcePreviewRequestKey(previewMode, resolvedInput);
      if (requestKey) {
        lastSourcePreviewKeyRef.current = requestKey;
      }

      const requestId = sourcePreviewRequestIdRef.current + 1;
      sourcePreviewRequestIdRef.current = requestId;
      sourcePreviewAbortRef.current?.abort();
      const controller = new AbortController();
      sourcePreviewAbortRef.current = controller;
      setPreviewBusy(true);
      setSourcePreviewSlow(false);

      if (origin === "manual") {
        setFeedback({
          tone: "idle",
          title: "Podgląd źródła",
          lines: ["Sprawdzam bezpośredni feed, wykrywanie na stronie i heurystyki RSS. Nic nie zapisuję bez potwierdzenia."],
        });
      }

      try {
        const response = await fetch("/api/v1/channels/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            input_url: resolvedInput,
          }),
        });

        const payload = (await readResponsePayload(response)) as ChannelPreviewPayload | ApiErrorEnvelope;
        if (requestId !== sourcePreviewRequestIdRef.current) {
          return;
        }

        const upstreamStatus = Number.parseInt(response.headers.get("x-rssmaster-upstream-status") ?? "", 10);
        const responseStatus = Number.isFinite(upstreamStatus) ? upstreamStatus : response.status;

        if (responseStatus >= 400) {
          const previewFailureKind =
            isErrorEnvelope(payload) && typeof payload.error?.details?.preview_failure_kind === "string"
              ? payload.error.details.preview_failure_kind
              : null;
          const failure = classifySourcePreviewFailure({
            httpStatus: responseStatus,
            errorCode: isErrorEnvelope(payload) ? payload.error?.code ?? null : null,
            previewFailureKind,
          });
          const lines = [getSourcePreviewFailureDescription(failure)];
          const candidates = isErrorEnvelope(payload) ? payload.error?.details?.candidates : undefined;
          if (Array.isArray(candidates) && candidates.length > 0) {
            lines.push("Wykryte kandydaty:");
            lines.push(...candidates);
          }

          setChannelPreview(null);
          setFeedback({
            tone: "error",
            title: getSourcePreviewFailureLabel(failure),
            lines,
          });
          if (origin === "manual") {
            pendingSourceFocusTargetRef.current = "results";
          }
          return;
        }

        if (isErrorEnvelope(payload) || !payload) {
          setChannelPreview(null);
          setFeedback({
            tone: "error",
            title: "channel_preview_failed",
            lines: [isErrorEnvelope(payload) ? payload.error?.message ?? "Podgląd źródła nie powiódł się." : "Podgląd źródła nie powiódł się."],
          });
          if (origin === "manual") {
            pendingSourceFocusTargetRef.current = "results";
          }
          return;
        }

        setChannelPreview(payload);
        setFeedback({
          tone: "idle",
          title: getPreviewTitle(payload),
          lines:
            payload.status === "multiple_candidates"
              ? [
                  `Tryb wykrywania: ${payload.discovery.mode}`,
                  `Wybierz 1 z ${payload.candidates.length} poprawnych feedów do obserwowania.`,
                ]
              : payload.status === "already_subscribed"
                ? [
                    `Już obserwujesz: ${payload.existing_channel?.title ?? payload.feed?.title ?? "istniejące źródło"}`,
                    `Rozwiązany feed: ${payload.discovery.resolved_feed_url ?? payload.feed?.feed_url ?? "nieznany"}`,
                  ]
                : [
                    `Tryb wykrywania: ${payload.discovery.mode}`,
                  `Rozwiązany feed: ${payload.discovery.resolved_feed_url ?? payload.feed?.feed_url ?? "nieznany"}`,
                ],
        });
        if (origin === "manual") {
          pendingSourceFocusTargetRef.current = "results";
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (requestId !== sourcePreviewRequestIdRef.current) {
          return;
        }

        setChannelPreview(null);
        setFeedback({
          tone: "error",
          title: "Zadanie nie powiodło się",
          lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
        });
        if (origin === "manual") {
          pendingSourceFocusTargetRef.current = "results";
        }
      } finally {
        if (requestId === sourcePreviewRequestIdRef.current) {
          if (sourcePreviewAbortRef.current === controller) {
            sourcePreviewAbortRef.current = null;
          }
          setSourcePreviewSlow(false);
          setPreviewBusy(false);
        }
      }
    },
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestSourcePreview({ origin: "manual" });
  }

  function activateSourceAddMode(nextMode: SourceAddModeId, focusTarget: "input" | "import") {
    cancelSourcePreviewRequest();
    lastSourcePreviewKeyRef.current = null;
    setChannelPreview(null);
    setLastAddedSource(null);
    setSourceLanguageFilter("all");
    setShowSourceOptions(false);
    setSourceSurfaceMode("add");
    setSourceAddMode(nextMode);
    pendingSourceFocusTargetRef.current = focusTarget;
    if (feedback.tone === "error") {
      setFeedback(initialFeedback);
    }
  }

  function handleSourceDraftInputChange(nextValue: string) {
    setInputUrl(nextValue);
    setLastAddedSource(null);

    const previewMode = sourceAddMode === "web_feed" ? "web_feed" : "website";
    const nextRequestKey = buildSourcePreviewRequestKey(previewMode, nextValue);

    if (!nextValue.trim()) {
      resetSourcePreviewState({ clearFeedbackError: true });
      return;
    }

    if (!nextRequestKey) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      setChannelPreview(null);
      return;
    }

    if (nextRequestKey !== lastSourcePreviewKeyRef.current) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      setChannelPreview(null);
      if (feedback.tone === "error") {
        setFeedback(initialFeedback);
      }
    }
  }

  useEffect(() => {
    if (sourceAddMode !== "website") {
      const switchedAwayFromWebsite = previousSourceAddModeRef.current === "website";
      previousSourceAddModeRef.current = sourceAddMode;
      if (switchedAwayFromWebsite && previewBusy) {
        cancelSourcePreviewRequest();
        lastSourcePreviewKeyRef.current = null;
      }
      return;
    }
    previousSourceAddModeRef.current = sourceAddMode;

    const requestKey = buildSourcePreviewRequestKey("website", inputUrl);
    if (!requestKey) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      if (!inputUrl.trim()) {
        setChannelPreview(null);
      }
      return;
    }

    if (requestKey === lastSourcePreviewKeyRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void requestSourcePreview({ origin: "auto", overrideInput: inputUrl });
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [inputUrl, previewBusy, requestSourcePreview, sourceAddMode]);

  async function handleConfirmChannelAdd(feedUrl?: string) {
    const resolvedUrl = feedUrl ?? channelPreview?.feed?.feed_url ?? inputUrl.trim();
    if (!resolvedUrl) {
      return;
    }

    setSubscribeBusy(true);
    setFeedback({
      tone: "idle",
      title: "Zapisywanie źródła",
      lines: ["Wybrany feed jest teraz dodawany do biblioteki. Po zapisie pokażemy kolejny krok: pobranie wpisów."],
    });

    try {
      const { response, payload } = await fetchApi<SourceCreatePayload>("/api/v1/source-management/sources", {
        method: "POST",
        body: JSON.stringify({
          ...(feedUrl || channelPreview?.feed?.feed_url
            ? { feed_url: resolvedUrl }
            : { input_url: resolvedUrl }),
          category: category || undefined,
          initial_sync: "none",
          on_duplicate: "return_existing",
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setFeedback({
          tone: "error",
          title: isErrorEnvelope(payload) ? payload.error?.code ?? "channel_add_failed" : "channel_add_failed",
          lines: [getPayloadMessage(payload, "Dodanie źródła nie powiodło się.")],
        });
        return;
      }

      await loadChannels();
      setInputUrl("");
      setCategory("");
      resetSourcePreviewState();
      setShowSourceOptions(false);
      setSourceSurfaceMode("add");
      setLastAddedSource(payload.source);
      setFeedback({
        tone: "success",
        title:
          payload.status === "existing"
            ? "Źródło jest już w bibliotece"
            : payload.status === "reactivated"
              ? "Źródło przywrócone"
              : "Źródło zapisane",
        lines: [
          `Wykrywanie feedu: ${payload.discovery.mode}.`,
          `Adres feedu: ${payload.discovery.resolved_feed_url ?? payload.source.feed_url}.`,
          "Teraz pobierz pierwsze wpisy, żeby źródło pojawiło się w czytniku i w stanie zdrowia.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodło się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setSubscribeBusy(false);
    }
  }

  function handleSourceSuccessAddNext() {
    setLastAddedSource(null);
    setInputUrl("");
    setCategory("");
    resetSourcePreviewState();
    setShowSourceOptions(false);
    setSourceSurfaceMode("add");
    setSourceAddMode("website");
    pendingSourceFocusTargetRef.current = "input";
    setFeedback(initialFeedback);
    window.setTimeout(() => {
      sourceInputRef.current?.focus();
    }, 0);
  }

  function handleSourceSuccessOpen() {
    if (!lastAddedSource) {
      return;
    }
    setReaderFeedFilter({ kind: "channel", value: lastAddedSource.id });
    router.push(
      buildAppHref({
        section: "read",
        libraryView: "inbox",
        scope: "all",
        sort: itemSortMode,
        q: null,
      }),
    );
  }

  async function handleSourceSuccessSync() {
    if (!lastAddedSource) {
      return;
    }
    setIsSyncing(true);
    setFeedback({
      tone: "idle",
      title: "Pobieranie pierwszych wpisów",
      lines: [`Tworzę zadanie pobierania tylko dla źródła: ${lastAddedSource.title}.`],
    });

    try {
      const { response, payload } = await fetchApi<SourceSyncPayload>(
        `/api/v1/source-management/sources/${lastAddedSource.id}/sync`,
        {
          method: "POST",
        },
      );
      if (!response.ok || isErrorEnvelope(payload)) {
        setIsSyncing(false);
        setFeedback({
          tone: "error",
          title: isErrorEnvelope(payload) ? payload.error?.code ?? "source_sync_failed" : "source_sync_failed",
          lines: [getPayloadMessage(payload, "Nie udało się pobrać pierwszych wpisów.")],
        });
        return;
      }

      upsertRun(payload.run);
      setFeedback({
        tone: "idle",
        title: "Pobieranie wpisów uruchomione",
        lines: [
          `Zadanie ${payload.run.id} zostało zapisane i działa w tle.`,
          "Po zakończeniu odświeżymy kolejkę czytnika i status źródła.",
        ],
      });
      void pollRun(payload.run.id);
    } catch (error) {
      setIsSyncing(false);
      setFeedback({
        tone: "error",
        title: "Pobieranie wpisów nie powiodło się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    }
  }

  async function pollRun(runId: string) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await sleep(800);

      try {
        const { response, payload } = await fetchApi<SyncRunPayload>(`/api/v1/sync/runs/${runId}`);
        if (!response.ok || isErrorEnvelope(payload)) {
          continue;
        }

        upsertRun(payload.run);
        if (!terminalSyncStates.has(payload.run.status)) {
          continue;
        }

        setIsSyncing(false);
        try {
          await Promise.all([loadChannels(), loadSyncRuns(), loadItems(), loadWorkspaceOverview()]);
        } catch {
          // Keep the terminal run visible even if follow-up refreshes fail.
        }

        const summaryLine =
          payload.run.status === "completed"
            ? `Pobieranie zakończone. Nowe wpisy: ${payload.run.items_created}, źródła OK: ${payload.run.channels_succeeded}.`
            : payload.run.status === "partial_success"
              ? `Pobieranie zakończone częściowo. Nieudane źródła: ${payload.run.channels_failed}, zapisane nowe wpisy: ${payload.run.items_created}.`
              : payload.run.error_message ?? "Pobieranie nie zakończyło się poprawnie.";

        setFeedback({
          tone: payload.run.status === "completed" ? "success" : "error",
          title: payload.run.status === "completed" ? "Pierwsze wpisy pobrane" : `Pobieranie: ${payload.run.status}`,
          lines: [
            summaryLine,
            `Widziane wpisy: ${payload.run.items_seen}, pominięte: ${payload.run.items_skipped}.`,
            ...payload.run.errors.slice(0, 3).map((error) => `${error.channel_title}: ${error.message}`),
          ],
        });
        return;
      } catch {
        // Keep polling for transient local runtime delays.
      }
    }

    setIsSyncing(false);
    setFeedback({
      tone: "error",
      title: "Oczekiwanie na pobieranie przekroczyło czas",
      lines: [
        "Uruchomienie zostało przyjęte, ale przeglądarka nie zobaczyła jeszcze stanu końcowego.",
        "Użyj panelu ostatnich zadań, aby sprawdzić zapisany status.",
      ],
    });
  }

  async function handleSyncAll(options: { channelIds?: string[]; label?: string } = {}) {
    const channelIds = options.channelIds?.filter(Boolean) ?? [];
    setIsSyncing(true);
    setFeedback({
      tone: "idle",
      title: "Kolejkowanie pobierania",
      lines: [
        channelIds.length > 0
          ? `Backend tworzy zapisane zadanie pobierania dla: ${options.label ?? channelIds.join(", ")}.`
          : "Backend tworzy zapisane zadanie i pobierze w tle każde aktywne źródło.",
      ],
    });

    try {
      const { response, payload } = await fetchApi<SyncRunPayload>("/api/v1/sync/runs", {
        method: "POST",
        body: JSON.stringify({
          mode: "manual",
          ...(channelIds.length > 0 ? { channel_ids: channelIds } : {}),
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setIsSyncing(false);
        setFeedback({
          tone: "error",
          title: isErrorEnvelope(payload) ? payload.error?.code ?? "sync_queue_failed" : "sync_queue_failed",
          lines: [getPayloadMessage(payload, "Nie udało się uruchomić pobierania.")],
        });
        return;
      }

      upsertRun(payload.run);
      setFeedback({
        tone: "idle",
        title: "Pobieranie przyjęte",
        lines: [
          `Zadanie ${payload.run.id} zostało zapisane i czeka na zakończenie.`,
          "Lista zadań i kolejka czytnika odświeżą się po zakończeniu pracy w tle.",
        ],
      });
      void pollRun(payload.run.id);
    } catch (error) {
      setIsSyncing(false);
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodło się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    }
  }

  async function mutateChannel(
    channelId: string,
    options: {
      body?: Record<string, unknown>;
      method: "PATCH" | "DELETE";
      successLines: string[];
      successTitle: string;
    },
  ) {
    setActiveChannelId(channelId);
    try {
      const { response, payload } = await fetchApi<ChannelMutationPayload>(`/api/v1/channels/${channelId}`, {
        method: options.method,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setFeedback({
          tone: "error",
        title: isErrorEnvelope(payload) ? payload.error?.code ?? "channel_update_failed" : "channel_update_failed",
          lines: [getPayloadMessage(payload, "Aktualizacja kanalu nie powiodla sie.")],
        });
        return;
      }

      startTransition(() => {
        setChannels((current) =>
          current.map((channel) => (channel.id === payload.channel.id ? payload.channel : channel)),
        );
        setDraftCategories((current) => ({
          ...current,
          [payload.channel.id]: payload.channel.category ?? "",
        }));
      });
      setFeedback({
        tone: "success",
        title: options.successTitle,
        lines: options.successLines,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodlo sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setActiveChannelId(null);
    }
  }

  async function mutateItemState(
    item: Item,
    patch: ItemStatePatch,
    options?: {
      recordUndo?: boolean;
      undoLabel?: string;
    },
  ): Promise<boolean> {
    const previous = item;
    const previousDetail = itemDetail && itemDetail.id === item.id ? itemDetail : null;
    const nextItem = applyItemPatch(previous, patch);
    const undoPatch = buildUndoPatch(previous, nextItem);
    const shouldRecordUndo = options?.recordUndo ?? true;

    setItemActionId(item.id);
    setItemsMessage(null);
    startTransition(() => {
      setItems((current) =>
        current.map((candidate) => (candidate.id === item.id ? applyItemPatch(candidate, patch) : candidate)),
      );
      setItemDetail((current) => (current && current.id === item.id ? applyItemPatch(current, patch) : current));
    });

    try {
      const { response, payload } = await fetchApi<ItemMutationPayload>(`/api/v1/items/${item.id}/state`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        if (isUnsupportedEndpoint(response.status)) {
          throw new Error("item_state_endpoint_unavailable");
        }

          throw new Error(getPayloadMessage(payload, "Nie udalo sie zaktualizowac stanu artykulu."));
      }

      if (payload && typeof payload === "object" && "item" in payload) {
        startTransition(() => {
          setItems((current) => current.map((candidate) => (candidate.id === item.id ? payload.item : candidate)));
          setItemDetail((current) => (current && current.id === item.id ? { ...current, ...payload.item } : current));
        });
      }

      if (shouldRecordUndo && undoPatch) {
        pushUndoEntry({
          id: `undo_${Date.now()}_${item.id}`,
          label: options?.undoLabel ?? describeItemMutation(patch),
          operations: [
            {
              item: previous,
              patch: undoPatch,
            },
          ],
        });
      }

      if (patch.library_action || "is_archived" in patch || (libraryView === "saved" && "is_favorite" in patch)) {
        void loadItems();
      }
      if ("digest_candidate" in patch) {
        setDigestPreview(null);
        if (currentSection === "digest" || currentSection === "magazines") {
          void loadDigestCandidatePreview();
        }
      }
      return true;
    } catch (error) {
      startTransition(() => {
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? previous : candidate)));
        if (previousDetail) {
          setItemDetail(previousDetail);
        }
      });

      setItemsMessage(
        error instanceof Error && error.message === "item_state_endpoint_unavailable"
          ? "PATCH /api/v1/items/{id}/state nie jest jeszcze dostepny. Optymistyczna zmiana zostala cofnieta."
          : error instanceof Error
            ? error.message
            : "Nie udalo sie zaktualizowac stanu artykulu.",
      );
      return false;
    } finally {
      setItemActionId(null);
    }
  }

  async function handleReextractItem(item: Item, mode: "dry_run" | "write" = "write") {
    if (mode === "write" && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Ponowić ekstrakcję tego artykułu? Zmienimy tylko lokalną treść tej jednej pozycji.",
      );
      if (!confirmed) {
        return;
      }
    }

    setItemActionId(item.id);
    setItemsMessage(null);
    setFeedback({
      tone: "idle",
      title: mode === "write" ? "Ponawiam ekstrakcję" : "Sprawdzam ekstrakcję",
      lines: ["Pobieram źródło artykułu i porównuję wynik z aktualnym stanem czytnika."],
    });

    try {
      const { response, payload } = await fetchApi<ItemReextractPayload>(`/api/v1/items/${item.id}/reextract`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });

      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się ponowić ekstrakcji artykułu."));
      }

      if (!payload || typeof payload !== "object" || !("item" in payload)) {
        throw new Error("API zwróciło nieoczekiwany wynik ponownej ekstrakcji.");
      }

      startTransition(() => {
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? payload.item : candidate)));
        setItemDetail(payload.item);
      });
      setItemDetailStatus("ready");
      setItemDetailMessage(null);
      void loadWorkspaceOverview();

      setFeedback({
        tone: payload.stop_reasons.length > 0 ? "idle" : "success",
        title: payload.stop_reasons.length > 0 ? "Ekstrakcja częściowa" : "Ekstrakcja odświeżona",
        lines: getReextractFeedbackLines(payload),
      });
    } catch (error) {
      setItemsMessage(error instanceof Error ? error.message : "Nie udało się ponowić ekstrakcji artykułu.");
      setFeedback({
        tone: "error",
        title: "Ponowna ekstrakcja nie powiodła się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setItemActionId(null);
    }
  }

  async function handleUndo() {
    if (!latestUndoEntry || undoBusy) {
      return;
    }

    setUndoBusy(true);
    const failures: string[] = [];

    for (const operation of [...latestUndoEntry.operations].reverse()) {
      const liveItem = items.find((candidate) => candidate.id === operation.item.id) ?? operation.item;
      const success = await mutateItemState(liveItem, operation.patch, {
        recordUndo: false,
      });
      if (!success) {
        failures.push(operation.item.id);
      }
    }

    if (failures.length === 0) {
      dismissUndoEntry(latestUndoEntry.id);
      setFeedback({
        tone: "success",
        title: "Ostatnia akcja cofnieta",
        lines: [`Cofnieto ${latestUndoEntry.operations.length} ${latestUndoEntry.operations.length === 1 ? "zmiane" : "zmiany"} artykulu.`],
      });
    } else {
      setFeedback({
        tone: "error",
        title: "Cofanie nie powiodlo sie",
        lines: [`Nie udalo sie bezpiecznie cofnac ${failures.length} ${failures.length === 1 ? "zmiany" : "zmian"} artykulu.`],
      });
    }

    setUndoBusy(false);
  }

  async function handleCategorySave(channelId: string) {
    await mutateChannel(channelId, {
      method: "PATCH",
      body: {
        category: draftCategories[channelId] || null,
      },
      successTitle: "Kategoria zaktualizowana",
      successLines: ["Kategoria kanalu zostala zapisana bez naruszania istniejacych artykulow."],
    });
  }

  async function handleStateToggle(channel: Channel) {
    const nextState = channel.state === "active" ? "inactive" : "active";
    await mutateChannel(channel.id, {
      method: "PATCH",
      body: {
        state: nextState,
      },
      successTitle: "Stan kanalu zaktualizowany",
      successLines: [
        nextState === "inactive"
          ? "Kanal jest wylaczony i nie powinien brac udzialu w kolejnych syncach."
          : "Kanal jest znow aktywny i gotowy na kolejny sync.",
      ],
    });
  }

  async function handleArchive(channel: Channel) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Zarchiwizowac ten kanal? Istniejace artykuly zostana w bazie, ale zrodlo zniknie z aktywnej listy.",
      );
      if (!confirmed) {
        return;
      }
    }

    await mutateChannel(channel.id, {
      method: "DELETE",
      successTitle: "Kanal zarchiwizowany",
      successLines: ["Zrodlo zostalo zarchiwizowane. Historyczne artykuly pozostaja zachowane do pozniejszego przegladu."],
    });
  }

  function buildDigestSelectionPayload() {
    const now = new Date();
    return buildPersistedDigestSelectionPayload({
      limit: 25,
      now,
      title: currentSection === "magazines" ? `Magazyn RSSmaster ${now.toISOString().slice(0, 10)}` : undefined,
    });
  }

  function markDigestCandidatesEmpty(message = "Nie ma jeszcze zapisanych kandydatów digestu.") {
    startTransition(() => {
      setDigestPreview(null);
      setDigestCandidatePreview(null);
    });
    setDigestCandidateStatus("empty");
    setDigestCandidateMessage(message);
  }

  async function getPersistedDigestCandidatePresence(options: { signal?: AbortSignal } = {}) {
    try {
      const params = new URLSearchParams({
        digest_candidate: "true",
        limit: "1",
      });
      const { response, payload } = await fetchApi<ItemListPayload>(`/api/v1/items?${params.toString()}`, {
        signal: options.signal,
      });

      if (!response.ok || isErrorEnvelope(payload) || !payload || !Array.isArray(payload.items)) {
        return null;
      }

      return payload.items.length > 0;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      return null;
    }
  }

  async function loadDigestCandidatePreview(options: { signal?: AbortSignal } = {}) {
    setDigestCandidateStatus("loading");
    setDigestCandidateMessage(null);

    try {
      const hasPersistedCandidates = await getPersistedDigestCandidatePresence(options);
      if (hasPersistedCandidates === false) {
        markDigestCandidatesEmpty();
        return null;
      }

      const { response, payload } = await fetchApi<DigestPreviewPayload>("/api/v1/digests/preview", {
        method: "POST",
        signal: options.signal,
        body: JSON.stringify(buildDigestSelectionPayload()),
      });

      if (!response.ok || isErrorEnvelope(payload)) {
        if (isDigestSelectionEmptyPayload(payload)) {
          markDigestCandidatesEmpty(getPayloadMessage(payload, "Nie ma jeszcze zapisanych kandydatów digestu."));
          return null;
        }
        throw new Error(getPayloadMessage(payload, "Nie udało się sprawdzić kolejki digestu."));
      }

      startTransition(() => {
        setDigestCandidatePreview(payload.preview);
      });
      setDigestCandidateStatus("ready");
      setDigestCandidateMessage(null);
      return payload.preview;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      startTransition(() => {
        setDigestCandidatePreview(null);
      });
      setDigestCandidateStatus("error");
      setDigestCandidateMessage(error instanceof Error ? error.message : "Nieznany błąd przeglądarki.");
      return null;
    }
  }

  async function handleDigestPreview() {
    setDigestBusy(true);
    try {
      const hasPersistedCandidates = await getPersistedDigestCandidatePresence();
      if (hasPersistedCandidates === false) {
        markDigestCandidatesEmpty();
        setFeedback({
          tone: "idle",
          title: "Brak kandydatów do digestu",
          lines: [
            "Oznacz artykuł przyciskiem Digest w czytniku. Podgląd korzysta z trwałej kolejki, a nie z aktualnie widocznych filtrów.",
          ],
        });
        return;
      }

      const { response, payload } = await fetchApi<DigestPreviewPayload>("/api/v1/digests/preview", {
        method: "POST",
        body: JSON.stringify(buildDigestSelectionPayload()),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        if (isDigestSelectionEmptyPayload(payload)) {
          markDigestCandidatesEmpty(getPayloadMessage(payload, "Nie ma jeszcze zapisanych kandydatów digestu."));
          setFeedback({
            tone: "idle",
            title: "Brak kandydatów do digestu",
            lines: [
              "Oznacz artykuł przyciskiem Digest w czytniku. Podgląd korzysta z trwałej kolejki, a nie z aktualnie widocznych filtrów.",
            ],
          });
          return;
        }
        throw new Error(getPayloadMessage(payload, "Nie udalo sie przygotowac podgladu digestu."));
      }

      startTransition(() => {
        setDigestPreview(payload.preview);
        setDigestCandidatePreview(payload.preview);
      });
      setDigestCandidateStatus("ready");
      setDigestCandidateMessage(null);
      setFeedback({
        tone: "success",
        title: "Podglad digestu gotowy",
        lines: [
          `${payload.preview.stats.article_count} artykul(y) w ${payload.preview.stats.category_count} grupach kategorii.`,
          `${payload.preview.stats.word_count} slow, szacunkowo ${payload.preview.stats.estimated_read_minutes} min czytania.`,
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Podglad digestu nie powiodl sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleDigestBuild() {
    setDigestBusy(true);
    try {
      const hasPersistedCandidates = await getPersistedDigestCandidatePresence();
      if (hasPersistedCandidates === false) {
        markDigestCandidatesEmpty();
        setFeedback({
          tone: "idle",
          title: "Nie ma czego zbudować",
          lines: [
            "Najpierw oznacz artykuły jako Digest. Build używa trwałych kandydatów z biblioteki, więc wyszukiwanie i filtr czytnika nie tworzą już ukrytej selekcji.",
          ],
        });
        return;
      }

      const { response, payload } = await fetchApi<DigestHistoryPayload>("/api/v1/digests/build", {
        method: "POST",
        body: JSON.stringify(buildDigestSelectionPayload()),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        if (isDigestSelectionEmptyPayload(payload)) {
          markDigestCandidatesEmpty(getPayloadMessage(payload, "Nie ma jeszcze zapisanych kandydatów digestu."));
          setFeedback({
            tone: "idle",
            title: "Nie ma czego zbudować",
            lines: [
              "Najpierw oznacz artykuły jako Digest. Build używa trwałych kandydatów z biblioteki, więc wyszukiwanie i filtr czytnika nie tworzą już ukrytej selekcji.",
            ],
          });
          return;
        }
        throw new Error(getPayloadMessage(payload, "Nie udalo sie zbudowac digestu."));
      }

      await Promise.all([loadDigestHistory(), loadDeliveryLogs(payload.digest.id), loadDigestCandidatePreview()]);
      setSelectedMagazineIssueId(payload.digest.id);
      if (currentSection === "magazines") {
        router.push(buildAppHref({ section: "magazines", issue: payload.digest.id }));
      }
      setFeedback({
        tone: "success",
        title: "Wydanie magazynu utworzone",
        lines: [
          `${payload.digest.title} z ${payload.digest.article_count} artykułami zostało zapisane lokalnie.`,
          payload.digest.artifact.path ? `Artefakt: ${payload.digest.artifact.path}` : "Metadane artefaktu jeszcze czekaja.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Budowa digestu nie powiodla sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleSaveAISettings() {
    const patch = buildAISettingsPatch(aiSettingsDraft, aiSettings);
    if (Object.keys(patch).length === 0) {
      setAISettingsMessage("Brak zmian w ustawieniach AI.");
      return;
    }

    setAISettingsBusy(true);
    setAISettingsMessage(null);
    try {
      const { response, payload } = await fetchApi<AISettingsPayload>("/api/v1/settings/ai", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się zapisać ustawień AI."));
      }

      startTransition(() => {
        setAISettings(payload.settings);
        setAISettingsDraft(createAISettingsDraft(payload.settings));
      });
      setAISettingsMessage("Ustawienia AI zapisane.");
    } catch (error) {
      setAISettingsMessage(error instanceof Error ? error.message : "Nie udało się zapisać ustawień AI.");
    } finally {
      setAISettingsBusy(false);
    }
  }

  async function handleAISettingsPreflight() {
    setAIPreflightBusy(true);
    setAISettingsMessage(null);
    try {
      const { response, payload } = await fetchApi<AISettingsPreflightPayload>("/api/v1/settings/ai/preflight", {
        method: "POST",
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się sprawdzić konfiguracji AI."));
      }

      setAIPreflight(payload);
      setFeedback({
        tone: payload.can_use_ai ? "success" : "error",
        title: `Preflight AI: ${payload.status}`,
        lines: payload.checks.map((check) => `${check.name}: ${check.message}`),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Preflight AI nie powiódł się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setAIPreflightBusy(false);
    }
  }

  async function handleSaveDeliverySettings() {
    setSettingsBusy(true);
    setDeliverySettingsMessage(null);
    try {
      const { response, payload } = await fetchApi<DeliverySettingsPayload>("/api/v1/settings/delivery", {
        method: "PATCH",
        body: JSON.stringify({
          smtp_host: settingsDraft.smtp_host || null,
          smtp_port: Number.parseInt(settingsDraft.smtp_port, 10) || 587,
          smtp_username: settingsDraft.smtp_username || null,
          smtp_password: settingsDraft.smtp_password || null,
          smtp_from: settingsDraft.smtp_from || null,
          kindle_email: settingsDraft.kindle_email || null,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie zapisac ustawien wysylki."));
      }

      startTransition(() => {
        setDeliverySettings(payload.settings);
        setSettingsDraft((current) => ({
          ...current,
          smtp_password: "",
        }));
      });
      setDeliverySettingsMessage("Ustawienia wysylki zapisane.");
    } catch (error) {
      setDeliverySettingsMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac ustawien wysylki.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleDeliverySettingsPreflight() {
    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliverySettingsPreflightPayload>("/api/v1/settings/delivery/preflight", {
        method: "POST",
        body: JSON.stringify({ check_connection: false }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie uruchomic preflightu ustawien."));
      }

      setFeedback({
        tone: payload.preflight.can_send ? "success" : "error",
        title: `Preflight ustawien: ${payload.preflight.status}`,
        lines: payload.preflight.checks.map((check) => `${check.name}: ${check.message}`),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Preflight ustawien nie powiodl sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleDeliveryPreflight(targetKind: "kindle" | "smtp", digest: DeliveryDigestTarget | null = latestDigest) {
    if (!digest) {
      setFeedback({
        tone: "error",
        title: "Brak dostępnego wydania",
        lines: ["Zbuduj artefakt magazynu przed uruchomieniem preflightu wysyłki."],
      });
      return;
    }

    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliveryPreflightPayload>("/api/v1/delivery/preflight", {
        method: "POST",
        body: JSON.stringify({
          digest_id: digest.id,
          target_kind: targetKind,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie uruchomic preflightu wysylki."));
      }

      startTransition(() => {
        setDeliveryPreflight(payload.preflight);
      });
      setFeedback({
        tone: payload.preflight.can_send ? "success" : "error",
        title: `Preflight wydania: ${payload.preflight.status}`,
        lines: payload.preflight.checks.map((check) => `${check.name}: ${check.message}`),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Preflight wysyłki nie powiódł się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleSendDigest(mode: "dry_run" | "send", targetKind: "kindle" | "smtp", digest: DeliveryDigestTarget | null = latestDigest) {
    if (!digest) {
      setFeedback({
        tone: "error",
        title: "Brak dostępnego wydania",
        lines: ["Zbuduj artefakt magazynu przed wysyłką."],
      });
      return;
    }

    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliveryDispatchPayload>("/api/v1/delivery/send", {
        method: "POST",
        body: JSON.stringify({
          digest_id: digest.id,
          target_kind: targetKind,
          mode,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udało się wysłać wydania."));
      }

      startTransition(() => {
        setDeliveryPreflight(payload.preflight);
      });
      await Promise.all([loadDeliveryLogs(digest.id), loadDigestHistory()]);
      setFeedback({
        tone: payload.run.status === "completed" ? "success" : "error",
        title: `Wysyłka wydania ${payload.run.status}`,
        lines: [
          `${payload.log.status} dla ${payload.log.target_kind} ${payload.log.recipient ?? "odbiorca jeszcze nieustalony"}.`,
          payload.log.provider_message_id ? `Id wiadomości dostawcy: ${payload.log.provider_message_id}` : "Brak identyfikatora od dostawcy.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Wysyłka nie powiodła się",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleSendArticleToKindle(item: Item) {
    if (articleKindleBusyId) {
      return;
    }

    setArticleKindleBusyId(item.id);
    try {
      const resolvedDeliverySettings = deliverySettings ?? (await loadDeliverySettings());
      if (!resolvedDeliverySettings.smtp_ready) {
        const senderHint = resolvedDeliverySettings.smtp_from
          ? `Dodaj ${resolvedDeliverySettings.smtp_from} jako approved sender w Amazon.`
          : "Po ustawieniu pola SMTP from dodaj ten adres jako approved sender w Amazon.";
        setArticleKindleFeedback({
          itemId: item.id,
          tone: "error",
          title: "Skonfiguruj Kindle przed wysyłką",
          lines: [
            "Uzupełnij SMTP, hasło nadawcy i Kindle email w Ustawieniach.",
            senderHint,
            ...resolvedDeliverySettings.issues.slice(0, 3),
          ],
        });
        return;
      }

      setArticleKindleFeedback({
        itemId: item.id,
        tone: "idle",
        title: "Przygotowuję artykuł na Kindle",
        lines: ["Buduję jednopunktowy EPUB i wyślę go tym samym kanałem delivery co digest."],
      });

      const { response: buildResponse, payload: buildPayload } = await fetchApi<DigestHistoryPayload>("/api/v1/digests/build", {
        method: "POST",
        body: JSON.stringify(buildArticleKindleDigestPayload(item)),
      });
      if (!buildResponse.ok || isErrorEnvelope(buildPayload)) {
        throw new Error(getPayloadMessage(buildPayload, "Nie udało się przygotować artykułu do wysyłki na Kindle."));
      }

      const digest = buildPayload.digest;
      const { response: sendResponse, payload: sendPayload } = await fetchApi<DeliveryDispatchPayload>("/api/v1/delivery/send", {
        method: "POST",
        body: JSON.stringify({
          digest_id: digest.id,
          target_kind: "kindle",
          mode: "send",
          subject: digest.title,
        }),
      });
      if (!sendResponse.ok || isErrorEnvelope(sendPayload)) {
        throw new Error(getPayloadMessage(sendPayload, "Nie udało się wysłać artykułu na Kindle."));
      }

      startTransition(() => {
        setDeliveryPreflight(sendPayload.preflight);
      });
      await Promise.all([loadDigestHistory(), loadDeliveryLogs(digest.id)]);

      const sent = sendPayload.log.status === "sent";
      setArticleKindleFeedback({
        itemId: item.id,
        tone: sent ? "success" : "error",
        title: sent ? "Artykuł wysłany na Kindle" : "Wysyłka Kindle wymaga sprawdzenia",
        lines: [
          sent
            ? `${item.title} trafił do kolejki wysyłki na ${sendPayload.log.recipient ?? "Kindle"}.`
            : `${sendPayload.log.status} dla ${sendPayload.log.recipient ?? "odbiorcy Kindle"}.`,
          sendPayload.log.provider_message_id
            ? `Id wiadomości: ${sendPayload.log.provider_message_id}`
            : "Jeśli Amazon nie pokaże artykułu po kilku minutach, sprawdź approved sender i log delivery.",
        ],
      });
    } catch (error) {
      setArticleKindleFeedback({
        itemId: item.id,
        tone: "error",
        title: "Nie udało się wysłać artykułu na Kindle",
        lines: [error instanceof Error ? error.message : "Nieznany błąd przeglądarki."],
      });
    } finally {
      setArticleKindleBusyId(null);
    }
  }

  function selectRelativeItem(offset: number) {
    if (queueItems.length === 0) {
      return;
    }

    const currentIndex = selectedItem ? queueItems.findIndex((item) => item.id === selectedItem.id) : 0;
    const nextIndex = clamp((currentIndex >= 0 ? currentIndex : 0) + offset, 0, queueItems.length - 1);
    dispatchReader({ type: "select_item", itemId: queueItems[nextIndex].id });
  }

  function openSelectedSource() {
    if (!selectedItem || typeof window === "undefined") {
      return;
    }

    window.open(selectedItem.source_url, "_blank", "noopener,noreferrer");
  }

  function focusFirstItemFromChannel(channel: Channel) {
    const firstVisibleItem = queueItems.find((item) => item.channel_id === channel.id);
    if (firstVisibleItem) {
      if (currentSection !== "read") {
        router.push(
          buildAppHref({
            section: "read",
            libraryView,
            scope: showReadItems ? "all" : "unread",
            sort: itemSortMode,
            q: itemSearch.trim() || null,
            item: firstVisibleItem.id,
          }),
        );
      }
      dispatchReader({ type: "select_item", itemId: firstVisibleItem.id });
      return;
    }

    setFeedback({
      tone: "idle",
      title: `${channel.title} jest gotowe`,
      lines: ["To zrodlo jest zapisane, ale nie ma jeszcze widocznego artykulu w biezacych filtrach listy."],
    });
  }

  function toggleBulkSelection(itemId: string) {
    dispatchReader({ type: "toggle_selection", itemId });
  }

  function selectVisibleItems() {
    dispatchReader({ type: "select_visible", itemIds: queueItems.map((item) => item.id) });
  }

  function clearBulkSelection() {
    dispatchReader({ type: "clear_selection" });
  }

  async function handleBulkAction(action: "read" | "save" | "digest" | "archive") {
    if (selectedBulkItems.length === 0 || bulkBusy) {
      return;
    }

    const patch =
      action === "read"
        ? { is_read: true }
        : action === "save"
          ? { library_action: "save" as const }
          : action === "archive"
            ? { library_action: "archive" as const }
            : { digest_candidate: true };

    const actionTitle =
      action === "read"
        ? "Masowo oznacz jako przeczytane"
        : action === "save"
          ? "Masowy zapis"
          : action === "archive"
            ? "Masowe archiwizowanie"
            : "Masowa kolejka digestu";

    setBulkBusy(true);
    const failures: string[] = [];
    const undoOperations: UndoOperation[] = [];

    for (const item of selectedBulkItems) {
      const undoPatch = buildUndoPatch(item, applyItemPatch(item, patch));
      const success = await mutateItemState(item, patch, {
        recordUndo: false,
      });
      if (!success) {
        failures.push(item.id);
      } else if (undoPatch) {
        undoOperations.push({
          item,
          patch: undoPatch,
        });
      }
    }

    setBulkBusy(false);
    setReaderSelectedItemIds(failures);
    if (undoOperations.length > 0) {
      pushUndoEntry({
        id: `undo_${Date.now()}_bulk`,
        label: actionTitle,
        operations: undoOperations,
      });
    }
    setFeedback({
      tone: failures.length === 0 ? "success" : "error",
      title: actionTitle,
      lines:
        failures.length === 0
          ? [`Zaktualizowano ${selectedBulkItems.length} zaznaczonych pozycji.`]
          : [`Zaktualizowano ${selectedBulkItems.length - failures.length} pozycji, ${failures.length} nie powiodlo sie i pozostalo zaznaczonych.`],
    });
  }

  async function handlePresetAction(action: ReaderDecisionAction) {
    if (!selectedItem || itemActionId === selectedItem.id) {
      return;
    }

    const patch: ItemStatePatch = buildReaderDecisionPatch(action);
    const actionLabel = getReaderDecisionActionLabel(action);
    const nextItemId = resolveReaderDecisionNextItemId(queueItems, selectedItem.id);
    const didAdvance = didReaderDecisionAdvance(nextItemId, selectedItem.id);
    const keepReaderOpen = readingItemId === selectedItem.id;
    const success = await mutateItemState(selectedItem, patch, {
      undoLabel: actionLabel,
    });
    if (!success) {
      return;
    }

    if (didAdvance && nextItemId) {
      dispatchReader({ type: "advance_after_decision", keepReaderOpen, nextItemId });
    }

    setFeedback({
      tone: "success",
      title: actionLabel,
      lines: [getReaderDecisionResultLine(didAdvance)],
    });
  }

  const handleGlobalKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (showKeyboardHelp) {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        setShowKeyboardHelp(false);
      }
      return;
    }

    const typing = isTypingTarget(event.target);
    const normalizedKey = event.key.toLowerCase();

    if (typing) {
      if (event.key === "Escape" && event.target instanceof HTMLElement) {
        event.preventDefault();
        event.target.blur();
      }
      return;
    }

    if (event.repeat && !["j", "k", "arrowdown", "arrowup"].includes(normalizedKey)) {
      return;
    }

    if (normalizedKey === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      selectRelativeItem(1);
      return;
    }

    if (normalizedKey === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelativeItem(-1);
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      setShowKeyboardHelp(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (itemSearch) {
        setReaderItemSearch("");
        return;
      }

      if (selectedItemIds.length > 0) {
        clearBulkSelection();
        return;
      }

      if (isFocusedMode) {
        setIsFocusedMode(false);
      }
      return;
    }

    if (normalizedKey === "u") {
      event.preventDefault();
      setReaderShowReadItems(false);
      return;
    }

    if (normalizedKey === "a") {
      event.preventDefault();
      setReaderShowReadItems(true);
      return;
    }

    if (normalizedKey === "s") {
      event.preventDefault();
      navigateToReadLibraryView(libraryView === "saved" ? "inbox" : "saved");
      return;
    }

    if (normalizedKey === "e") {
      event.preventDefault();
      navigateToReadLibraryView(libraryView === "archive" ? "inbox" : "archive");
      return;
    }

    if (normalizedKey === "z") {
      event.preventDefault();
      setIsFocusedMode((current) => !current);
      return;
    }

    if (normalizedKey === "c") {
      event.preventDefault();
      setIsCompactList((current) => !current);
      return;
    }

    if (normalizedKey === "r") {
      event.preventDefault();
      if (event.shiftKey && !isSyncing && channels.length > 0) {
        void handleSyncAll();
        return;
      }

      void loadItems();
      return;
    }

    if (normalizedKey === "o") {
      event.preventDefault();
      openSelectedSource();
      return;
    }

    if (normalizedKey === "x" && selectedItem) {
      event.preventDefault();
      toggleBulkSelection(selectedItem.id);
      return;
    }

    if (event.key === "*") {
      event.preventDefault();
      if (selectedItemIds.length === queueItems.length) {
        clearBulkSelection();
      } else {
        selectVisibleItems();
      }
      return;
    }

    if (!selectedItem || itemActionId === selectedItem.id) {
      return;
    }

    if (event.shiftKey && normalizedKey === "m") {
      event.preventDefault();
      void handlePresetAction("read_next");
      return;
    }

    if (event.shiftKey && normalizedKey === "f") {
      event.preventDefault();
      void handlePresetAction("save_next");
      return;
    }

    if (event.shiftKey && normalizedKey === "d") {
      event.preventDefault();
      void handlePresetAction("digest_next");
      return;
    }

    if (normalizedKey === "m") {
      event.preventDefault();
      void mutateItemState(selectedItem, { is_read: !selectedItem.is_read });
      return;
    }

    if (normalizedKey === "f") {
      event.preventDefault();
      void mutateItemState(selectedItem, { library_action: selectedItem.is_favorite ? "unsave" : "save" });
      return;
    }

    if (normalizedKey === "d") {
      event.preventDefault();
      void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate });
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, [handleGlobalKeydown]);

  const handleReadingSurfaceScroll = useEffectEvent(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }
    if (pendingReaderProgressRestoreRef.current[selectedItem.id]) {
      return;
    }

    const surface = articleContentRef.current;
    const { maxScroll, scrollTop } = getReaderScrollSnapshot(surface);
    const progress = maxScroll === 0 ? 100 : Math.round((scrollTop / maxScroll) * 100);
    const previous = readingProgressRef.current[selectedItem.id];

    if (previous && previous.progress === progress && Math.abs(previous.scrollTop - scrollTop) < 24) {
      return;
    }

    const nextSnapshot = {
      progress,
      scrollTop,
      updatedAt: new Date().toISOString(),
    };

    readingProgressRef.current = {
      ...readingProgressRef.current,
      [selectedItem.id]: nextSnapshot,
    };

    setReaderProgress((current) => ({
      ...current,
      [selectedItem.id]: nextSnapshot,
    }));
  });

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }

    const handleWindowScroll = () => {
      handleReadingSurfaceScroll();
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [handleReadingSurfaceScroll, itemDetailStatus, readingItemId, selectedItem?.id]);

  function renderReaderContent() {
    if (itemsStatus === "loading" && queueItems.length === 0) {
      return (
        <div className="reader-state-card">
          <strong>Ladowanie kolejki czytnika</strong>
          <p>Pobieram `/api/v1/items` z biezacymi filtrami.</p>
          <div className="reader-skeleton-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="reader-skeleton-row" key={index} />
            ))}
          </div>
        </div>
      );
    }

    if (itemsStatus === "unsupported") {
      return (
        <div className="reader-state-card">
          <strong>Endpoint biblioteki czytnika jest niedostepny</strong>
          <p>{itemsMessage}</p>
          <p>Sprawdz lokalny runtime API albo zrestartuj uslugi aplikacji i sprobuj ponownie.</p>
        </div>
      );
    }

    if (itemsStatus === "error" && queueItems.length === 0) {
      return (
        <div className="reader-state-card reader-state-card-error">
          <strong>Nie udalo sie wczytac kolejki czytnika</strong>
          <p>{itemsMessage ?? "Nieznany blad ladowania artykulow."}</p>
          <button className="mini-button mini-button-accent" onClick={() => void loadItems()} type="button">
            Sprobuj ponownie
          </button>
        </div>
      );
    }

    if (queueItems.length === 0) {
      const emptyLine =
        channels.length === 0
          ? "Dodaj zrodlo w prawym panelu, aby utworzyc pierwszy feed."
          : syncRuns.length === 0
            ? "Uruchom pierwszy reczny sync. Nowe artykuly pojawia sie tutaj po imporcie."
            : "Zaden artykul nie pasuje jeszcze do biezacych filtrow.";

      return (
        <div className="reader-state-card">
          <strong>Kolejka jest pusta</strong>
          <p>{emptyLine}</p>
          {isFocusedMode ? <p>Tryb focus ukrywa panel operacji. Nacisnij Z, aby przywrocic sterowanie.</p> : null}
          {itemsPage?.has_more ? <p>Wyzej sa jeszcze kolejne artykuly, ale biezacy widok kursora jest pusty.</p> : null}
        </div>
      );
    }

    return (
      <div className={`reader-grid ${isCompactList ? "reader-grid-compact" : ""}`}>
        <section className="reader-list-panel">
          <div className="reader-list-header">
            <div className="reader-list-summary">
              <span className="panel-badge">{isCompactList ? "Zwarta kolumna" : "Kolumna czytnika"}</span>
              <strong>
                {selectedItemIndex >= 0 ? `${selectedItemIndex + 1} / ${queueItems.length}` : `0 / ${queueItems.length}`}
              </strong>
            </div>
            <span>{itemsRefreshing ? "Odswiezanie..." : itemsPage?.has_more ? "Wiecej wyzej" : "Lokalny wycinek"}</span>
          </div>

          <ArticleQueueList
            activeItemId={selectedItem?.id ?? null}
            busyItemId={itemActionId}
            channelTitles={channelTitles}
            compact={isCompactList}
            formatTimestamp={formatTimestamp}
            getSearchFieldLabel={getSearchFieldLabel}
            items={queueItems}
            onSelect={(itemId) => dispatchReader({ type: "select_item", itemId })}
            onToggleBulk={(itemId) => toggleBulkSelection(itemId)}
            onToggleDigest={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { digest_candidate: !item.digest_candidate });
              }
            }}
            onToggleFavorite={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { library_action: item.is_favorite ? "unsave" : "save" });
              }
            }}
            onToggleRead={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { is_read: !item.is_read });
              }
            }}
            progressByItemId={Object.fromEntries(
              queueItems.map((item) => [item.id, readerProgress[item.id]?.progress]),
            )}
            registerRow={(itemId, node) => {
              if (node) {
                itemRowRefs.current.set(itemId, node);
              } else {
                itemRowRefs.current.delete(itemId);
              }
            }}
            selectedItemIds={selectedItemIds}
          />

          {itemsPage?.has_more ? (
            <div className="reader-list-footer">
              <button className="mini-button" disabled={itemsRefreshing} onClick={() => void loadMoreItems()} type="button">
                {itemsRefreshing ? "Ladowanie..." : "Wczytaj wiecej"}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="reader-preview-panel">
          {selectedItem ? (
            <>
              {(() => {
                const previewItem = itemDetail && itemDetail.id === selectedItem.id ? itemDetail : selectedItem;
                const isReadingArticle = readingItemId === selectedItem.id;
                const qualityState = getReaderQualityState(selectedItem, itemDetail, itemDetailStatus);
                const canReextractSelected = shouldOfferReextract(selectedItem, itemDetail, itemDetailStatus);
                const readerWordCount =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? countWords(itemDetail.content_text ?? itemDetail.excerpt)
                    : countWords(selectedItem.excerpt);
                const highlightCount = itemAnnotations.filter((annotation) => annotation.kind === "highlight").length;
                const noteCount = itemAnnotations.filter((annotation) => annotation.kind === "note").length;
                const sanitizedCleanedHtml =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? sanitizeReaderHtml(itemDetail.cleaned_html, selectedItem.title)
                    : null;
                const readerView =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? sanitizedCleanedHtml
                      ? "cleaned_html"
                      : itemDetail.content_text
                        ? "content_text"
                        : itemDetail.excerpt
                          ? "excerpt"
                          : "missing"
                    : selectedItem.excerpt
                      ? "excerpt"
                      : "missing";
                const highlightedCleanedHtml =
                  itemDetail && itemDetail.id === selectedItem.id && sanitizedCleanedHtml
                    ? renderInlineHighlightHtml(sanitizedCleanedHtml, itemAnnotations)
                    : null;
                const bodyParagraphs =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? readerView === "content_text"
                      ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.content_text), selectedItem.title)
                      : readerView === "excerpt"
                        ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.excerpt), selectedItem.title)
                        : []
                    : sanitizeReaderParagraphs(splitReaderParagraphs(selectedItem.excerpt), selectedItem.title);
                const resumeProgress = readerProgress[selectedItem.id];
                const readerSurfaceClasses = [
                  "reader-reading-surface",
                  `reader-reading-surface-width-${readerWidthMode}`,
                  `reader-reading-surface-text-${readerTextMode}`,
                  `reader-reading-surface-media-${readerImageMode}`,
                ].join(" ");

                return (
                  <>
              <div className="reader-preview-topline">
                <div className="reader-preview-meta">
                  <span className="panel-badge">{isFocusedMode ? "Tryb focus" : "Wybrany artykul"}</span>
                  <a href={selectedItem.source_url} rel="noreferrer" target="_blank">
                    Otworz zrodlo
                  </a>
                </div>
                <span className="reader-preview-position">
                  Kolejka {selectedItemIndex >= 0 ? selectedItemIndex + 1 : 0} z {queueItems.length}
                </span>
              </div>

              <h3>{previewItem.title}</h3>
              <div className="reader-preview-stack">
                <span>{previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo"}</span>
                <span>{formatTimestamp(previewItem.published_at, "Nieznany czas publikacji")}</span>
                <span>{previewItem.author ? previewItem.author : "Autor nieznany"}</span>
              </div>

              <div className="reader-preview-actions">
                <button
                  className="action-button"
                  disabled={itemDetailStatus === "loading" && !isReadingArticle}
                  onClick={() => {
                    if (qualityState.allowsInApp) {
                      setReaderReadingItemId((current) => (current === selectedItem.id ? null : selectedItem.id));
                      return;
                    }

                    openSelectedSource();
                  }}
                  type="button"
                >
                  {isReadingArticle ? "Ukryj artykul" : qualityState.allowsInApp ? "Czytaj artykul" : "Otworz zrodlo"}
                </button>
                {canReextractSelected ? (
                  <button
                    className="secondary-button"
                    disabled={itemActionId === selectedItem.id || itemDetailStatus === "loading"}
                    onClick={() => void handleReextractItem(selectedItem, "write")}
                    type="button"
                  >
                    Ponów ekstrakcję
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void mutateItemState(selectedItem, { is_read: !selectedItem.is_read })}
                  type="button"
                >
                  <span className="button-with-icon">
                    <ReaderIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_read ? "Oznacz jako nieprzeczytane (M)" : "Oznacz jako przeczytane (M)"}
                  </span>
                </button>
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate })}
                  type="button"
                >
                  <span className="button-with-icon">
                    <DigestIcon className="app-icon button-inline-icon" />
                    {selectedItem.digest_candidate ? "Usun z digestu (D)" : "Dodaj do digestu (D)"}
                  </span>
                </button>
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() =>
                    void mutateItemState(selectedItem, {
                      library_action: selectedItem.is_favorite ? "unsave" : "save",
                    })
                  }
                  type="button"
                >
                  <span className="button-with-icon">
                    <BookmarkIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_favorite ? "Cofnij zapis (F)" : "Zapisz na krotkiej liscie (F)"}
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() =>
                    void mutateItemState(selectedItem, {
                      library_action: selectedItem.is_archived ? "restore" : "archive",
                    })
                  }
                  type="button"
                >
                  <span className="button-with-icon">
                    <ArchiveIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_archived ? "Przywroc" : "Archiwizuj"}
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("read_next")}
                  type="button"
                >
                  <span className="button-with-icon">
                    <ReaderIcon className="app-icon button-inline-icon" />
                    Przeczytaj + dalej
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("save_next")}
                  type="button"
                >
                  <span className="button-with-icon">
                    <BookmarkIcon className="app-icon button-inline-icon" />
                    Zapisz + dalej
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("digest_next")}
                  type="button"
                >
                  Digest + dalej
                </button>
              </div>

              <div className={`reader-quality-card reader-quality-card-${qualityState.kind}`}>
                <div className="reader-quality-card-header">
                  <span className="panel-badge">{qualityState.badge}</span>
                  <strong>{qualityState.heading}</strong>
                </div>
                <p>{qualityState.description}</p>
                {highlightCount > 0 || noteCount > 0 ? (
                  <div className="reader-highlight-meta">
                    {highlightCount > 0 ? <span className="reader-progress-chip">{highlightCount} podkreslen{highlightCount === 1 ? "ie" : "ia"}</span> : null}
                    {noteCount > 0 ? <span className="reader-progress-chip">{noteCount} notatk{noteCount === 1 ? "a" : "i"}</span> : null}
                  </div>
                ) : null}
                {resumeProgress && resumeProgress.progress > 2 ? (
                  <span className="reader-progress-chip">Wznow na tym urzadzeniu: {resumeProgress.progress}%</span>
                ) : null}
              </div>

              <div className="reader-preview-body">
                <p className="reader-preview-note">
                  {itemDetailStatus === "loading"
                    ? "Ladowanie pelnego widoku artykulu..."
                    : itemDetailStatus === "ready" && itemDetail && itemDetail.id === selectedItem.id
                      ? readerView === "cleaned_html"
                        ? `Gotowy oczyszczony widok | ${readerWordCount} slow`
                        : readerView === "content_text"
                          ? `Fallback czytnika uzywa wyekstrahowanego tekstu | ${readerWordCount} slow`
                          : readerView === "excerpt"
                            ? "Dla tego artykulu jest teraz dostepny tylko poziom skrotu."
                            : "Brak czytelnej tresci artykulu."
                      : itemDetailStatus === "unsupported"
                        ? "Endpoint szczegolow jest niedostepny, wiec czytnik opiera sie tylko na metadanych kolejki."
                        : itemDetailStatus === "error"
                          ? itemDetailMessage ?? "Nie udalo sie wczytac szczegolow artykulu."
                          : previewItem.excerpt
                            ? "Czytnik uzywa zapisanego skrotu, dopoki pelna tresc sie nie ustabilizuje."
                            : "Brak skrotu dla tego artykulu."}
                </p>

                <div className="reader-display-controls">
                  <div className="reader-display-group">
                    <span>Szerokosc</span>
                    <div className="reader-display-toggle" role="group" aria-label="Szerokosc czytnika">
                      {(["narrow", "comfortable", "wide"] as ReaderWidthMode[]).map((option) => (
                        <button
                          className={readerWidthMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderWidthMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reader-display-group">
                    <span>Tekst</span>
                    <div className="reader-display-toggle" role="group" aria-label="Skala tekstu czytnika">
                      {(["standard", "large"] as ReaderTextMode[]).map((option) => (
                        <button
                          className={readerTextMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderTextMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reader-display-group">
                    <span>Media</span>
                    <div className="reader-display-toggle" role="group" aria-label="Tryb mediow czytnika">
                      {(["safe", "immersive"] as ReaderImageMode[]).map((option) => (
                        <button
                          className={readerImageMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderImageMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!isReadingArticle ? (
                  <div className="reader-article-gate">
                    <strong>{qualityState.allowsInApp ? "Czytaj artykul w aplikacji" : "Fallback zrodla"}</strong>
                    <p>{qualityState.description}</p>
                    <div className="reader-gate-actions">
                      <button
                        className="action-button"
                        disabled={itemDetailStatus === "loading"}
                        onClick={() => {
                          if (qualityState.allowsInApp) {
                            setReaderReadingItemId(selectedItem.id);
                            return;
                          }

                          openSelectedSource();
                        }}
                        type="button"
                      >
                        {resumeProgress && resumeProgress.progress > 2
                          ? `Resume ${resumeProgress.progress}%`
                          : qualityState.actionLabel}
                      </button>
                      <button className="secondary-button" onClick={openSelectedSource} type="button">
                        Otworz zrodlo
                      </button>
                      {canReextractSelected ? (
                        <button
                          className="secondary-button"
                          disabled={itemActionId === selectedItem.id || itemDetailStatus === "loading"}
                          onClick={() => void handleReextractItem(selectedItem, "write")}
                          type="button"
                        >
                          Ponów ekstrakcję
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : itemDetailStatus === "loading" ? (
                  <div className="reader-article-loading" ref={articleContentRef}>
                    Przygotowywanie lokalnego widoku czytania.
                  </div>
                ) : itemDetailStatus === "ready" && itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml ? (
                  <div
                    className={readerSurfaceClasses}
                    onScroll={handleReadingSurfaceScroll}
                    ref={articleContentRef}
                  >
                    <div
                      className="reader-article-prose"
                      dangerouslySetInnerHTML={{ __html: highlightedCleanedHtml ?? sanitizedCleanedHtml }}
                    />
                  </div>
                ) : bodyParagraphs.length > 0 ? (
                  <div
                    className={readerSurfaceClasses}
                    onScroll={handleReadingSurfaceScroll}
                    ref={articleContentRef}
                  >
                    <div className="reader-article-prose">
                      {bodyParagraphs.map((paragraph) => (
                        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="reader-article-loading reader-article-loading-empty" ref={articleContentRef}>
                    Brak oczyszczonej tresci artykulu. Uzyj linku do zrodla jako fallbacku.
                  </div>
                )}
              </div>

              <dl className="reader-preview-facts">
                <div>
                  <dt>Status</dt>
                  <dd>{previewItem.is_read ? "Przeczytane" : "Nieprzeczytane"}</dd>
                </div>
                <div>
                  <dt>Zapisanie</dt>
                  <dd>{previewItem.is_favorite ? "Zapisane" : "Niezapisane"}</dd>
                </div>
                <div>
                  <dt>Biblioteka</dt>
                  <dd>{getLibraryViewLabel(previewItem.is_archived ? "archive" : previewItem.is_favorite ? "saved" : "inbox")}</dd>
                </div>
                <div>
                  <dt>Digest</dt>
                  <dd>{getDigestStatusLabel(previewItem.digest.status)}</dd>
                </div>
                <div>
                  <dt>Ekstrakcja</dt>
                  <dd>{getExtractionStatusLabel(previewItem.extraction_status)}</dd>
                </div>
                <div>
                  <dt>Tresc</dt>
                  <dd>{previewItem.has_cleaned_content ? "Oczyszczona" : previewItem.has_raw_content ? "Tylko surowa" : "Brak"}</dd>
                </div>
                <div>
                  <dt>Zrodlo</dt>
                  <dd>{previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo"}</dd>
                </div>
                <div>
                  <dt>Notatka digestu</dt>
                  <dd>{previewItem.digest.reason}</dd>
                </div>
                <div>
                  <dt>Widok czytnika</dt>
                  <dd>
                    {itemDetail && itemDetail.id === selectedItem.id
                      ? readerView
                      : itemDetailStatus === "loading"
                        ? "ladowanie"
                        : "skrot"}
                  </dd>
                </div>
                <div>
                  <dt>Postep</dt>
                  <dd>{resumeProgress ? `${resumeProgress.progress}% na tym urzadzeniu` : "Nie zaczeto"}</dd>
                </div>
              </dl>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="reader-state-card">
              <strong>Wybierz artykul</strong>
              <p>Panel podgladu pokazuje wybrany artykul i dostepne akcje stanu.</p>
            </div>
          )}
        </aside>
      </div>
    );
  }

  const latestRun = syncRuns[0] ?? null;
  const latestRunSummaryLine = getSyncRunSummaryLine(latestRun);
  const firstDigestCandidate = queueItems.find((item) => item.digest_candidate) ?? null;
  const currentSourceAddMode = sourceAddModes.find((entry) => entry.id === sourceAddMode) ?? sourceAddModes[0];
  const sourcePreviewPool = useMemo(() => {
    const seen = new Set<string>();
    const entries: ChannelPreviewCandidate[] = [];

    const collect = (candidate: ChannelPreviewCandidate | null | undefined) => {
      if (!candidate || seen.has(candidate.feed_url)) {
        return;
      }
      seen.add(candidate.feed_url);
      entries.push(candidate);
    };

    collect(channelPreview?.feed);
    for (const candidate of channelPreview?.candidates ?? []) {
      collect(candidate);
    }

    return entries;
  }, [channelPreview]);
  const sourceLanguageOptions = useMemo(() => {
    const entries = new Map<string, string>([["all", "Wszystkie wyniki"]]);

    for (const candidate of sourcePreviewPool) {
      const value = candidate.language?.trim().toLowerCase() || "unknown";
      if (!entries.has(value)) {
        entries.set(value, getSourceLanguageLabel(candidate.language));
      }
    }

    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
    }, [sourcePreviewPool]);
  const visibleSourceCandidates = useMemo(() => {
    return sourcePreviewPool.filter((candidate) => {
      if (sourceLanguageFilter === "all") {
        return true;
      }

      const candidateLanguage = candidate.language?.trim().toLowerCase() || "unknown";
      return candidateLanguage === sourceLanguageFilter;
    });
  }, [sourceLanguageFilter, sourcePreviewPool]);
  const primarySourceCandidate = visibleSourceCandidates[0] ?? sourcePreviewPool[0] ?? null;
  const sourceExistingChannel = useMemo(() => {
    const existingChannelId = channelPreview?.existing_channel?.id ?? primarySourceCandidate?.existing_channel_id ?? null;
    if (!existingChannelId) {
      return null;
    }
    return channels.find((channel) => channel.id === existingChannelId) ?? channelPreview?.existing_channel ?? null;
  }, [channelPreview, channels, primarySourceCandidate]);
  const sourcePreviewState = getSourcePreviewUiState({
    previewBusy,
    preview: channelPreview
      ? {
          status: channelPreview.status,
          feed: channelPreview.feed,
        }
      : null,
    hasError: feedback.tone === "error",
  });
  const sourcePreviewAnnouncement = useMemo(
    () =>
      getSourcePreviewAnnouncement({
        uiState: sourcePreviewState,
        resultCount: sourcePreviewState === "multiple_candidates" ? visibleSourceCandidates.length : primarySourceCandidate ? 1 : 0,
        feedbackTitle: feedback.tone === "error" ? feedback.title : null,
        feedbackLines: feedback.tone === "error" ? feedback.lines : [],
      }),
    [feedback.lines, feedback.title, feedback.tone, primarySourceCandidate, sourcePreviewState, visibleSourceCandidates.length],
  );
  const sourcePreviewItems = primarySourceCandidate?.sample_items ?? [];
  const sourcePrimaryMetrics = useMemo(
    () =>
      buildSourcePreviewMetrics({
        candidate: primarySourceCandidate,
        unreadCount: sourceExistingChannel?.unread_count ?? null,
        discoveryLabel: getSourceDiscoveryModeLabel(channelPreview?.discovery.mode),
        languageLabel: primarySourceCandidate ? getSourceLanguageLabel(primarySourceCandidate.language) : null,
      }),
    [channelPreview?.discovery.mode, primarySourceCandidate, sourceExistingChannel?.unread_count],
  );
  const sourceTopicChips = useMemo(() => {
    return buildSourcePreviewTopics({
      category,
      existingCategory: sourceExistingChannel?.category ?? null,
      inputUrl,
      feedUrl: primarySourceCandidate?.feed_url ?? null,
      siteUrl: primarySourceCandidate?.site_url ?? null,
      language: primarySourceCandidate?.language ?? null,
      modeLabel: currentSourceAddMode.label,
      sampleItems: primarySourceCandidate?.sample_items ?? [],
      sourceGroupNames: sourceGroups.map((group) => group.name),
    });
  }, [category, currentSourceAddMode.label, inputUrl, primarySourceCandidate, sourceExistingChannel, sourceGroups]);
  const shouldShowSourceFeedback =
    (!lastAddedSource && feedback.tone !== "idle" && sourcePreviewState !== "error") ||
    subscribeBusy ||
    opmlImportBusy ||
    captureBusy;
  const hasReaderSearch = deferredItemSearch.trim().length > 0;

  useEffect(() => {
    if (!sourceLanguageOptions.some((option) => option.value === sourceLanguageFilter)) {
      setSourceLanguageFilter("all");
    }
  }, [sourceLanguageFilter, sourceLanguageOptions]);

  useEffect(() => {
    return () => {
      sourcePreviewAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!previewBusy) {
      setSourcePreviewSlow(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSourcePreviewSlow(true);
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [previewBusy]);

  useEffect(() => {
    const target = pendingSourceFocusTargetRef.current;
    if (!target) {
      return;
    }

    if (target === "category") {
      if (!showSourceOptions || !sourceCategoryInputRef.current) {
        return;
      }
      sourceCategoryInputRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "backoffice") {
      if (sourceSurfaceMode !== "manage" || !sourceBackofficeRegionRef.current) {
        return;
      }
      sourceBackofficeRegionRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "results") {
      if (sourcePreviewState === "loading" || !sourceResultsRegionRef.current) {
        return;
      }
      sourceResultsRegionRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "import") {
      if (sourceAddMode !== "import_feeds" || !sourceImportTextareaRef.current) {
        return;
      }
      sourceImportTextareaRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "input" && sourceInputRef.current) {
      sourceInputRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
    }
  }, [showSourceOptions, sourceAddMode, sourcePreviewState, sourceSurfaceMode]);

  const readerSectionLabel =
    libraryView === "continue"
      ? "Kontynuuj czytanie"
      : libraryView === "saved"
      ? showReadItems
        ? "Zapisane artykuly"
        : "Nieprzeczytane zapisane"
      : libraryView === "digest"
        ? showReadItems
          ? "Kolejka digestu"
          : "Nieprzeczytana kolejka digestu"
      : libraryView === "archive"
        ? "Zarchiwizowane artykuly"
      : showReadItems
          ? "Skrzynka"
          : "Nieprzeczytana skrzynka";

  const uiRuntimeLinks = [
    { href: "/api/health", label: "Stan web" },
    { href: `${apiBaseUrl}/health`, label: "Stan API" },
    { href: "/api/diagnostics/startup", label: "Diagnostyka" },
  ];
  const uiTopRankingItems = rankingItems.slice(0, 8);
  const uiSectionCopy: Record<AppSection, { eyebrow: string; title: string; description: string }> = {
    read: {
      eyebrow: "Czytaj",
      title: readerSectionLabel,
      description: deferredItemSearch.trim()
        ? `Wyniki wyszukiwania dla "${deferredItemSearch.trim()}".`
        : "Czytaj, triage'uj i wracaj do kolejki bez przechodzenia przez panele operacyjne.",
    },
    discover: {
      eyebrow: "Odkrywaj",
      title: "Przegląd dnia",
      description: "Briefing, rekomendacje i klastry historii pomagające zdecydować, co warto przeczytać teraz.",
    },
    sources: {
      eyebrow: "Źródła",
      title: "Dodawanie źródeł",
      description: "Dodaj stronę albo feed, zobacz wynik wykrywania i dopiero wtedy zapisz źródło do biblioteki.",
    },
    magazines: {
      eyebrow: "Magazyny",
      title: "Magazyny",
      description: "Archiwum numerów Kindle z najciekawszymi artykułami z Twoich źródeł.",
    },
    digest: {
      eyebrow: "Digest",
      title: "Digest i dostarczanie",
      description: "Buduj preview, eksportuj EPUB i wysylaj wydania bez mieszania tego z codziennym czytaniem.",
    },
    settings: {
      eyebrow: "Ustawienia",
      title: "Ustawienia i profil czytania",
      description: "Konfiguracja delivery, preferencje rankingu i runtime helpers w jednym miejscu.",
    },
  };

  const uiGlobalNav = [
    {
      id: "read" as const,
      shortLabel: "R",
      label: "Czytaj",
      icon: <ReaderIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({
        section: "read",
        libraryView,
        scope: showReadItems ? "all" : "unread",
        sort: itemSortMode,
        q: itemSearch.trim() || null,
        item: activeItemId,
        mode: readerQueueMode,
      }),
      meta: totalUnreadCount,
    },
    {
      id: "discover" as const,
      shortLabel: "O",
      label: "Odkrywaj",
      icon: <DiscoverIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "discover" }),
      meta: uiTopRankingItems.length,
    },
    {
      id: "sources" as const,
      shortLabel: "Z",
      label: "Źródła",
      icon: <SourcesIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "sources" }),
      meta: activeChannelCount,
    },
    {
      id: "digest" as const,
      shortLabel: "D",
      label: "Digest",
      icon: <DigestIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "digest" }),
      meta: persistedDigestCandidateCount ?? digestCandidateIds.length,
    },
    {
      id: "magazines" as const,
      shortLabel: "M",
      label: "Magazyny",
      icon: <KindleIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "magazines" }),
      meta: digestHistory.length,
    },
    {
      id: "settings" as const,
      shortLabel: "U",
      label: "Ustawienia",
      icon: <SettingsIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "settings" }),
      meta: deliverySettings?.smtp_ready ? "ok" : "cfg",
    },
  ];
  const currentSectionNavItem = uiGlobalNav.find((item) => item.id === currentSection) ?? uiGlobalNav[0];
  const activeFeedScopeBaseLabel =
    feedFilter.kind === "channel"
      ? channelTitles[feedFilter.value] ?? "Wybrane zrodlo"
      : feedFilter.kind === "category"
        ? feedFilter.value
        : "Wszystkie feedy";
  const readerQueueModeLabel =
    readerQueueMode === "for_you"
      ? "Dla mnie"
      : readerQueueMode === "latest"
        ? "Najnowsze"
        : readerQueueMode === "hidden"
          ? "Ukryte"
          : "Wszystkie";
  const activeFeedScopeLabel =
    libraryView === "inbox"
      ? feedFilter.kind === "all"
        ? readerQueueModeLabel
        : `${readerQueueModeLabel} - ${activeFeedScopeBaseLabel}`
      : feedFilter.kind === "all"
        ? getLibraryViewLabel(libraryView)
        : `${getLibraryViewLabel(libraryView)} - ${activeFeedScopeBaseLabel}`;

  function openCaptureScreen() {
    router.push("/capture");
  }

  function navigateToReadLibraryView(
    nextLibraryView: LibraryView,
    options?: {
      itemId?: string | null;
      search?: string | null;
      showReadItems?: boolean;
      sort?: ItemSortMode;
      surface?: "article" | "browse";
      mode?: AppReaderMode;
    },
  ) {
    const hasSearchOverride = options?.search !== undefined;
    const nextShowReadItems = options?.showReadItems ?? viewPreferences[nextLibraryView]?.showReadItems ?? showReadItems;
    const nextSort = options?.sort ?? itemSortMode;
    const nextReaderQueueMode = options?.mode ?? readerQueueMode;
    const nextItemId = options?.itemId ?? null;
    const nextSearchText = (hasSearchOverride ? (options?.search ?? "") : itemSearch).trim();
    const shouldOpenArticle = options?.surface === "article" && Boolean(nextItemId);
    const nextReadingItemId = shouldOpenArticle && nextItemId ? nextItemId : null;
    const continuity: ReaderContinuitySnapshot = {
      section: "read",
      activeItemId: nextItemId,
      readingItemId: nextReadingItemId,
      showReadItems: nextShowReadItems,
      libraryView: nextLibraryView,
      itemSearch: nextSearchText,
    };
    const href = buildAppHref({
      section: "read",
      libraryView: nextLibraryView,
      scope: nextShowReadItems ? "all" : "unread",
      sort: nextSort,
      q: nextSearchText || null,
      item: nextItemId,
      surface: shouldOpenArticle ? "article" : null,
      mode: nextReaderQueueMode,
    });

    pendingContinuityRouteRestoreRef.current = {
      href,
      section: "read",
      continuity,
    };
    setViewPreferences((current) =>
      patchViewPreferenceMap(current, nextLibraryView, {
        showReadItems: nextShowReadItems,
        sort: nextSort,
      }),
    );
    setPreferredSection("read");
    setReaderQueueMode(nextReaderQueueMode);
    dispatchReader({
      type: "navigate_library_view",
      activeItemId: nextItemId,
      itemSearch: hasSearchOverride ? nextSearchText : undefined,
      itemSortMode: nextSort,
      libraryView: nextLibraryView,
      readingItemId: nextReadingItemId,
      readSurfaceMode: shouldOpenArticle ? "article" : "browse",
      showReadItems: nextShowReadItems,
    });
    router.push(href);
  }

  function folderContainsSelectedFilter(folder: FeedBrowserTreeFolder): boolean {
    if (feedFilter.kind === "category" && feedFilter.value === folder.id) {
      return true;
    }

    if (feedFilter.kind === "channel" && folder.channels.some((channel) => channel.id === feedFilter.value)) {
      return true;
    }

    return folder.children.some((child) => folderContainsSelectedFilter(child));
  }

  type FeedBrowserFolderNode = {
    id: string;
    label: string;
    meta: string | number;
    active?: boolean;
    expanded?: boolean;
    onSelect: () => void;
    onToggle: () => void;
    children: FeedBrowserFolderNode[];
    channels: {
      id: string;
      label: string;
      siteUrl: string | null;
      meta: string | number;
      active?: boolean;
      onSelect: () => void;
    }[];
  };

  function mapFolderToFeedBrowserNode(folder: FeedBrowserTreeFolder): FeedBrowserFolderNode {
    const isActive = feedFilter.kind === "category" && feedFilter.value === folder.id;
    const isExpanded = isActive || folderContainsSelectedFilter(folder) || !collapsedFeedFolders.includes(folder.id);

    return {
      id: folder.id,
      label: folder.label,
      meta: folder.unreadCount,
      active: isActive,
      expanded: isExpanded,
      onSelect: () => {
        setReaderFeedFilter({ kind: "category", value: folder.id });
        setIsSidebarOpen(false);
      },
      onToggle: () =>
        setCollapsedFeedFolders((current) =>
          current.includes(folder.id)
            ? current.filter((entry) => entry !== folder.id)
            : [...current, folder.id],
        ),
      children: folder.children.map((child) => mapFolderToFeedBrowserNode(child)),
      channels: folder.channels.map((channel) => ({
        id: channel.id,
        label: channel.label,
        siteUrl: channel.siteUrl,
        meta: channel.unreadCount,
        active: feedFilter.kind === "channel" && feedFilter.value === channel.id,
        onSelect: () => {
          setReaderFeedFilter({ kind: "channel", value: channel.id });
          setIsSidebarOpen(false);
        },
      })),
    };
  }

  function renderUiFeedbackCard(options?: { live?: boolean; regionId?: string; testId?: string }) {
    return (
      <section
        aria-atomic={options?.live ? "true" : undefined}
        aria-live={options?.live ? "polite" : undefined}
        className={`feedback-card feedback-${feedback.tone}`}
        data-testid={options?.testId}
        id={options?.regionId}
        role={options?.live ? "status" : undefined}
      >
        <strong>{feedback.title}</strong>
        <ul className="feedback-list">
          {feedback.lines.map((line, lineIndex) => (
            <li key={`${line}-${lineIndex}`}>{line}</li>
          ))}
        </ul>
      </section>
    );
  }

  function renderUiReadRail() {
    return (
      <div className="screen-stack">
        <WorkspacePanel
          description="Kanoniczne widoki biblioteki. Tutaj zaczyna sie codzienna sesja czytania."
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <LibraryIcon className="app-icon app-icon-xs" />
              Biblioteka
            </span>
          }
          title="Widoki czytelnika"
        >
          <LibraryViewsNav
            items={[
              {
                id: "inbox",
                label: "Skrzynka",
                meta: libraryView === "inbox" ? queueItems.length : totalUnreadCount,
                hint: "Domyslny przeplyw",
                active: libraryView === "inbox",
                onSelect: () => navigateToReadLibraryView("inbox"),
              },
              {
                id: "continue",
                label: "Kontynuuj",
                meta: libraryView === "continue" ? queueItems.length : continueReadingCount,
                hint: "Wroc do rozpoczetego czytania",
                active: libraryView === "continue",
                onSelect: () => navigateToReadLibraryView("continue"),
              },
              {
                id: "saved",
                label: "Zapisane",
                meta: libraryView === "saved" ? queueItems.length : visibleFavoriteCount,
                hint: "Wazne na pozniej",
                active: libraryView === "saved",
                onSelect: () => navigateToReadLibraryView("saved"),
              },
              {
                id: "digest",
                label: "Digest queue",
                meta: libraryView === "digest" ? queueItems.length : persistedDigestCandidateCount ?? digestCandidateIds.length,
                hint: "Krotka lista do wydania",
                active: libraryView === "digest",
                highlighted: Boolean(firstDigestCandidate),
                onSelect: () => {
                  if (firstDigestCandidate) {
                    navigateToReadLibraryView("digest", {
                      itemId: firstDigestCandidate.id,
                    });
                    return;
                  }
                  setFeedback({
                    tone: "idle",
                    title: "Kolejka digestu jest pusta",
                    lines: ["Oznacz artykuly klawiszem D albo przyciskiem Digest, aby przygotowac kolejne wydanie."],
                  });
                },
              },
              {
                id: "archive",
                label: "Archiwum",
                meta: libraryView === "archive" ? queueItems.length : archivedChannelCount,
                hint: "Historia i odzyskiwanie",
                active: libraryView === "archive",
                onSelect: () => navigateToReadLibraryView("archive"),
              },
            ]}
          />
        </WorkspacePanel>

        <WorkspacePanel
          description="Szybkie wejscia do biblioteki, kiedy nie chcesz zaczynac od surowej chronologii."
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <ReaderIcon className="app-icon app-icon-xs" />
              Powroty
            </span>
          }
          title="Szybkie sciezki"
          tone="success"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <WorkspaceButton
              active={recallWindow === "all" && libraryView === "inbox"}
              onClick={() => {
                setReaderRecallWindow("all");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
            >
              Cala kolejka
            </WorkspaceButton>
            <WorkspaceButton
              active={recallWindow === "today"}
              onClick={() => {
                setReaderRecallWindow("today");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
              tone="accent"
            >
              Dzis
            </WorkspaceButton>
            <WorkspaceButton
              active={recallWindow === "week"}
              onClick={() => {
                setReaderRecallWindow("week");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
            >
              Ten tydzien
            </WorkspaceButton>
            <WorkspaceButton
              active={libraryView === "saved" && itemSortMode === "newest"}
              onClick={() => {
                setReaderRecallWindow("all");
                navigateToReadLibraryView("saved", {
                  showReadItems: true,
                  sort: "newest",
                });
              }}
            >
              Ostatnio zapisane
            </WorkspaceButton>
          </div>
        </WorkspacePanel>

        {(savedViewChips.length > 0 || deferredItemSearch.trim()) ? (
          <WorkspacePanel
            eyebrow={
              <span className="workspace-eyebrow-with-icon">
                <BookmarkIcon className="app-icon app-icon-xs" />
                Pinned views
              </span>
            }
            title="Zapisane filtry"
            description="Zapisane widoki i szybki powrot do ostatnich zapytan."
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
              {savedViewChips.map((chip) => (
                <SavedViewChip
                  key={chip.id}
                  onClear={() => setReaderItemSearch("")}
                  onSelect={(viewId) => {
                    const savedView = savedSearches.find((entry) => entry.id === viewId);
                    if (!savedView) {
                      return;
                    }
                    navigateToReadLibraryView(savedView.default_view, {
                      search: savedView.query,
                    });
                  }}
                  view={chip}
                />
              ))}
              <WorkspaceButton disabled={!deferredItemSearch.trim()} onClick={() => void handleCreateSavedSearch()} tone="accent">
                <span className="button-with-icon">
                  <BookmarkIcon className="app-icon button-inline-icon" />
                  Zapisz biezace zapytanie
                </span>
              </WorkspaceButton>
            </div>
          </WorkspacePanel>
        ) : null}
      </div>
    );
  }

  function renderUiReadInspector() {
    return (
      <div className="screen-stack">
        <WorkspacePanel
          description={selectedItem ? `Organizuj ${selectedItem.title} tagami, kolekcjami i notatkami.` : "Wybierz artykul, aby dodac tagi, kolekcje i notatki."}
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <NoteIcon className="app-icon app-icon-xs" />
              Inspector
            </span>
          }
          title="Adnotacje i porzadkowanie"
          tone="warning"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
            {itemTags.map((tag) => (
              <WorkspaceChip key={tag.id} active tone="accent">
                {tag.name}
              </WorkspaceChip>
            ))}
            {!selectedItem ? <WorkspaceChip>Najpierw wybierz artykul</WorkspaceChip> : null}
          </div>

          <div style={{ display: "grid", gap: "0.55rem" }}>
            <input onChange={(event) => setTagDraft(event.target.value)} placeholder="Dodaj tagi: rynek, longform, explainery" value={tagDraft} />
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
              <WorkspaceButton disabled={!selectedItem || !tagDraft.trim() || workspaceBusy} onClick={() => void handleSaveTags()} tone="accent">
                <span className="button-with-icon">
                  <BookmarkIcon className="app-icon button-inline-icon" />
                  Zapisz tagi
                </span>
              </WorkspaceButton>
              <input onChange={(event) => setCollectionDraft(event.target.value)} placeholder="Nowa kolekcja" value={collectionDraft} />
              <WorkspaceButton disabled={!collectionDraft.trim() || workspaceBusy} onClick={() => void handleCreateCollection()}>
                <span className="button-with-icon">
                  <LibraryIcon className="app-icon button-inline-icon" />
                  Utworz kolekcje
                </span>
              </WorkspaceButton>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              {collections.map((collection) => (
                <WorkspaceButton key={collection.id} disabled={!selectedItem || workspaceBusy} onClick={() => void handleAddToCollection(collection.id)}>
                  {collection.name} ({collection.item_count})
                </WorkspaceButton>
              ))}
            </div>

            {selectedTextQuote ? (
              <blockquote style={{ margin: 0, padding: "0.75rem 0.9rem", borderRadius: "0.75rem", background: "var(--surface-subtle)", border: "1px solid var(--line)" }}>
                {selectedTextQuote}
              </blockquote>
            ) : null}

            <textarea onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Napisz notatke albo dodaj komentarz do biezacego zaznaczenia" rows={4} value={annotationDraft} />
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
              <WorkspaceButton disabled={!selectedItem || !annotationDraft.trim() || workspaceBusy} onClick={() => void handleCreateNote()} tone="accent">
                <span className="button-with-icon">
                  <NoteIcon className="app-icon button-inline-icon" />
                  Zapisz notatke
                </span>
              </WorkspaceButton>
              <WorkspaceButton disabled={!selectedItem || !selectedTextQuote.trim() || workspaceBusy} onClick={() => void handleCreateHighlight()} tone="warning">
                <span className="button-with-icon">
                  <HighlightIcon className="app-icon button-inline-icon" />
                  Zapisz podkreslenie
                </span>
              </WorkspaceButton>
            </div>
          </div>
        </WorkspacePanel>

        <AnnotationPanel panel={annotationPanelModel} />
      </div>
    );
  }

  function renderUiFeedArticle() {
    if (!selectedItem) {
      return (
        <div className="reader-state-card">
          <strong>Wybierz artykul</strong>
          <p>Otworz artykul ze strumienia feedu, aby przejsc do czystego trybu czytania.</p>
        </div>
      );
    }

    const previewItem = itemDetail && itemDetail.id === selectedItem.id ? itemDetail : selectedItem;
    const qualityState = getReaderQualityState(selectedItem, itemDetail, itemDetailStatus);
    const canReextractSelected = shouldOfferReextract(selectedItem, itemDetail, itemDetailStatus);
    const readerWordCount =
      itemDetail && itemDetail.id === selectedItem.id
        ? countWords(itemDetail.content_text ?? itemDetail.excerpt)
        : countWords(selectedItem.excerpt);
    const highlightCount = itemAnnotations.filter((annotation) => annotation.kind === "highlight").length;
    const noteCount = itemAnnotations.filter((annotation) => annotation.kind === "note").length;
    const sanitizedCleanedHtml =
      itemDetail && itemDetail.id === selectedItem.id
        ? sanitizeReaderHtml(itemDetail.cleaned_html, selectedItem.title)
        : null;
    const readerView =
      itemDetail && itemDetail.id === selectedItem.id
        ? sanitizedCleanedHtml
          ? "cleaned_html"
          : itemDetail.content_text
            ? "content_text"
            : itemDetail.excerpt
              ? "excerpt"
              : "missing"
        : selectedItem.excerpt
          ? "excerpt"
          : "missing";
    const highlightedCleanedHtml =
      itemDetail && itemDetail.id === selectedItem.id && sanitizedCleanedHtml
        ? renderInlineHighlightHtml(sanitizedCleanedHtml, itemAnnotations)
        : null;
    const bodyParagraphs =
      itemDetail && itemDetail.id === selectedItem.id
        ? readerView === "content_text"
          ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.content_text), selectedItem.title)
          : readerView === "excerpt"
            ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.excerpt), selectedItem.title)
            : []
        : sanitizeReaderParagraphs(splitReaderParagraphs(selectedItem.excerpt), selectedItem.title);
    const resumeProgress = readerProgress[selectedItem.id];
    const readerSurfaceClasses = [
      "reader-reading-surface",
      "feed-reader-surface",
      `reader-reading-surface-width-${readerWidthMode}`,
      `reader-reading-surface-text-${readerTextMode}`,
      `reader-reading-surface-media-${readerImageMode}`,
    ].join(" ");
    const sourceLabel = previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo";
    const detailLine =
      itemDetailStatus === "loading"
        ? "Przygotowujemy czysty widok artykulu."
        : itemDetailStatus === "ready" && readerView === "cleaned_html"
          ? `Czysty widok gotowy do czytania${readerWordCount ? ` · ${readerWordCount} slow` : ""}`
          : itemDetailStatus === "ready" && readerView === "content_text"
            ? `Pokazujemy tekst zastepczy${readerWordCount ? ` · ${readerWordCount} slow` : ""}`
            : itemDetailStatus === "ready" && readerView === "excerpt"
              ? "Dostepny jest tylko skrot artykulu."
              : itemDetailStatus === "error"
                ? itemDetailMessage ?? "Nie udalo sie wczytac pelnej tresci."
                : qualityState.description;
    const hasReadableBody =
      Boolean(itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml) ||
      bodyParagraphs.length > 0;
    const nextDecisionItemId = resolveReaderDecisionNextItemId(queueItems, selectedItem.id);
    const nextDecisionItem =
      nextDecisionItemId && nextDecisionItemId !== selectedItem.id
        ? queueItems.find((candidate) => candidate.id === nextDecisionItemId) ?? null
        : null;
    const decisionBusy = itemActionId === selectedItem.id;

    return (
      <section className="feed-reader-shell">
        <ReaderArticleTopbar
          busy={decisionBusy}
          canReextract={canReextractSelected}
          digestCandidate={selectedItem.digest_candidate}
          isArchived={selectedItem.is_archived}
          isFavorite={selectedItem.is_favorite}
          isRead={selectedItem.is_read}
          kindleBusy={articleKindleBusyId === selectedItem.id}
          kindleReady={Boolean(deliverySettings?.smtp_ready)}
          onBackToFeed={() => dispatchReader({ type: "show_browse" })}
          onReextract={() => void handleReextractItem(selectedItem, "write")}
          onReaderFeedback={(action) => void handleReaderFeedback(selectedItem.id, action)}
          onSendToKindle={() => void handleSendArticleToKindle(selectedItem)}
          onToggleArchive={() =>
            void mutateItemState(selectedItem, {
              library_action: selectedItem.is_archived ? "restore" : "archive",
            })
          }
          onToggleDigest={() => void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate })}
          onToggleFavorite={() =>
            void mutateItemState(selectedItem, {
              library_action: selectedItem.is_favorite ? "unsave" : "save",
            })
          }
          onToggleInspector={() => setShowReadInspector((current) => !current)}
          onToggleRead={() => void mutateItemState(selectedItem, { is_read: !selectedItem.is_read })}
          reextractBusy={itemActionId === selectedItem.id || itemDetailStatus === "loading"}
          showInspector={showReadInspector}
          sourceUrl={selectedItem.source_url}
        />

        {articleKindleFeedback && articleKindleFeedback.itemId === selectedItem.id ? (
          <section
            aria-atomic="true"
            aria-live="polite"
            className={`feedback-card feedback-${articleKindleFeedback.tone} reader-kindle-feedback`}
            data-testid="reader-kindle-feedback"
            role="status"
          >
            <strong>{articleKindleFeedback.title}</strong>
            <ul className="feedback-list">
              {articleKindleFeedback.lines.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <ReaderDecisionBar
          busy={decisionBusy}
          canArchive={!selectedItem.is_archived}
          canUndo={Boolean(latestUndoEntry)}
          nextItemTitle={nextDecisionItem?.title ?? null}
          onAction={(action) => void handlePresetAction(action)}
          onUndo={() => void handleUndo()}
          undoBusy={undoBusy}
        />

        <ReaderArticleCard
          authorLabel={previewItem.author ? previewItem.author : "Autor nieznany"}
          bodyParagraphs={bodyParagraphs}
          contentRef={articleContentRef}
          detailLine={detailLine}
          digestCandidate={previewItem.digest_candidate}
          hasReadableBody={hasReadableBody}
          highlightedCleanedHtml={highlightedCleanedHtml}
          highlightCount={highlightCount}
          isFavorite={previewItem.is_favorite}
          isLoading={itemDetailStatus === "loading"}
          isRead={previewItem.is_read}
          noteCount={noteCount}
          onOpenSource={openSelectedSource}
          onSurfaceScroll={handleReadingSurfaceScroll}
          publishedLabel={formatTimestamp(previewItem.published_at, "Nieznany czas publikacji")}
          qualityAllowsInApp={qualityState.allowsInApp}
          qualityBadge={qualityState.badge}
          qualityDescription={qualityState.description}
          qualityHeading={qualityState.heading}
          readerSurfaceClasses={readerSurfaceClasses}
          resumeProgress={resumeProgress?.progress ?? null}
          sanitizedCleanedHtml={sanitizedCleanedHtml}
          showCleanedHtml={
            itemDetailStatus === "ready" &&
            Boolean(itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml)
          }
          sourceLabel={sourceLabel}
          title={previewItem.title}
        />

        {showReadInspector && !isFocusedMode ? <div className="feed-reader-inspector">{renderUiReadInspector()}</div> : null}
      </section>
    );
  }

  function renderUiReadSection() {
    const isBrowseMode = readSurfaceMode === "browse";

    if (!isBrowseMode) {
      return (
        <section className={`reader-pane reader-pane-flat reader-pane-article ${isFocusedMode ? "reader-pane-focused" : ""}`}>
          {itemsMessage && itemsStatus !== "unsupported" ? (
            <div className={`reader-inline-note ${itemsStatus === "error" ? "reader-inline-note-error" : ""}`}>
              {itemsMessage}
            </div>
          ) : null}

          {renderUiFeedArticle()}
        </section>
      );
    }

    const currentLibraryLabel = getLibraryViewLabel(libraryView);
    const emptySearch = deferredItemSearch.trim();
    const emptySourceCandidates = [
      ...sourceHealthEntries.map((entry) => mapHealthEntryToReaderEmptySource(entry)),
      ...channels.map((channel) => mapChannelToReaderEmptySource(channel)),
    ];
    const matchingEmptySource = findReaderEmptySourceCandidate(emptySearch, emptySourceCandidates);
    const hasAnySource = channels.length > 0 || sourceHealthEntries.length > 0;
    const hasAnyItem =
      items.length > 0 ||
      channels.some((channel) => channel.unread_count > 0) ||
      sourceHealthEntries.some((entry) => {
        const knownItemCount = countKnownSourceItems(entry);
        return knownItemCount !== null && knownItemCount > 0;
      });
    const hasScopeFilteredItems = visibleItems.length === 0 && libraryScopedItems.length > 0;
    const problematicSourceCount = sourceHealthEntries.filter((entry) =>
      entry.reading_readiness === "blocked" || entry.reading_readiness === "degraded" || entry.health_status === "error",
    ).length;
    const emptyCopy = buildReaderEmptyStateCopy({
      currentLibraryLabel,
      hasAnyItem,
      hasAnySource,
      hasScopeFilteredItems,
      libraryView,
      matchingSource: matchingEmptySource,
      problematicSourceCount,
      search: emptySearch,
    });
    const showAllEmptyActionTone: "default" | "accent" = emptySearch ? "default" : "accent";
    const showAllEmptyActionLabel =
      libraryView === "inbox"
        ? emptySearch
          ? "Pokaż wszystkie artykuły"
          : "Pokaż całą skrzynkę"
        : "Pokaż artykuły do czytania";
    const emptyActions = [
      ...(emptySearch
        ? [
            {
              label: "Wyczyść wyszukiwanie",
              onClick: () => navigateToReadLibraryView(libraryView, { search: "", showReadItems }),
              tone: "accent" as const,
            },
          ]
        : []),
      {
        label: showAllEmptyActionLabel,
        onClick: () =>
          navigateToReadLibraryView("inbox", {
            search: "",
            showReadItems: true,
          }),
        tone: showAllEmptyActionTone,
      },
      {
        label: "Uruchom sync",
        onClick: () => void handleSyncAll(),
        disabled: isSyncing || !hasAnySource,
      },
      {
        label: "Przejdź do źródeł",
        onClick: () => router.push(buildAppHref({ section: "sources" })),
      },
    ];

    return (
      <ReaderBrowseView
        activeFeedScopeLabel={activeFeedScopeLabel}
        activeItemId={activeItemId}
        busyItemId={itemActionId}
        channelSiteUrls={channelSiteUrls}
        channelTitles={channelTitles}
        emptyActions={emptyActions}
        emptyDescription={emptyCopy.description}
        emptyDiagnosticDescription={emptyCopy.diagnosticDescription}
        emptyDiagnosticTitle={emptyCopy.diagnosticTitle}
        emptyTitle={emptyCopy.title}
        formatTimestamp={formatTimestamp}
        isFocusedMode={isFocusedMode}
        isLoading={itemsStatus === "loading"}
        itemSearch={itemSearch}
        itemSortMode={itemSortMode}
        items={queueItems}
        message={itemsMessage}
        messageTone={itemsStatus === "error" ? "error" : "default"}
        rankingExplanations={rankingExplanations}
        onItemSearchChange={setReaderItemSearch}
        onOpenItem={(itemId) => dispatchReader({ type: "open_item", itemId })}
        onRefresh={() => void loadItems()}
        onReaderFeedback={(itemId, action) => void handleReaderFeedback(itemId, action)}
        onReaderQueueModeChange={(mode) => {
          const nextShowReadItems = mode === "all" ? true : mode === "for_you" || mode === "hidden" ? false : showReadItems;
          navigateToReadLibraryView("inbox", {
            mode,
            search: "",
            showReadItems: nextShowReadItems,
            sort: "newest",
          });
        }}
        onSelectItem={(itemId) => dispatchReader({ type: "select_item", itemId })}
        onShowReadItemsChange={setReaderShowReadItems}
        onSortModeChange={setReaderItemSortMode}
        onToggleDigest={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { digest_candidate: !item.digest_candidate });
          }
        }}
        onEmptyAction={null}
        onToggleFavorite={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { library_action: item.is_favorite ? "unsave" : "save" });
          }
        }}
        onToggleRead={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { is_read: !item.is_read });
          }
        }}
        showMessage={Boolean(itemsMessage && itemsStatus !== "unsupported")}
        showReadItems={showReadItems}
        readerQueueMode={readerQueueMode}
        visibleUnreadCount={visibleUnreadCount}
      />
    );
  }

  function renderUiDiscoverSection() {
    const primaryDiscoverItem = workspaceBriefing?.resume_item ?? uiTopRankingItems[0]?.item ?? null;

    return (
      <section className="section-screen">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <DiscoverIcon className="app-icon app-icon-xs" />
              {uiSectionCopy.discover.eyebrow}
            </span>
            <h1>{uiSectionCopy.discover.title}</h1>
            <p>{uiSectionCopy.discover.description}</p>
          </div>
          <div className="section-screen-header-actions">
            <button
              className="action-button compact-button"
              onClick={() =>
                primaryDiscoverItem
                  ? void focusArticleById(primaryDiscoverItem.id, { origin: "discover" })
                  : router.push(buildAppHref({ section: "read" }))
              }
              type="button"
            >
              <span className="button-with-icon">
                <ReaderIcon className="app-icon button-inline-icon" />
                {primaryDiscoverItem ? "Czytaj najlepsze" : "Przejdź do czytnika"}
              </span>
            </button>
            <button className="secondary-button compact-button" onClick={() => router.push(buildAppHref({ section: "sources" }))} type="button">
              <span className="button-with-icon">
                <SourcesIcon className="app-icon button-inline-icon" />
                Dodaj źródło
              </span>
            </button>
          </div>
        </div>

        <div aria-label="Mapa odkrywania RSSmastera" className="discover-guide-grid" role="list">
          <article className="discover-guide-card discover-guide-card-primary" role="listitem">
            <span>1</span>
            <strong>Treści z obecnych feedów</strong>
            <p>Ranking i briefing pomagają wybrać, co warto przeczytać teraz z już obserwowanych źródeł.</p>
            <button
              className="mini-button mini-button-accent"
              onClick={() =>
                primaryDiscoverItem
                  ? void focusArticleById(primaryDiscoverItem.id, { origin: "discover" })
                  : router.push(buildAppHref({ section: "read" }))
              }
              type="button"
            >
              {primaryDiscoverItem ? "Otwórz rekomendację" : "Otwórz skrzynkę"}
            </button>
          </article>
          <article className="discover-guide-card" role="listitem">
            <span>2</span>
            <strong>Nowe źródła</strong>
            <p>Jeśli chcesz poszerzyć bibliotekę, przejdź do źródeł: tam dodasz stronę, RSS albo import OPML.</p>
            <button className="mini-button" onClick={() => router.push(buildAppHref({ section: "sources" }))} type="button">
              Dodaj feed
            </button>
          </article>
          <article className="discover-guide-card" role="listitem">
            <span>3</span>
            <strong>Historie i klastry</strong>
            <p>Story clusters pokazują kilka tekstów wokół tej samej historii, żeby szybciej złapać kontekst.</p>
            <button
              className="mini-button"
              onClick={() => document.getElementById("discover-story-clusters")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              type="button"
            >
              Zobacz klastry ({storyClusters.length})
            </button>
          </article>
        </div>

        <div className="section-grid section-grid-two">
          <div className="screen-stack">
            {workspaceBriefing ? (
              <WorkspacePanel
                eyebrow={
                  <span className="workspace-eyebrow-with-icon">
                    <SparkIcon className="app-icon app-icon-xs" />
                    Briefing
                  </span>
                }
                title="Dziś w skrócie"
                description="Najważniejsze sygnały z kolejki, źródeł i rankingu w jednym widoku startowym."
                tone="accent"
              >
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {workspaceBriefing.summary_lines.map((line, lineIndex) => (
                     <span key={`${line}-${lineIndex}`} style={{ fontSize: "0.9rem", lineHeight: 1.55 }}>
                      {line}
                    </span>
                  ))}
                </div>
                {workspaceBriefing.resume_item ? (
                  <WorkspaceButton onClick={() => void focusArticleById(workspaceBriefing.resume_item!.id, { origin: "discover" })} style={{ marginTop: "0.8rem", width: "100%", justifyContent: "space-between" }} tone="accent">
                    <span className="button-with-icon">
                      <ReaderIcon className="app-icon button-inline-icon" />
                      Wznow czytanie
                    </span>
                    <strong>{workspaceBriefing.resume_item.title}</strong>
                  </WorkspaceButton>
                ) : null}
                {workspaceBriefing.source_warnings.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
                    {workspaceBriefing.source_warnings.map((warning, warningIndex) => (
                      <WorkspaceChip key={`${warning}-${warningIndex}`} tone="warning">
                        {warning}
                      </WorkspaceChip>
                    ))}
                  </div>
                ) : null}
              </WorkspacePanel>
            ) : renderUiFeedbackCard()}

            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <SparkIcon className="app-icon app-icon-xs" />
                  Ranking
                </span>
              }
              title="Polecane teraz"
              description="Najwyżej ocenione artykuły z aktualnego rankingu, gotowe do otwarcia jednym kliknięciem."
              tone="success"
            >
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {uiTopRankingItems.map((entry) => (
                  <WorkspaceButton key={entry.item.id} onClick={() => void focusArticleById(entry.item.id, { origin: "discover" })} style={{ justifyContent: "space-between", textAlign: "left" }}>
                    <span style={{ display: "grid", gap: "0.18rem" }}>
                      <strong>{entry.item.title}</strong>
                      <small>{entry.item.channel_title}</small>
                    </span>
                    <WorkspaceChip active tone="accent">
                      {Math.round(entry.breakdown.final_score)}
                    </WorkspaceChip>
                  </WorkspaceButton>
                ))}
                {uiTopRankingItems.length === 0 ? <WorkspaceChip>Brak rekomendacji do wyświetlenia</WorkspaceChip> : null}
              </div>
            </WorkspacePanel>
          </div>

          <div className="screen-stack">
            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <NoteIcon className="app-icon app-icon-xs" />
                  Knowledge
                </span>
              }
              title="Wróć do własnych myśli"
              description="Przeszukiwalne notatki i podkreślenia w całej bibliotece."
              tone="accent"
            >
              <div style={{ display: "grid", gap: "0.65rem" }}>
                <input onChange={(event) => setAnnotationHubQuery(event.target.value)} placeholder="Szukaj notatek, cytatów z podkreśleń i treści adnotacji" value={annotationHubQuery} />
                {annotationHubLoading ? <WorkspaceChip>Szukanie adnotacji...</WorkspaceChip> : null}
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {annotationHubItems.map((annotation) => (
                    <WorkspaceButton key={annotation.id} onClick={() => void focusArticleById(annotation.item_id, { origin: "discover" })} style={{ justifyContent: "space-between", textAlign: "left" }}>
                      <span style={{ display: "grid", gap: "0.18rem" }}>
                        <strong>{annotation.kind === "highlight" ? "Podkreślenie" : "Notatka"}</strong>
                        <small>{annotation.note_text ?? annotation.quote_text ?? "Otwórz powiązany artykuł"}</small>
                      </span>
                      <WorkspaceChip active tone={annotation.kind === "highlight" ? "warning" : "accent"}>
                        {annotation.kind}
                      </WorkspaceChip>
                    </WorkspaceButton>
                  ))}
                  {!annotationHubLoading && annotationHubItems.length === 0 ? <WorkspaceChip>Brak pasujących adnotacji</WorkspaceChip> : null}
                </div>
              </div>
            </WorkspacePanel>

            <div className="screen-stack" id="discover-story-clusters">
              {storyClusters.slice(0, 6).map((cluster) => (
                <StoryClusterCard
                  actions={
                    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <WorkspaceButton onClick={() => void focusArticleById(cluster.primary.id, { origin: "discover" })} tone="accent">
                        Otwórz lead
                      </WorkspaceButton>
                      <WorkspaceButton
                        onClick={() =>
                          setExpandedStoryClusterIds((current) =>
                            current.includes(cluster.id) ? current.filter((entry) => entry !== cluster.id) : [...current, cluster.id],
                          )
                        }
                      >
                        {expandedStoryClusterIds.includes(cluster.id) ? "Zwiń" : `Pokaż alternatywy (${cluster.alternates.length})`}
                      </WorkspaceButton>
                    </div>
                  }
                  cluster={mapStoryClusterCard(cluster)}
                  key={cluster.id}
                  maxStories={expandedStoryClusterIds.includes(cluster.id) ? cluster.item_count : 3}
                  onStorySelect={(storyId) => void focusArticleById(storyId, { origin: "discover" })}
                />
              ))}
              {storyClusters.length === 0 ? (
                <WorkspacePanel
                  eyebrow={
                    <span className="workspace-eyebrow-with-icon">
                      <DiscoverIcon className="app-icon app-icon-xs" />
                      Stories
                    </span>
                  }
                  title="Klastry historii są puste"
                  description="Po kolejnym syncu i deduplikacji klastry historii pojawią się tutaj."
                >
                  <WorkspaceChip>Uruchom sync albo dodaj więcej źródeł, aby zobaczyć grupy tematyczne.</WorkspaceChip>
                </WorkspacePanel>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderUiSourcesSection() {
    return (
      <WorkspaceSourcesSection
        {...{
          activeChannelCount, activeChannelId, activateSourceAddMode, archivedChannelCount, category, channelPreview,
          channels, continuityImportInputRef, currentSourceAddMode, draftCategories, feedback, focusFirstItemFromChannel, handleArchive,
          handleCategorySave, handleConfirmChannelAdd, handleCreateSourceGroup, handleExportWorkspace, handleImportOpml, handleOpmlDraftChange, handlePreviewOpmlImport,
          handleSourceControlUpdate, handleSourceDraftInputChange, handleSourceTierChange, handleStateToggle, handleSubmit,
          handleSyncAll, inputUrl, isPending, isSyncing, lastAddedSource, latestRun, latestRunSummaryLine, opmlDraft, opmlImportBusy, opmlPreview,
          onSourceSuccessAddNext: handleSourceSuccessAddNext, onSourceSuccessOpen: handleSourceSuccessOpen,
          onSourceSuccessSync: handleSourceSuccessSync,
          pendingSourceFocusTargetRef, previewBusy, primarySourceCandidate, renderUiFeedbackCard, resetSourcePreviewState,
          setCategory, setDraftCategories, setShowSourceOptions, setSourceGroupColor, setSourceGroupDraft,
          setSourceLanguageFilter, setSourceSurfaceMode, shouldShowSourceFeedback, showSourceOptions, sourceAddMode,
          sourceBackofficeHeadingId, sourceBackofficeRegionId, sourceBackofficeRegionRef, sourceCategoryInputRef,
          sourceExistingChannel, sourceFeedbackRegionId, sourceGroupColor, sourceGroupDraft, sourceGroups, sourceHealthEntries,
          sourceImportTextareaRef, sourceInputRef, sourceLanguageFilter, sourceLanguageOptions, sourcePreviewAnnouncement,
          sourcePreviewItems, sourcePrimaryMetrics, sourcePreviewSlow, sourcePreviewState, sourcePrimaryModesLabelId, sourceResultsHeadingId, sourceResultsRegionId,
          sourceResultsRegionRef, sourceSearchHintId, sourceSearchOptionsId, sourceSearchOptionsNoteId,
          sourceSecondaryActionsLabelId, sourceSurfaceMode, sourceTopicChips,
          subscribeBusy, syncRuns, visibleSourceCandidates, workspaceBusy, workspaceExportBusy, workspaceImportBusy,
        }}
        copy={uiSectionCopy.sources}
        onCapture={() => router.push("/capture")}
      />
    );
  }
  function renderUiDigestSection() {
    return (
      <DigestSection
        buildDisabled={digestBusy || digestCandidateStatus === "loading"}
        busy={digestBusy}
        copy={uiSectionCopy.digest}
        countLabel={`${persistedDigestCandidateCount ?? digestCandidateIds.length} zapisanych`}
        deliveryBusy={deliveryBusy}
        deliveryLogs={deliveryLogs}
        deliveryPreflight={deliveryPreflight}
        deliverySettings={deliverySettings}
        feedbackCard={renderUiFeedbackCard()}
        formatDeliveryStatus={getDeliveryStatusLabel}
        formatTimestamp={formatTimestamp}
        hasLatestDigest={Boolean(latestDigest)}
        history={digestHistory}
        message={digestCandidateMessage}
        onBackToReader={() => router.push(buildAppHref({ section: "read" }))}
        onBuild={() => void handleDigestBuild()}
        onDeliveryPreflight={() => void handleDeliveryPreflight("kindle")}
        onPreview={() => void handleDigestPreview()}
        onSendDigestDryRun={() => void handleSendDigest("dry_run", "kindle")}
        onSendDigestLive={() => void handleSendDigest("send", "kindle")}
        onShowDigestQueue={() =>
          navigateToReadLibraryView("digest", {
            search: "",
            showReadItems: true,
          })
        }
        preview={digestPreview ?? digestCandidatePreview}
        previewDisabled={digestBusy || digestCandidateStatus === "loading"}
        queueCopy={digestQueueCopy}
        showSummaryActions={hasDigestReaderFilter || digestCandidateStatus === "empty"}
        status={digestCandidateStatus}
      />
    );
  }

  function handleSelectMagazineIssue(issueId: string) {
    setSelectedMagazineIssueId(issueId);
    router.push(buildAppHref({ section: "magazines", issue: issueId }));
  }

  function renderUiMagazineSection() {
    return (
      <MagazineSection
        activeIssueId={selectedMagazineIssueId}
        buildDisabled={digestBusy || digestCandidateStatus === "loading"}
        busy={digestBusy}
        copy={uiSectionCopy.magazines}
        countLabel={`${persistedDigestCandidateCount ?? digestCandidateIds.length} zapisanych`}
        deliveryBusy={deliveryBusy}
        deliveryPreflight={deliveryPreflight}
        deliverySettings={deliverySettings}
        feedbackCard={renderUiFeedbackCard()}
        formatDeliveryStatus={getDeliveryStatusLabel}
        formatTimestamp={formatTimestamp}
        history={digestHistory}
        message={digestCandidateMessage}
        onBackToReader={() => router.push(buildAppHref({ section: "read" }))}
        onBuild={() => void handleDigestBuild()}
        onDeliveryPreflight={(digest) => void handleDeliveryPreflight("kindle", digest)}
        onPreview={() => void handleDigestPreview()}
        onSelectIssue={handleSelectMagazineIssue}
        onSendDigestDryRun={(digest) => void handleSendDigest("dry_run", "kindle", digest)}
        onSendDigestLive={(digest) => void handleSendDigest("send", "kindle", digest)}
        onShowDigestQueue={() =>
          navigateToReadLibraryView("digest", {
            search: "",
            showReadItems: true,
          })
        }
        preview={digestPreview ?? digestCandidatePreview}
        previewDisabled={digestBusy || digestCandidateStatus === "loading"}
        status={digestCandidateStatus}
      />
    );
  }

  function handleDeliverySettingsDraftChange(field: keyof DeliverySettingsDraft, value: string) {
    setSettingsDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleAISettingsDraftChange(field: keyof AISettingsDraft, value: string | boolean) {
    setAISettingsDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === "openai_api_key" && typeof value === "string" && value.trim()
        ? { clear_openai_api_key: false }
        : {}),
    }));
  }

  function renderUiSettingsSection() {
    return (
      <WorkspaceSettingsSection
        activeChannelCount={activeChannelCount}
        aiPreflight={aiPreflight}
        aiPreflightBusy={aiPreflightBusy}
        aiSettings={aiSettings}
        aiSettingsBusy={aiSettingsBusy}
        aiSettingsDraft={aiSettingsDraft}
        aiSettingsMessage={aiSettingsMessage}
        apiBaseUrl={apiBaseUrl}
        authenticatedAccount={authenticatedAccount}
        authBusy={authBusy}
        authRequired={authRequired}
        copy={uiSectionCopy.settings}
        deliveryBusy={deliveryBusy}
        deliverySettings={deliverySettings}
        deliverySettingsMessage={deliverySettingsMessage}
        feedbackCard={renderUiFeedbackCard()}
        formatTimestamp={formatTimestamp}
        hasLocalAccounts={hasLocalAccounts}
        interestDraft={interestDraft}
        interestWeight={interestWeight}
        onAISettingsDraftChange={handleAISettingsDraftChange}
        onAISettingsPreflight={() => void handleAISettingsPreflight()}
        onAISettingsSave={() => void handleSaveAISettings()}
        onDeliverySettingsDraftChange={handleDeliverySettingsDraftChange}
        onDeliverySettingsPreflight={() => void handleDeliverySettingsPreflight()}
        onDeliverySettingsSave={() => void handleSaveDeliverySettings()}
        onInterestDraftChange={setInterestDraft}
        onInterestWeightChange={setInterestWeight}
        onLogin={() => openAuthScreen(hasLocalAccounts ? "login" : "register")}
        onLogout={() => void handleLogout()}
        onSaveWorkspaceProfile={saveWorkspaceProfile}
        rankingPreferences={rankingPreferences}
        runtimeLinks={uiRuntimeLinks}
        settingsBusy={settingsBusy}
        settingsDraft={settingsDraft}
        workspaceBusy={workspaceBusy}
        workspaceProfile={workspaceProfile}
      />
    );
  }
  const uiShellContent =
    currentSection === "discover"
      ? renderUiDiscoverSection()
      : currentSection === "sources"
          ? renderUiSourcesSection()
        : currentSection === "digest"
          ? renderUiDigestSection()
          : currentSection === "magazines"
            ? renderUiMagazineSection()
            : currentSection === "settings"
              ? renderUiSettingsSection()
              : renderUiReadSection();
  const isReadFeedSection = currentSection === "read";
  const readerArticleShellActive = isReadFeedSection && readSurfaceMode !== "browse";
  const readerFocusShellActive = isReadFeedSection && readSurfaceMode !== "browse" && isFocusedMode;
  const appShellClassName = [
    `app-shell-${currentSection}`,
    readerArticleShellActive ? "app-shell-reader-article" : "",
    readerFocusShellActive ? "app-shell-reader-focus" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const authReturnContext =
    currentSection === "sources"
      ? {
          label: "Źródła i dodawanie feedów",
          description:
            "Zaloguj się lub utwórz pierwsze konto, a RSSmaster wróci do ekranu źródeł bez gubienia aktualnej trasy.",
        }
      : currentSection === "digest"
        ? {
            label: "Digest",
            description: "Po zalogowaniu wrócisz do przygotowania digestu z zapisanych kandydatów.",
          }
        : currentSection === "magazines"
          ? {
              label: "Magazyny",
              description: "Po zalogowaniu wrócisz do pakowania kandydatów digestu w wydania Kindle.",
            }
          : currentSection === "settings"
            ? {
                label: "Ustawienia",
                description: "Po zalogowaniu wrócisz do konfiguracji lokalnej biblioteki i dostawy.",
              }
            : currentSection === "discover"
              ? {
                  label: "Odkrywaj",
                  description: "Po zalogowaniu wrócisz do przeglądania odkryć i rekomendowanych historii.",
                }
              : {
                  label: "Czytnik",
                  description: "Po zalogowaniu wrócisz do swojej kolejki czytania z zachowanym adresem widoku.",
                };

  if (authStatus !== "ready") {
    return (
      <LocalAuthGate
        authStatus={authStatus}
        screen={{
          busy: authBusy,
          form: authForm,
          hasLocalAccounts,
          message: authMessage,
          mode: resolvedAuthMode,
          onFormChange: (patch) => setAuthForm((current) => ({ ...current, ...patch })),
          onModeToggle: () => {
            setAuthMode((current) => (current === "login" ? "register" : "login"));
            setAuthMessage(null);
          },
          onSubmit: () => void handleAuthSubmit(),
          returnToDescription: authReturnContext.description,
          returnToLabel: authReturnContext.label,
        }}
      >
        {null}
      </LocalAuthGate>
    );
  }

  if (pathname === "/") {
    return (
      <section className="workspace-redirect-shell">
        <span className="panel-badge panel-badge-with-icon">
          <LibraryIcon className="app-icon app-icon-xs" />
          rssmaster
        </span>
        <h1>Przygotowuje nowy shell czytnika</h1>
        <p>Odtwarzam ostatni widok i przekierowuje do odpowiedniej sekcji produktu.</p>
      </section>
    );
  }

  return (
    <>
      <input
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => void handleImportContinuityBundleFile(event)}
        ref={continuityImportInputRef}
        type="file"
      />
      <AppShell
        className={appShellClassName || undefined}
        navRail={
          <div className="workspace-nav-rail">
            <div className="workspace-nav-rail-brand">
              <SourcesIcon className="app-icon workspace-nav-rail-brand-icon" />
            </div>

            <nav aria-label="Sekcje produktu" className="workspace-nav-rail-links">
              {uiGlobalNav.map((item) => (
                <button
                  className={`workspace-nav-rail-link ${currentSection === item.id ? "workspace-nav-rail-link-active" : ""}`}
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  type="button"
                >
                  <span className="workspace-nav-rail-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="workspace-nav-rail-text">{item.label}</span>
                  <strong>{item.meta}</strong>
                </button>
              ))}
            </nav>
          </div>
        }
        onSidebarClose={() => setIsSidebarOpen(false)}
        sidebarOpen={isSidebarOpen}
        header={
          <div className="workspace-appbar-shell">
            <div className={`workspace-appbar workspace-appbar-flat ${isReadFeedSection ? "workspace-appbar-feed-mode" : ""}`}>
              <div className="workspace-appbar-leading">
                {currentSection === "sources" ? (
                  <button
                    className="workspace-source-skip-button"
                    data-testid="source-skip-link"
                    onClick={() => {
                      if (sourceAddMode === "import_feeds") {
                        sourceImportTextareaRef.current?.focus();
                        return;
                      }

                      sourceInputRef.current?.focus();
                    }}
                    type="button"
                  >
                    {sourceAddMode === "import_feeds" ? "Przejdź do importu OPML" : "Przejdź do pola dodawania źródła"}
                  </button>
                ) : null}
                <button
                  aria-controls="rssmaster-sidebar"
                  aria-expanded={isSidebarOpen}
                  className="app-shell-menu-button"
                  onClick={() => setIsSidebarOpen(true)}
                  type="button"
                >
                  <span className="button-with-icon">
                    <MenuIcon className="app-icon button-inline-icon" />
                    Menu
                  </span>
                </button>
                <div className="workspace-appbar-brand">
                  <span className="workspace-appbar-mark">{currentSectionNavItem.icon}</span>
                  <div>
                    <strong>{currentSection === "read" ? activeFeedScopeLabel : uiSectionCopy[currentSection].title}</strong>
                    <span>{currentSection === "read" ? "Czytnik źródeł" : uiSectionCopy[currentSection].description}</span>
                  </div>
                </div>
              </div>

              <div />

              <div className="workspace-appbar-status">
                <button
                  aria-label="Zapisz link w RSSmasterze"
                  className="mini-button mini-button-accent"
                  data-testid="global-capture-action"
                  onClick={openCaptureScreen}
                  type="button"
                >
                  <span className="button-with-icon">
                    <CaptureIcon className="app-icon button-inline-icon" />
                    Zapisz link
                  </span>
                </button>
                {currentSection === "read" ? (
                  <button
                    className={`mini-button reader-focus-toggle ${isFocusedMode ? "mini-button-accent" : ""}`}
                    data-testid="reader-focus-toggle"
                    onClick={() => setIsFocusedMode((current) => !current)}
                    type="button"
                  >
                    {isFocusedMode ? "Wyjdź z trybu skupienia" : "Tryb skupienia"}
                  </button>
                ) : null}
                <AccountStatus
                  account={authenticatedAccount}
                  authRequired={authRequired}
                  busy={authBusy}
                  compact
                  formatTimestamp={formatTimestamp}
                  hasLocalAccounts={hasLocalAccounts}
                  onLogin={() => openAuthScreen(hasLocalAccounts ? "login" : "register")}
                  onLogout={() => void handleLogout()}
                />
                <span className="runtime-pill runtime-pill-ok" title={`API ${apiBaseUrl.replace(/^https?:\/\//, "")}`}>
                  API online
                </span>
              </div>
            </div>
          </div>
        }
        sidebar={
          <>
            <div className="app-sidebar-mobile-top">
              <strong>{activeFeedScopeLabel}</strong>
              <button className="mini-button" onClick={() => setIsSidebarOpen(false)} type="button">
                Zamknij
              </button>
            </div>
            <div className="workspace-mobile-nav">
              {uiGlobalNav.map((item) => (
                <button
                  className={`workspace-mobile-nav-link ${currentSection === item.id ? "workspace-mobile-nav-link-active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    router.push(item.href);
                    setIsSidebarOpen(false);
                  }}
                  type="button"
                >
                  <span className="workspace-mobile-nav-label">
                    <span className="workspace-mobile-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <strong>{item.meta}</strong>
                </button>
              ))}
              <button
                aria-label="Zapisz link w RSSmasterze"
                className="workspace-mobile-nav-link"
                data-testid="global-capture-action-mobile"
                onClick={() => {
                  openCaptureScreen();
                  setIsSidebarOpen(false);
                }}
                type="button"
              >
                <span className="workspace-mobile-nav-label">
                  <span className="workspace-mobile-nav-icon">
                    <CaptureIcon className="app-icon workspace-nav-rail-glyph" />
                  </span>
                  <span>Zapisz link</span>
                </span>
                <strong>+</strong>
              </button>
            </div>
            <FeedBrowser
              folders={feedBrowserFolders.map((folder) => mapFolderToFeedBrowserNode(folder))}
              onOverviewSelect={() => {
                setReaderFeedFilter({ kind: "all" });
                setIsSidebarOpen(false);
              }}
              onManageFeeds={() => {
                setReaderFeedFilter({ kind: "all" });
                setIsSidebarOpen(false);
              }}
              onAddFeed={() => {
                router.push(buildAppHref({ section: "sources" }));
                setIsSidebarOpen(false);
              }}
              onOpenSettings={() => {
                router.push(buildAppHref({ section: "settings" }));
                setIsSidebarOpen(false);
              }}
              overviewActive={feedFilter.kind === "all"}
              overviewLabel="Wszystkie feedy"
              overviewMeta={libraryScopedItems.length}
              title="Feedy"
            />
          </>
        }
      >
        {uiShellContent}
      </AppShell>

      {showKeyboardHelp ? (
        <div aria-modal="true" className="reader-command-overlay" onClick={() => setShowKeyboardHelp(false)} role="dialog">
          <div className="reader-command-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="reader-command-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <KeyboardIcon className="app-icon app-icon-xs" />
                  Pomoc klawiatury
                </span>
                <h3>Mapa komend</h3>
              </div>
              <button className="mini-button" onClick={() => setShowKeyboardHelp(false)} type="button">
                Zamknij
              </button>
            </div>

            <div className="reader-command-grid">
              {commandGroups.map((group) => (
                <section className="reader-command-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <ul>
                    {group.items.map((item) => (
                      <li key={`${group.title}-${item.keys}`}>
                        <div>
                          <kbd>{item.keys}</kbd>
                          <span>{item.label}</span>
                        </div>
                        <p>{item.note}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <p className="reader-command-note">
              Zapisane i Archiwum korzystaja teraz z API biblioteki, wiec mapa klawiatury odzwierciedla ten sam model selekcji co UI.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );

}
