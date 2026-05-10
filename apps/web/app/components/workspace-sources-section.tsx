import type { FormEvent, ReactNode } from "react";

import {
  buildSourcePreviewMetrics,
  formatCompactNumber,
  formatRelativeDate,
  getSourcePreviewFailureDescription,
  getSourcePreviewFailureLabel,
  getSourcePreviewStatusLabel,
  getSourcePreviewUiState,
  mapSourceHealthCard,
} from "@/app/lib";
import {
  formatTimestamp,
  getChannelStateLabel,
  getHealthStatusLabel,
  getSourceHostLabel,
  getSourceLanguageLabel,
  getSyncRunStatusLabel,
  SourceIdentityMark,
} from "@/app/lib/channel-lab-presenters";
import type {
  Channel,
  ChannelPreviewCandidate,
  ChannelPreviewItem,
  ChannelPreviewPayload,
  FeedbackState,
  SourceOpmlPreviewPayload,
  SourceSurfaceMode,
  SyncRun,
  WorkspaceSourceGroup,
} from "@/app/lib/channel-lab-types";
import { sourceAddModes } from "@/app/lib/source-add-modes";
import type { SourcePreviewUiState } from "@/app/lib/source-preview";
import type { WorkspaceSourceHealthEntry } from "@/app/lib/source-health";

import {
  BackofficeIcon,
  ArchiveIcon,
  DismissIcon,
  SettingsIcon,
  SourcesIcon,
  StatusIcon,
  SyncIcon,
  TopicIcon,
} from "./ui-icons";
import { SourceAddModeNav, SourceModeIcon } from "./source-add-mode-nav";
import { SourceHealthCard } from "./source-health-card";
import { WorkspaceButton, WorkspaceChip, WorkspacePanel } from "./workspace-primitives";

type SourceSectionCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type LooseRef<T = unknown> = {
  current: T;
};

type SourceLanguageOption = {
  value: string;
  label: string;
};

type SourceAddMode = (typeof sourceAddModes)[number];

type WorkspaceSourcesSectionProps = {
  activeChannelCount: number;
  activeChannelId: string | null;
  activateSourceAddMode: (modeId: SourceAddMode["id"], focusTarget: "input" | "import") => void;
  archivedChannelCount: number;
  category: string;
  channelPreview: ChannelPreviewPayload | null;
  channels: Channel[];
  continuityImportInputRef: LooseRef<{ click: () => void } | null>;
  copy: SourceSectionCopy;
  currentSourceAddMode: SourceAddMode;
  draftCategories: Record<string, string>;
  feedback: FeedbackState;
  feedbackCard?: ReactNode;
  focusFirstItemFromChannel: (channel: Channel) => void;
  handleArchive: (channel: Channel) => unknown;
  handleCategorySave: (channelId: string) => unknown;
  handleConfirmChannelAdd: (feedUrl?: string) => unknown;
  handleCreateSourceGroup: () => unknown;
  handleExportWorkspace: () => unknown;
  handleImportOpml: () => unknown;
  handleOpmlDraftChange: (value: string) => void;
  handlePreviewOpmlImport: () => unknown;
  handleSourceControlUpdate: (channelId: string, patch: Partial<WorkspaceSourceHealthEntry["control"]>) => unknown;
  handleSourceDraftInputChange: (value: string) => void;
  handleSourceTierChange: (channelId: string, tier: "priority" | "default" | "muted") => unknown;
  handleStateToggle: (channel: Channel) => unknown;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => unknown;
  handleSyncAll: (options?: { channelIds?: string[]; label?: string }) => unknown;
  inputUrl: string;
  isPending: boolean;
  isSyncing: boolean;
  lastAddedSource: Channel | null;
  latestRun: SyncRun | null;
  latestRunSummaryLine: string;
  onCapture: () => void;
  onSourceSuccessAddNext: () => void;
  onSourceSuccessOpen: () => void;
  onSourceSuccessSync: () => unknown;
  opmlDraft: string;
  opmlImportBusy: boolean;
  opmlPreview: SourceOpmlPreviewPayload | null;
  pendingSourceFocusTargetRef: LooseRef<"input" | "import" | "category" | "results" | "backoffice" | null>;
  previewBusy: boolean;
  primarySourceCandidate: ChannelPreviewCandidate | null;
  renderUiFeedbackCard: (options?: { live?: boolean; regionId?: string; testId?: string }) => ReactNode;
  resetSourcePreviewState: (options?: { clearFeedbackError?: boolean; clearPreview?: boolean }) => void;
  setCategory: StateSetter<string>;
  setDraftCategories: StateSetter<Record<string, string>>;
  setShowSourceOptions: StateSetter<boolean>;
  setSourceGroupColor: StateSetter<string>;
  setSourceGroupDraft: StateSetter<string>;
  setSourceLanguageFilter: StateSetter<string>;
  setSourceSurfaceMode: StateSetter<SourceSurfaceMode>;
  shouldShowSourceFeedback: boolean;
  showSourceOptions: boolean;
  sourceAddMode: SourceAddMode["id"];
  sourceBackofficeHeadingId: string;
  sourceBackofficeRegionId: string;
  sourceBackofficeRegionRef: LooseRef<HTMLDivElement | null>;
  sourceCategoryInputRef: LooseRef<HTMLInputElement | null>;
  sourceExistingChannel: Channel | null;
  sourceFeedbackRegionId: string;
  sourceGroupColor: string;
  sourceGroupDraft: string;
  sourceGroups: WorkspaceSourceGroup[];
  sourceHealthEntries: WorkspaceSourceHealthEntry[];
  sourceImportTextareaRef: LooseRef<HTMLTextAreaElement | null>;
  sourceInputRef: LooseRef<HTMLInputElement | null>;
  sourceLanguageFilter: string;
  sourceLanguageOptions: SourceLanguageOption[];
  sourcePreviewAnnouncement: string;
  sourcePreviewItems: ChannelPreviewItem[];
  sourcePrimaryMetrics: string[];
  sourcePreviewSlow: boolean;
  sourcePreviewState: SourcePreviewUiState;
  sourcePrimaryModesLabelId: string;
  sourceResultsHeadingId: string;
  sourceResultsRegionId: string;
  sourceResultsRegionRef: LooseRef<HTMLDivElement | null>;
  sourceSecondaryActionsLabelId: string;
  sourceSearchHintId: string;
  sourceSearchOptionsId: string;
  sourceSearchOptionsNoteId: string;
  sourceSurfaceMode: SourceSurfaceMode;
  sourceTopicChips: string[];
  subscribeBusy: boolean;
  syncRuns: SyncRun[];
  visibleSourceCandidates: ChannelPreviewCandidate[];
  workspaceBusy: boolean;
  workspaceExportBusy: boolean;
  workspaceImportBusy: boolean;
};

export function WorkspaceSourcesSection(props: WorkspaceSourcesSectionProps) {
  const {
    activeChannelCount,
    activeChannelId,
    activateSourceAddMode,
    archivedChannelCount,
    category,
    channelPreview,
    channels,
    continuityImportInputRef,
    copy,
    currentSourceAddMode,
    draftCategories,
    feedback,
    focusFirstItemFromChannel,
    handleArchive,
    handleCategorySave,
    handleConfirmChannelAdd,
    handleCreateSourceGroup,
    handleExportWorkspace,
    handleImportOpml,
    handleOpmlDraftChange,
    handlePreviewOpmlImport,
    handleSourceControlUpdate,
    handleSourceDraftInputChange,
    handleSourceTierChange,
    handleStateToggle,
    handleSubmit,
    handleSyncAll,
    inputUrl,
    isPending,
    isSyncing,
    lastAddedSource,
    latestRun,
    latestRunSummaryLine,
    onCapture,
    onSourceSuccessAddNext,
    onSourceSuccessOpen,
    onSourceSuccessSync,
    opmlDraft,
    opmlImportBusy,
    opmlPreview,
    pendingSourceFocusTargetRef,
    previewBusy,
    primarySourceCandidate,
    renderUiFeedbackCard,
    resetSourcePreviewState,
    setCategory,
    setDraftCategories,
    setShowSourceOptions,
    setSourceGroupColor,
    setSourceGroupDraft,
    setSourceLanguageFilter,
    setSourceSurfaceMode,
    shouldShowSourceFeedback,
    showSourceOptions,
    sourceAddMode,
    sourceBackofficeHeadingId,
    sourceBackofficeRegionId,
    sourceBackofficeRegionRef,
    sourceCategoryInputRef,
    sourceExistingChannel,
    sourceFeedbackRegionId,
    sourceGroupColor,
    sourceGroupDraft,
    sourceGroups,
    sourceHealthEntries,
    sourceImportTextareaRef,
    sourceInputRef,
    sourceLanguageFilter,
    sourceLanguageOptions,
    sourcePreviewAnnouncement,
    sourcePreviewItems,
    sourcePrimaryMetrics,
    sourcePreviewSlow,
    sourcePreviewState,
    sourcePrimaryModesLabelId,
    sourceResultsHeadingId,
    sourceResultsRegionId,
    sourceResultsRegionRef,
    sourceSecondaryActionsLabelId,
    sourceSearchHintId,
    sourceSearchOptionsId,
    sourceSearchOptionsNoteId,
    sourceSurfaceMode,
    sourceTopicChips,
    subscribeBusy,
    syncRuns,
    visibleSourceCandidates,
    workspaceBusy,
    workspaceExportBusy,
    workspaceImportBusy,
  } = props;
    const sourceModePlaceholder =
      currentSourceAddMode.id === "web_feed"
        ? "https://example.com/feed.xml albo bezpośredni adres RSS"
        : "xyz.pl albo https://xyz.pl";
    const sourceResultsCount = channelPreview
      ? channelPreview.status === "multiple_candidates"
        ? visibleSourceCandidates.length
        : primarySourceCandidate
          ? 1
          : 0
      : 0;
    const showSourceImportMode = currentSourceAddMode.id === "import_feeds";
    const showWebsiteMode = currentSourceAddMode.id === "website";
    const showBackoffice = sourceSurfaceMode === "manage";
    const sourceInputDescribedBy = showSourceOptions ? `${sourceSearchHintId} ${sourceSearchOptionsNoteId}` : sourceSearchHintId;
    const enabledSourceAddModes = sourceAddModes.filter((mode) => mode.enabled);
    const primarySourceAddModes = enabledSourceAddModes.filter((mode) => mode.id === "website" || mode.id === "web_feed");
    const importSourceAddMode = enabledSourceAddModes.find((mode) => mode.id === "import_feeds") ?? null;
    const upcomingSourceAddModes = sourceAddModes.filter((mode) => !mode.enabled);
    const showSourceLanguageFilter = channelPreview?.status === "multiple_candidates" && sourceLanguageOptions.length > 1;
    const showTopicSuggestions =
      showWebsiteMode && Boolean(inputUrl.trim() || category.trim() || primarySourceCandidate || sourceExistingChannel);
    const sourceHeroTitle = showSourceImportMode
      ? "Zaimportuj źródła z OPML"
      : showWebsiteMode
        ? "Dodaj stronę i sprawdź wykryty feed"
        : "Dodaj bezpośredni RSS lub Atom";
    const sourceHeroDescription = showSourceImportMode
      ? "Przenieś feedy z innego czytnika bez ręcznego przepisywania adresów i od razu przygotuj bibliotekę do pobrania wpisów."
      : showWebsiteMode
        ? "Wklej domenę albo adres strony. Najpierw pokażemy wykryty podgląd, a dopiero potem zapiszesz źródło."
        : "Wklej bezpośredni RSS albo Atom. Najpierw zobaczysz podgląd, a dopiero potem zapiszesz źródło.";
    const sourceSearchHint = showWebsiteMode
      ? "RSSmaster może sprawdzić adres automatycznie po chwili, ale przycisk zawsze uruchamia podgląd od razu."
      : "Enter lub przycisk sprawdza podany adres i pokazuje podgląd przed zapisem.";

    return (
      <section className="section-screen section-screen-sources">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <SourcesIcon className="app-icon app-icon-xs" />
              {copy.eyebrow}
            </span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className="section-screen-header-actions">
            <button
              aria-controls={sourceBackofficeRegionId}
              aria-expanded={showBackoffice}
              className="secondary-button compact-button"
              data-testid="source-manage-toggle"
              onClick={() => {
                setSourceSurfaceMode((current) => {
                  const nextMode = current === "manage" ? "add" : "manage";
                  pendingSourceFocusTargetRef.current =
                    nextMode === "manage" ? "backoffice" : sourceAddMode === "import_feeds" ? "import" : "input";
                  return nextMode;
                });
              }}
              type="button"
            >
              <span className="button-with-icon">
                <BackofficeIcon className="app-icon button-inline-icon" />
                {showBackoffice ? "Wróć do dodawania" : "Zarządzaj źródłami"}
              </span>
            </button>
            {showBackoffice ? (
              <button className="action-button compact-button" disabled={isSyncing || channels.length === 0} onClick={() => void handleSyncAll()} type="button">
                <span className="button-with-icon">
                  <SyncIcon className="app-icon button-inline-icon" />
                  {isSyncing ? "Pobieram..." : "Pobierz z aktywnych"}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="source-follow-layout">
          <SourceAddModeNav
            activeModeId={sourceAddMode}
            importMode={importSourceAddMode}
            onCapture={() => onCapture()}
            onModeSelect={activateSourceAddMode}
            primaryModes={primarySourceAddModes}
            primaryModesLabelId={sourcePrimaryModesLabelId}
            secondaryActionsLabelId={sourceSecondaryActionsLabelId}
            upcomingModes={upcomingSourceAddModes}
          />

          <div className="source-follow-main">
            <div className="source-follow-hero">
              <span className="panel-badge panel-badge-with-icon">
                <SourceModeIcon modeId={currentSourceAddMode.id} />
                {currentSourceAddMode.label}
              </span>
              <h3 data-testid="source-main-heading">{sourceHeroTitle}</h3>
              <p>{sourceHeroDescription}</p>
              {!showSourceImportMode ? (
                <ol className="source-flow-steps" aria-label="Jak RSSmaster dodaje źródło">
                  <li>
                    <strong>1</strong>
                    <span>Wklejasz stronę albo RSS</span>
                  </li>
                  <li>
                    <strong>2</strong>
                    <span>Sprawdzamy feed i pokazujemy podgląd</span>
                  </li>
                  <li>
                    <strong>3</strong>
                    <span>Klikasz Obserwuj i dopiero wtedy zapisujemy</span>
                  </li>
                </ol>
              ) : null}
            </div>

            {showSourceImportMode ? (
              <div className="source-import-shell">
                  <label className="source-import-field">
                    <span>Wklej OPML albo listę feedów</span>
                    <textarea
                      ref={sourceImportTextareaRef}
                      data-testid="source-opml-textarea"
                      onChange={(event) => handleOpmlDraftChange(event.target.value)}
                      placeholder="Wklej tutaj OPML, aby przenieść feedy z innego czytnika RSS"
                      rows={9}
                    value={opmlDraft}
                  />
                </label>
                {opmlPreview ? (
                  <section className="source-opml-preview-card" data-testid="source-opml-preview-card" aria-live="polite">
                    <div>
                      <span className="panel-badge panel-badge-with-icon">
                        <StatusIcon className="app-icon app-icon-xs" />
                        Podgląd importu
                      </span>
                      <h4>Sprawdzone źródła przed importem</h4>
                      <p>
                        Nowe: {opmlPreview.summary.new_feeds}, duplikaty: {opmlPreview.summary.existing_feeds + opmlPreview.summary.duplicate_feeds},
                        błędne: {opmlPreview.summary.invalid_feeds}, foldery: {opmlPreview.summary.folder_count}.
                      </p>
                    </div>
                    {opmlPreview.feeds.length > 0 ? (
                      <ul>
                        {opmlPreview.feeds.slice(0, 5).map((feed) => (
                          <li key={feed.feed_url}>
                            <strong>{feed.title}</strong>
                            <span>{feed.already_subscribed ? "Już w bibliotece" : "Nowe źródło"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}
                <div className="source-import-actions">
                  <button className="secondary-button" data-testid="source-opml-preview-button" disabled={!opmlDraft.trim() || opmlImportBusy} onClick={() => void handlePreviewOpmlImport()} type="button">
                    {opmlImportBusy && !opmlPreview ? "Sprawdzam..." : "Sprawdź OPML"}
                  </button>
                  <button className="action-button" data-testid="source-opml-import-button" disabled={!opmlDraft.trim() || opmlImportBusy || !opmlPreview} onClick={() => void handleImportOpml()} type="button">
                    {opmlImportBusy && opmlPreview ? "Importowanie..." : "Importuj źródła"}
                  </button>
                  <span>RSSmaster zachowa adresy feedów, a po imporcie od razu pobierzesz pierwsze wpisy.</span>
                </div>
              </div>
            ) : (
              <>
                <form
                  aria-describedby={sourceSearchHintId}
                  aria-label="Dodaj źródło przez podgląd"
                  className={`source-search-shell ${showSourceLanguageFilter ? "source-search-shell-with-filter" : ""}`}
                  data-testid="source-search-form"
                  onSubmit={handleSubmit}
                  role="search"
                >
                  <label className="source-search-field">
                    <span className="sr-only">Adres strony lub feedu</span>
                    <span className="source-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <circle cx="8.75" cy="8.75" fill="none" r="5.5" stroke="currentColor" strokeWidth="1.55" />
                        <path d="m12.9 12.9 3.35 3.35" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.55" />
                      </svg>
                    </span>
                    <input
                      aria-describedby={sourceInputDescribedBy}
                      ref={sourceInputRef}
                      autoComplete="off"
                      data-testid="source-input"
                      name="inputUrl"
                      onChange={(event) => {
                        handleSourceDraftInputChange(event.target.value);
                      }}
                      placeholder={sourceModePlaceholder}
                      required
                      value={inputUrl}
                    />
                    {inputUrl.trim() ? (
                      <button
                        aria-label="Wyczyść adres"
                        className="source-search-clear"
                        data-testid="source-input-clear"
                        onClick={() => {
                          handleSourceDraftInputChange("");
                          pendingSourceFocusTargetRef.current = "input";
                        }}
                        type="button"
                      >
                        <DismissIcon className="app-icon" />
                      </button>
                    ) : null}
                  </label>

                  {showSourceLanguageFilter ? (
                    <select
                      aria-label="Filtr wyników po języku"
                      className="source-search-select"
                      data-testid="source-language-filter"
                      onChange={(event) => setSourceLanguageFilter(event.target.value)}
                      title="Filtr wyników po języku"
                      value={sourceLanguageFilter}
                    >
                      {sourceLanguageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <button className="source-search-submit" disabled={previewBusy || subscribeBusy || isPending} type="submit">
                    {previewBusy ? "Sprawdzam..." : "Sprawdź źródło"}
                  </button>
                </form>

                <div className="source-search-subline">
                  <span className="source-search-hint" id={sourceSearchHintId}>
                    {sourceSearchHint}
                  </span>
                  <button
                    aria-controls={sourceSearchOptionsId}
                    aria-expanded={showSourceOptions}
                    className="source-options-toggle"
                    data-testid="source-options-toggle"
                    onClick={() =>
                      setShowSourceOptions((current) => {
                        const nextValue = !current;
                        if (nextValue) {
                          pendingSourceFocusTargetRef.current = "category";
                        }
                        return nextValue;
                      })
                    }
                    type="button"
                  >
                    <span className="button-with-icon">
                      <SettingsIcon className="app-icon button-inline-icon" />
                      {showSourceOptions ? "Ukryj opcje" : "Opcje"}
                    </span>
                  </button>
                </div>

                {showSourceOptions ? (
                  <div aria-label="Opcje zapisu źródła" className="source-search-meta" id={sourceSearchOptionsId} role="group">
                    <label className="source-search-category">
                      <span>Kategoria opcjonalna</span>
                      <input
                        aria-describedby={sourceSearchOptionsNoteId}
                        autoComplete="off"
                        data-testid="source-category-input"
                        name="category"
                        ref={sourceCategoryInputRef}
                        onChange={(event) => setCategory(event.target.value)}
                        placeholder="rynek, design, research"
                        value={category}
                      />
                    </label>
                    <span className="source-search-meta-note" id={sourceSearchOptionsNoteId}>
                      Kategoria zapisze się razem z feedem, ale nie blokuje prostego flow dodawania strony.
                    </span>
                  </div>
                ) : null}
              </>
            )}

                {shouldShowSourceFeedback ? (
                  <div className="source-feedback-card">
                    {renderUiFeedbackCard({ live: true, regionId: sourceFeedbackRegionId, testId: "source-feedback-card" })}
                  </div>
                ) : null}

                {lastAddedSource ? (
                  <section
                    aria-live="polite"
                    className="source-success-panel"
                    data-testid="source-success-panel"
                    role="status"
                  >
                    <div className="source-success-panel-copy">
                      <span className="panel-badge panel-badge-with-icon">
                        <StatusIcon className="app-icon app-icon-xs" />
                        Gotowe do pobrania
                      </span>
                      <h3>{feedback.title}</h3>
                      <p>
                        {lastAddedSource.title} jest zapisane. Pobierz pierwsze wpisy, aby od razu sprawdzić, czy źródło
                        ma czytelne artykuły.
                      </p>
                      {feedback.lines.length > 0 ? (
                        <ul className="source-success-facts">
                          {feedback.lines.map((line, lineIndex) => (
                            <li key={`${line}-${lineIndex}`}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="source-success-actions">
                      <button
                        className="action-button"
                        data-testid="source-first-sync-button"
                        disabled={isSyncing}
                        onClick={onSourceSuccessSync}
                        type="button"
                      >
                        {isSyncing ? "Pobieram..." : "Pobierz pierwsze wpisy"}
                      </button>
                      <button className="secondary-button" onClick={onSourceSuccessAddNext} type="button">
                        Dodaj kolejne źródło
                      </button>
                      <button className="source-result-secondary-action" onClick={onSourceSuccessOpen} type="button">
                        Przejdź do źródła
                      </button>
                    </div>
                  </section>
                ) : null}

                {!showSourceImportMode ? (
                  <div
                aria-busy={sourcePreviewState === "loading"}
                aria-labelledby={sourceResultsHeadingId}
                className="source-results-section"
                data-testid="source-results-region"
                id={sourceResultsRegionId}
                ref={sourceResultsRegionRef}
                role="region"
                tabIndex={-1}
              >
                <p aria-atomic="true" aria-live={sourcePreviewState === "error" ? "assertive" : "polite"} className="sr-only" data-testid="source-live-region">
                  {sourcePreviewAnnouncement}
                </p>
              <div className="source-results-header">
                <div>
                    <strong id={sourceResultsHeadingId}>Wyniki</strong>
                    <span>
                      {channelPreview
                        ? `${sourceResultsCount} znalezionych`
                        : showWebsiteMode
                          ? "Wklej adres strony, aby zobaczyć podgląd"
                          : "Wklej bezpośredni RSS lub Atom, aby zobaczyć podgląd"}
                    </span>
                  </div>
                  {channelPreview ? <span className="source-result-chip">{getSourcePreviewStatusLabel(channelPreview.status)}</span> : null}
                </div>

                {sourcePreviewState === "loading" ? (
                  <div aria-live="polite" className="source-empty-state source-loading-state-card" data-testid="source-loading-state" role="status">
                    <strong>Szukam feedu dla podanego adresu</strong>
                    <p>
                      {sourcePreviewSlow
                        ? "To trwa dłużej niż zwykle. Zwykle oznacza to wolną stronę, blokadę po stronie źródła albo konieczność użycia bezpośredniego RSS."
                        : "Sprawdzam adres bez zapisywania go do biblioteki. Jeśli strona ma RSS/Atom, za chwilę zobaczysz podgląd i przycisk Obserwuj."}
                    </p>
                    <ol className="source-discovery-steps" aria-label="Postęp sprawdzania źródła">
                      <li className="source-discovery-step-active">
                        <strong>Adres</strong>
                        <span>Normalizacja URL</span>
                      </li>
                      <li className="source-discovery-step-active">
                        <strong>Wykrywanie</strong>
                        <span>RSS, Atom i znaczniki strony</span>
                      </li>
                      <li className={sourcePreviewSlow ? "source-discovery-step-waiting" : ""}>
                        <strong>Podgląd</strong>
                        <span>Próbka najnowszych wpisów</span>
                      </li>
                    </ol>
                    {sourcePreviewSlow ? (
                      <div className="source-loading-actions">
                        <button
                          className="source-result-secondary-action"
                          onClick={() => resetSourcePreviewState({ clearFeedbackError: true })}
                          type="button"
                        >
                          Anuluj sprawdzanie
                        </button>
                        <span>Najpewniejszy fallback: wybierz tryb RSS / Atom i wklej bezpośredni adres feedu.</span>
                      </div>
                    ) : null}
                  </div>
                ) : sourcePreviewState === "multiple_candidates" ? (
                  visibleSourceCandidates.length > 0 ? (
                    <div className="source-candidate-grid">
                      {visibleSourceCandidates.map((candidate) => {
                        const existingChannel =
                          candidate.existing_channel_id ? channels.find((channel) => channel.id === candidate.existing_channel_id) ?? null : null;
                        const candidateMetrics = buildSourcePreviewMetrics({
                          candidate,
                          unreadCount: existingChannel?.unread_count ?? null,
                          languageLabel: getSourceLanguageLabel(candidate.language),
                        });
                        return (
                          <article className="source-candidate-card" data-testid="source-result-card" key={candidate.feed_url}>
                            <div className="source-candidate-card-head">
                              <SourceIdentityMark label={candidate.title} siteUrl={candidate.site_url ?? candidate.feed_url} />
                              <div className="source-candidate-copy">
                                <strong>{candidate.title}</strong>
                                <span>
                                  {[getSourceHostLabel(candidate.site_url ?? candidate.feed_url), getSourceLanguageLabel(candidate.language)]
                                    .filter(Boolean)
                                    .join(" | ")}
                                </span>
                                {candidateMetrics.length > 0 ? (
                                  <div className="source-result-metrics">
                                    {candidateMetrics.map((metric) => (
                                      <span className="source-metric-chip" key={`${candidate.feed_url}-${metric}`}>
                                        {metric}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <p>{candidate.description ?? candidate.feed_url}</p>
                            {candidate.sample_items.length > 0 ? (
                              <div className="source-candidate-preview-list">
                                {candidate.sample_items.slice(0, 2).map((item) => (
                                  <span className="source-candidate-preview-item" key={`${candidate.feed_url}-${item.url}`}>
                                    {item.title}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="source-candidate-footer">
                              <span>{candidate.feed_url}</span>
                              {candidate.already_subscribed && existingChannel ? (
                                <button className="secondary-button" onClick={() => focusFirstItemFromChannel(existingChannel)} type="button">
                                  Przejdź do źródła
                                </button>
                              ) : (
                                <button className="action-button compact-button" disabled={subscribeBusy} onClick={() => void handleConfirmChannelAdd(candidate.feed_url)} type="button">
                                  {subscribeBusy ? "Zapisywanie..." : "Obserwuj"}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="source-empty-state" data-testid="source-filter-empty-state">
                      <strong>Ten filtr ukrył wszystkie wyniki</strong>
                      <p>Na stronie znaleźliśmy feedy, ale żaden nie pasuje do wybranego języka. Zmień filtr, aby zobaczyć wszystkie kandydatury.</p>
                    </div>
                  )
                ) : primarySourceCandidate ? (
                  <article className="source-result-card" data-testid="source-result-card">
                    <div className="source-result-header">
                      <div className="source-result-headline">
                        <SourceIdentityMark
                          label={getSourceHostLabel(primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url) ?? primarySourceCandidate.title}
                          siteUrl={primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url}
                        />
                        <div className="source-result-copy">
                          <div className="source-result-title-row">
                            <h3>{primarySourceCandidate.title}</h3>
                            <p>{getSourceHostLabel(primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url) ?? primarySourceCandidate.feed_url}</p>
                          </div>
                          {sourcePrimaryMetrics.length > 0 ? (
                            <div className="source-result-metrics">
                              {sourcePrimaryMetrics.map((metric) => (
                                <span className="source-metric-chip" key={`${primarySourceCandidate.feed_url}-${metric}`}>
                                  {metric}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <span>{primarySourceCandidate.description ?? primarySourceCandidate.feed_url}</span>
                        </div>
                      </div>
                      <div className="source-result-actions">
                        {sourceExistingChannel ? (
                          <>
                            <span className={`source-result-chip ${sourceExistingChannel.state === "archived" ? "source-result-chip-muted" : ""}`}>
                              {sourceExistingChannel.state === "archived" ? "Zarchiwizowane" : "Już obserwujesz"}
                            </span>
                            {sourceExistingChannel.state !== "archived" ? (
                              <>
                                <button className="secondary-button" onClick={() => focusFirstItemFromChannel(sourceExistingChannel)} type="button">
                                  Przejdź do źródła
                                </button>
                                <button className="source-result-secondary-action" disabled={activeChannelId === sourceExistingChannel.id} onClick={() => void handleArchive(sourceExistingChannel)} type="button">
                                  <span className="button-with-icon">
                                    <ArchiveIcon className="app-icon button-inline-icon" />
                                    Przestań obserwować
                                  </span>
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <button className="action-button compact-button" disabled={subscribeBusy} onClick={() => void handleConfirmChannelAdd(primarySourceCandidate.feed_url)} type="button">
                            {subscribeBusy ? "Zapisywanie..." : "Obserwuj"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="source-result-guidance" aria-label="Co stanie się po dodaniu źródła">
                      <span>Gotowe do zapisu</span>
                      <strong>Podgląd jest gotowy. Dodanie źródła nie pobierze jeszcze masowo wpisów bez Twojej decyzji.</strong>
                      <p>Po kliknięciu Obserwuj możesz od razu pobrać wpisy i sprawdzić czytelność źródła w zarządzaniu.</p>
                    </div>

                    {sourcePreviewItems.length > 0 ? (
                      <div className="source-result-preview-grid">
                        {sourcePreviewItems.map((item) => (
                          <article className="source-preview-card source-preview-card-article" key={`${primarySourceCandidate.feed_url}-${item.url}`}>
                            {item.image_url ? <img alt="" className="source-preview-image" loading="lazy" src={item.image_url} /> : null}
                            <div className="source-preview-content">
                              <strong>{item.title}</strong>
                              <p>{formatRelativeDate(item.published_at, new Date(), "Nowy wpis")}</p>
                            </div>
                            <a className="source-preview-link" href={item.url} rel="noreferrer" target="_blank">
                              Otwórz wpis
                            </a>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="source-empty-state" data-testid="source-preview-empty-state">
                        <strong>Feed gotowy do obserwowania</strong>
                        <p>
                          {sourceExistingChannel
                            ? "To źródło jest już w bibliotece, ale feed nie udostępnił krótkiego podglądu ostatnich wpisów."
                            : "Feed został wykryty poprawnie, ale nie zwrócił krótkiego podglądu ostatnich wpisów."}
                        </p>
                      </div>
                    )}
                  </article>
                ) : (
                  <div
                    aria-live={sourcePreviewState === "error" ? "polite" : undefined}
                    className="source-empty-state"
                    data-testid="source-empty-state"
                    role={sourcePreviewState === "error" ? "status" : undefined}
                      >
                        <strong>{sourcePreviewState === "error" ? feedback.title : "Zacznij od adresu strony"}</strong>
                        {sourcePreviewState === "error" ? (
                          <ul className="source-error-list">
                            {(feedback.lines.length > 0
                              ? feedback.lines
                              : ["Nie udało się wykryć poprawnego feedu dla podanego adresu."]).map((line, lineIndex) => (
                              <li key={`${line}-${lineIndex}`}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            Wklej adres strony lub feedu. Najpierw pokażemy wykryty podgląd, a dopiero potem zapiszesz
                            źródło do biblioteki.
                          </p>
                        )}
                      </div>
                    )}
              </div>
            ) : null}
          </div>

          <aside className="source-follow-aside">
            <section className="source-aside-card source-aside-card-subtle">
              <span className="panel-badge panel-badge-with-icon">
                <TopicIcon className="app-icon app-icon-xs" />
                {showTopicSuggestions ? "Podpowiedzi kategorii" : "Na start"}
              </span>
              {showTopicSuggestions ? (
                <>
                  <p>Klik ustawia kategorię pomocniczą. Nie zmienia wykrywania feedu ani samego podglądu.</p>
                  <div className="source-topic-list">
                    {sourceTopicChips.map((chip) => (
                      <button
                        className="source-topic-chip"
                        key={chip}
                        onClick={() => {
                          setShowSourceOptions(true);
                          setCategory(chip.replace(/^#/, "").replace(/-/g, ", "));
                          pendingSourceFocusTargetRef.current = "category";
                        }}
                        type="button"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>Wklej adres strony, a po wykryciu feedu podpowiemy kilka kategorii do zapisania razem ze źródłem.</p>
              )}
            </section>

            <section className="source-aside-card source-aside-card-quiet">
              <span className="panel-badge panel-badge-with-icon">
                <StatusIcon className="app-icon app-icon-xs" />
                Szybki stan
              </span>
              <strong>{activeChannelCount} aktywnych źródeł</strong>
              <p>
                {latestRun
                  ? `Ostatnie pobieranie: ${formatTimestamp(latestRun.completed_at ?? latestRun.created_at, "brak znacznika czasu")}.`
                  : "Jeszcze nie masz zakończonego pobierania dla tej biblioteki."}
              </p>
              <p>{latestRunSummaryLine}</p>
              <div className="source-aside-metrics">
                <span>{formatCompactNumber(channels.length)} wszystkich źródeł</span>
                <span>{formatCompactNumber(archivedChannelCount)} zarchiwizowanych</span>
                {latestRun ? <span>{getSyncRunStatusLabel(latestRun.status)}</span> : null}
              </div>
              <button className="secondary-button" disabled={isSyncing || channels.length === 0} onClick={() => void handleSyncAll()} type="button">
                <span className="button-with-icon">
                  <SyncIcon className="app-icon button-inline-icon" />
                  {isSyncing ? "Pobieram..." : "Pobierz wpisy"}
                </span>
              </button>
            </section>
          </aside>
        </div>

        {showBackoffice ? (
          <>
        <div className="source-ops-divider">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <BackofficeIcon className="app-icon app-icon-xs" />
              Zarządzanie źródłami
            </span>
            <h3 id={sourceBackofficeHeadingId}>Stan, pakiety i ręczne operacje</h3>
          </div>
          <button
            aria-controls={sourceBackofficeRegionId}
            aria-expanded={showBackoffice}
            className="secondary-button compact-button"
            data-testid="source-backoffice-toggle"
            onClick={() => {
              setSourceSurfaceMode((current) => {
                const nextMode = current === "manage" ? "add" : "manage";
                pendingSourceFocusTargetRef.current =
                  nextMode === "manage" ? "backoffice" : sourceAddMode === "import_feeds" ? "import" : "input";
                return nextMode;
              });
            }}
            type="button"
          >
            Ukryj zarządzanie
          </button>
        </div>

        <div
          aria-labelledby={sourceBackofficeHeadingId}
          className="source-backoffice-region"
          id={sourceBackofficeRegionId}
          ref={sourceBackofficeRegionRef}
          role="region"
          tabIndex={-1}
        >
        {showBackoffice ? (
          <div className="section-grid section-grid-two">
            <div className="screen-stack">
              <WorkspacePanel eyebrow="Zdrowie źródeł" title="Grupuj i wyciszaj źródła" description="Pakiety źródeł, priorytety i czasowe wyciszanie bez ryzyka zgubienia zawartości." tone="success">
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <input onChange={(event) => setSourceGroupDraft(event.target.value)} placeholder="Utwórz pakiet: rynki, longform, research" value={sourceGroupDraft} />
                    <input onChange={(event) => setSourceGroupColor(event.target.value)} type="color" value={sourceGroupColor} />
                    <WorkspaceButton disabled={!sourceGroupDraft.trim() || workspaceBusy} onClick={() => void handleCreateSourceGroup()} tone="accent">
                      Utwórz pakiet
                    </WorkspaceButton>
                  </div>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    {sourceGroups.map((group) => (
                      <WorkspaceChip key={group.id}>{group.name} ({group.channel_count})</WorkspaceChip>
                    ))}
                    {sourceGroups.length === 0 ? <WorkspaceChip>Brak pakietów</WorkspaceChip> : null}
                  </div>
                </div>
              </WorkspacePanel>

              {sourceHealthEntries.slice(0, 6).map((entry) => (
                <SourceHealthCard
                  actions={
                    <div style={{ display: "grid", gap: "0.55rem" }}>
                      <select onChange={(event) => void handleSourceControlUpdate(entry.channel_id, { group_id: event.target.value || null })} value={entry.control.group_id ?? ""}>
                        <option value="">Bez pakietu</option>
                        {sourceGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <WorkspaceButton
                          disabled={isSyncing || entry.state !== "active"}
                          onClick={() => void handleSyncAll({ channelIds: [entry.channel_id], label: entry.title })}
                          tone={entry.reading_readiness === "blocked" || entry.health_status === "error" ? "accent" : "default"}
                        >
                          Pobierz teraz
                        </WorkspaceButton>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}>
                          Wstrzymaj na 1d
                        </WorkspaceButton>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { paused_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })}>
                          Pauza 7d
                        </WorkspaceButton>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { paused_until: null, snoozed_until: null })}>
                          <span className="button-with-icon">
                            <DismissIcon className="app-icon button-inline-icon" />
                            Wyczyść timery
                          </span>
                        </WorkspaceButton>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <WorkspaceButton active={entry.control.tier === "priority"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "priority")} tone="accent">
                          Priorytet
                        </WorkspaceButton>
                        <WorkspaceButton active={entry.control.tier === "default"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "default")}>
                          Domyślnie
                        </WorkspaceButton>
                        <WorkspaceButton active={entry.control.tier === "muted"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "muted")} tone="danger">
                          Wycisz
                        </WorkspaceButton>
                      </div>
                    </div>
                  }
                  key={entry.channel_id}
                  source={mapSourceHealthCard(entry)}
                />
              ))}
            </div>

            <div className="screen-stack">
              <WorkspacePanel eyebrow="Migracje" title="Przechwytywanie i eksport" description="Capture i migracje z innych czytników są tutaj, z dala od głównego flow dodawania źródeł." tone="success">
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <WorkspaceButton onClick={() => onCapture()} tone="accent">
                      Otwórz szybki capture
                    </WorkspaceButton>
                    <WorkspaceButton disabled={workspaceExportBusy} onClick={() => void handleExportWorkspace()}>
                      {workspaceExportBusy ? "Przygotowywanie..." : "Eksportuj continuity bundle"}
                    </WorkspaceButton>
                    <WorkspaceButton disabled={workspaceImportBusy} onClick={() => continuityImportInputRef.current?.click()} tone="accent">
                      {workspaceImportBusy ? "Odtwarzanie..." : "Odtwórz continuity bundle"}
                    </WorkspaceButton>
                  </div>
                  <WorkspaceChip>Dedykowany ekran capture obsługuje deep link, bookmarklet i systemowe udostępnianie.</WorkspaceChip>
                  <WorkspaceChip>Continuity bundle przywraca feedy, stany biblioteki i lokalny kontekst czytania.</WorkspaceChip>
                  <textarea onChange={(event) => handleOpmlDraftChange(event.target.value)} placeholder="Wklej tutaj OPML, aby przenieść feedy z innego czytnika RSS" rows={5} value={opmlDraft} />
                  <WorkspaceButton disabled={!opmlDraft.trim() || opmlImportBusy} onClick={() => void handleImportOpml()} tone="accent">
                    {opmlImportBusy ? "Importowanie..." : "Importuj OPML"}
                  </WorkspaceButton>
                </div>
              </WorkspacePanel>

              <section className="ops-section">
                <div className="ops-section-header">
                  <div>
                    <span className="panel-badge">Pobieranie wpisów</span>
                    <h3>Ostatnie zadania</h3>
                  </div>
                  <span>{syncRuns.length} zadań</span>
                </div>

                {syncRuns.length === 0 ? (
                  <p className="empty-state">Brak zadań pobierania. Dodaj źródło i pobierz pierwsze wpisy.</p>
                ) : (
                  <ul className="ops-list">
                    {syncRuns.map((run) => (
                      <li className="ops-row" key={run.id}>
                        <div className="ops-row-top">
                          <strong>{getSyncRunStatusLabel(run.status)}</strong>
                          <span>{formatTimestamp(run.completed_at ?? run.created_at, "Brak znacznika czasu")}</span>
                        </div>
                        <span>Kanały {run.channels_succeeded}/{run.channels_total} ok, {run.channels_failed} nieudanych</span>
                        <span>Artykuły {run.items_created} nowych, {run.items_seen} widzianych, {run.items_skipped} pominiętych</span>
                        {run.error_message ? <span>{run.error_message}</span> : null}
                        {run.errors.length > 0 ? (
                          <ul className="run-error-list">
                            {run.errors.slice(0, 2).map((error) => (
                              <li key={`${run.id}-${error.channel_id}-${error.code}`}>
                                <strong>{error.channel_title}</strong>: {error.message}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="ops-section">
                <div className="ops-section-header">
                  <div>
                    <span className="panel-badge">Źródła</span>
                    <h3>Zarządzaj kanałami</h3>
                  </div>
                  <span>{archivedChannelCount} zarchiwizowanych</span>
                </div>
                {channels.length === 0 ? (
                  <p className="empty-state">Brak zapisanych kanałów. Użyj formularza powyżej, aby utworzyć pierwszy.</p>
                ) : (
                  <ul className="ops-list">
                    {channels.map((channel) => (
                      <li className="ops-row" key={channel.id}>
                        <div className="ops-row-top">
                          <strong>{channel.title}</strong>
                          <span className={`channel-state channel-state-${channel.state}`}>{getChannelStateLabel(channel.state)}</span>
                        </div>
                        <span>{channel.feed_url}</span>
                        <span>{channel.category ? `Kategoria: ${channel.category}` : "Brak kategorii"}</span>
                        <span>Nieprzeczytane artykuły: {channel.unread_count}</span>
                        {channel.health ? <span>{`Stan: ${getHealthStatusLabel(channel.health.status)} | ${channel.health.summary}`}</span> : null}
                        <span>{channel.last_fetch_at ? `Ostatni fetch: ${formatTimestamp(channel.last_fetch_at, "nigdy nie synchronizowano")}` : "Ostatni fetch: nigdy nie synchronizowano"}</span>
                        <span>{channel.last_error ? `Ostatni błąd: ${channel.last_error}` : "Ostatni błąd: brak"}</span>
                        <div className="channel-actions">
                          <input className="channel-inline-input" onChange={(event) => setDraftCategories((current) => ({ ...current, [channel.id]: event.target.value }))} placeholder="Zmień kategorię" value={draftCategories[channel.id] ?? ""} />
                          <button className="secondary-button" disabled={activeChannelId === channel.id} onClick={() => void handleCategorySave(channel.id)} type="button">
                            Zapisz kategorię
                          </button>
                          <button className="secondary-button" disabled={activeChannelId === channel.id || channel.state === "archived"} onClick={() => void handleStateToggle(channel)} type="button">
                            {channel.state === "active" ? "Wyłącz" : channel.state === "inactive" ? "Włącz" : "Zarchiwizowany"}
                          </button>
                          <button className="danger-button" disabled={activeChannelId === channel.id || channel.state === "archived"} onClick={() => void handleArchive(channel)} type="button">
                            Archiwizuj
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="source-backoffice-collapsed">
            <strong>Zarządzanie zostaje w tle</strong>
            <p>Pakiety źródeł, ręczne pobieranie, capture i zarządzanie kanałami są schowane, aby pierwszy ekran został skupiony na prostym dodawaniu strony.</p>
          </div>
        )}
        </div>
          </>
        ) : null}
      </section>
    );
}
