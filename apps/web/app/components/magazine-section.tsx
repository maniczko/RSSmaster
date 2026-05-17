import type { ReactNode } from "react";

import { getDigestStatusLabel, type DigestCandidatePreviewStatus } from "@/app/lib/digest-selection";

import { ArtifactMeta } from "./artifact-meta";
import type { DigestCandidateSummaryPreview } from "./digest-candidate-summary";
import type { DigestHistoryListItem } from "./digest-history-list";
import { DeliveryIcon, DigestIcon, KindleIcon, StatusIcon } from "./ui-icons";
import type {
  MagazineSettings,
  MagazineSettingsDraft,
  MagazineSettingsPreflight,
} from "@/app/lib/channel-lab-types";

type MagazineSectionCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

type MagazineDeliverySettings = {
  smtp_ready: boolean;
} | null;

type MagazineDeliveryPreflight = {
  status: string;
  recipient: string | null;
  artifact: {
    title: string;
    artifact_exists: boolean;
    artifact_bytes: number | null;
  };
  checks: Array<{
    name: string;
    status: string;
  }>;
} | null;

type MagazineSelectionItem = NonNullable<DigestHistoryListItem["selection_snapshot"]>[number];

type MagazineIssueRow = {
  issue: DigestHistoryListItem;
  issueDate: string | null;
  label: string;
  sequence: number;
  year: string;
};

type MagazineIssueGroup = {
  key: string;
  label: string;
  articles: MagazineSelectionItem[];
};

type MagazineSectionProps = {
  activeIssueId: string | null;
  buildDisabled: boolean;
  busy: boolean;
  copy: MagazineSectionCopy;
  countLabel: string;
  deliveryBusy: boolean;
  deliveryPreflight: MagazineDeliveryPreflight;
  deliverySettings: MagazineDeliverySettings;
  feedbackCard: ReactNode;
  formatDeliveryStatus: (status: string) => string;
  formatTimestamp: (value: string | null | undefined, fallback: string) => string;
  history: DigestHistoryListItem[];
  magazineSettings: MagazineSettings | null;
  magazineSettingsBusy: boolean;
  magazineSettingsDraft: MagazineSettingsDraft;
  magazineSettingsMessage: string | null;
  magazineSettingsPreflight: MagazineSettingsPreflight | null;
  message: string | null;
  onBackToReader: () => void;
  onBuild: () => void;
  onDeliveryPreflight: (issue: DigestHistoryListItem) => void;
  onMagazineSettingsDraftChange: (field: keyof MagazineSettingsDraft, value: string | boolean) => void;
  onMagazineSettingsPreflight: () => void;
  onMagazineSettingsSave: () => void;
  onPreview: () => void;
  onSelectIssue: (issueId: string) => void;
  onSendDigestDryRun: (issue: DigestHistoryListItem) => void;
  onSendDigestLive: (issue: DigestHistoryListItem) => void;
  onShowDigestQueue: () => void;
  preview: DigestCandidateSummaryPreview | null;
  previewDisabled: boolean;
  status: DigestCandidatePreviewStatus;
};

function getIssueDate(issue: DigestHistoryListItem): string | null {
  return issue.generated_at ?? issue.sent_at ?? issue.created_at ?? null;
}

function getIssueYear(issue: DigestHistoryListItem): string {
  const issueDate = getIssueDate(issue);
  if (!issueDate) {
    return "bez daty";
  }

  const parsed = new Date(issueDate);
  if (Number.isNaN(parsed.getTime())) {
    return "bez daty";
  }

  return String(parsed.getUTCFullYear());
}

function getIssueTime(issue: DigestHistoryListItem): number {
  const issueDate = getIssueDate(issue);
  if (!issueDate) {
    return 0;
  }

  const parsed = new Date(issueDate);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function buildMagazineIssueRows(history: DigestHistoryListItem[]): MagazineIssueRow[] {
  const sequenceByIssueId = new Map<string, number>();
  const issuesByYear = new Map<string, DigestHistoryListItem[]>();

  for (const issue of history) {
    const year = getIssueYear(issue);
    issuesByYear.set(year, [...(issuesByYear.get(year) ?? []), issue]);
  }

  for (const issues of issuesByYear.values()) {
    [...issues]
      .sort((left, right) => {
        const timeDelta = getIssueTime(left) - getIssueTime(right);
        return timeDelta === 0 ? left.id.localeCompare(right.id) : timeDelta;
      })
      .forEach((issue, index) => {
        sequenceByIssueId.set(issue.id, index + 1);
      });
  }

  return history.map((issue) => {
    const year = getIssueYear(issue);
    const sequence = sequenceByIssueId.get(issue.id) ?? 1;
    return {
      issue,
      issueDate: getIssueDate(issue),
      label: year === "bez daty" ? `Wydanie ${sequence}` : `Wydanie ${sequence}/${year}`,
      sequence,
      year,
    };
  });
}

function formatArtifactSize(sizeBytes: number | null | undefined): string {
  if (!sizeBytes || sizeBytes <= 0) {
    return "rozmiar nieznany";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.ceil(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIssueArticleCount(count: number): string {
  if (count === 1) {
    return "1 artykuł";
  }

  return `${count} artykułów`;
}

function formatMagazineCategoryLabel(value: string | null | undefined): string {
  const category = value?.trim();
  if (!category || /^uncategorized$/i.test(category)) {
    return "Bez kategorii";
  }

  return category;
}

function getIssueArticles(issue: DigestHistoryListItem): MagazineSelectionItem[] {
  return [...(issue.selection_snapshot ?? [])].sort((left, right) => left.position - right.position);
}

function formatIssueReadTime(articles: MagazineSelectionItem[]): string {
  const wordCount = articles.reduce((total, article) => total + (article.word_count ?? 0), 0);
  if (wordCount <= 0) {
    return "czas czytania nieznany";
  }

  const minutes = Math.max(1, Math.round(wordCount / 220));
  return `${minutes} min czytania`;
}

function groupIssueArticles(issue: DigestHistoryListItem): MagazineIssueGroup[] {
  const snapshot = getIssueArticles(issue);
  const groups = new Map<string, MagazineIssueGroup>();

  for (const article of snapshot) {
    const sourceLabel = article.channel_title?.trim();
    const categoryLabel = article.category?.trim();
    const label = sourceLabel || formatMagazineCategoryLabel(categoryLabel);
    const key = sourceLabel
      ? `source:${article.channel_id ?? sourceLabel}`
      : `category:${categoryLabel ?? "pozostale"}`;
    const group = groups.get(key) ?? {
      key,
      label,
      articles: [],
    };
    group.articles.push(article);
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

function getPreviewStatusLabel(status: DigestCandidatePreviewStatus): string {
  switch (status) {
    case "loading":
      return "Sprawdzam materiały";
    case "ready":
      return "Gotowe do zbudowania";
    case "empty":
      return "Brak materiałów";
    case "error":
      return "Wymaga uwagi";
    default:
      return "Gotowe";
  }
}

export function MagazineSection({
  activeIssueId,
  buildDisabled,
  busy,
  copy,
  countLabel,
  deliveryBusy,
  deliveryPreflight,
  deliverySettings,
  feedbackCard,
  formatDeliveryStatus,
  formatTimestamp,
  history,
  magazineSettings,
  magazineSettingsBusy,
  magazineSettingsDraft,
  magazineSettingsMessage,
  magazineSettingsPreflight,
  message,
  onBackToReader,
  onBuild,
  onDeliveryPreflight,
  onMagazineSettingsDraftChange,
  onMagazineSettingsPreflight,
  onMagazineSettingsSave,
  onPreview,
  onSelectIssue,
  onSendDigestDryRun,
  onSendDigestLive,
  onShowDigestQueue,
  preview,
  previewDisabled,
  status,
}: MagazineSectionProps) {
  const issueRows = buildMagazineIssueRows(history);
  const activeRow = issueRows.find((row) => row.issue.id === activeIssueId) ?? issueRows[0] ?? null;
  const activeIssue = activeRow?.issue ?? null;
  const activeIssueArticles = activeIssue ? getIssueArticles(activeIssue) : [];
  const activeIssueGroups = activeIssue ? groupIssueArticles(activeIssue) : [];
  const activeIssueReadTime = formatIssueReadTime(activeIssueArticles);
  const issueHasArtifact = Boolean(activeIssue?.artifact?.path);
  const issuePreflightDisabled = deliveryBusy || !activeIssue;
  const issueSendDisabled = deliveryBusy || !activeIssue || !issueHasArtifact;

  return (
    <section className="section-screen magazine-screen" data-testid="magazine-screen">
      <div className="section-screen-header magazine-screen-header">
        <div>
          <span className="panel-badge panel-badge-with-icon">
            <KindleIcon className="app-icon app-icon-xs" />
            {copy.eyebrow}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className="section-screen-header-actions">
          <button className="secondary-button" onClick={onBackToReader} type="button">
            Wróć do czytnika
          </button>
          <button className="action-button compact-button" disabled={buildDisabled} onClick={onBuild} type="button">
            Zbuduj następne wydanie
          </button>
        </div>
      </div>

      <div className="magazine-page-grid">
        <section className="ops-section magazine-issue-library" data-testid="magazine-issue-list">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge panel-badge-with-icon">
                <KindleIcon className="app-icon app-icon-xs" />
                Wydania
              </span>
              <h2>Biblioteka wydań</h2>
            </div>
            <span>{history.length > 0 ? `${history.length} wydań` : "brak wydań"}</span>
          </div>

          {issueRows.length > 0 ? (
            <div className="magazine-issue-list">
              {issueRows.map((row, index) => {
                const isActive = activeIssue?.id === row.issue.id;
                return (
                  <button
                    aria-pressed={isActive}
                    className={`magazine-issue-card${isActive ? " magazine-issue-card-active" : ""}`}
                    data-testid="magazine-issue-card"
                    key={row.issue.id}
                    onClick={() => onSelectIssue(row.issue.id)}
                    type="button"
                  >
                    <span className="magazine-issue-card-main">
                      <strong>{row.label}</strong>
                      <span>{row.issue.title}</span>
                    </span>
                    <span className="magazine-issue-card-meta">
                      <span>{formatIssueArticleCount(row.issue.article_count)}</span>
                      <span>{formatTimestamp(row.issueDate, "Bez daty")}</span>
                    </span>
                    <span className="magazine-issue-card-action">{index === 0 ? "Najnowsze" : "Otwórz"}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="premium-empty-state-content magazine-empty-issue">
              <strong>Nie ma jeszcze wydań</strong>
              <p className="empty-state">
                Zbuduj pierwszy numer, a pojawi się tu konkretne wydanie magazynu z datą, listą artykułów i statusem EPUB.
              </p>
              <div className="magazine-empty-issue-blueprint" data-testid="magazine-empty-issue-blueprint">
                <span>Przykład struktury</span>
                <strong>Wydanie 1/2026</strong>
                <ul>
                  <li>Najciekawsze artykuły pogrupowane po źródle</li>
                  <li>Podgląd czytania przed wysyłką na Kindle</li>
                  <li>EPUB i preflight dla tego numeru</li>
                </ul>
              </div>
              <button className="action-button compact-button" onClick={onBuild} type="button">
                Zbuduj pierwsze wydanie
              </button>
            </div>
          )}
        </section>

        <div className="screen-stack magazine-issue-workspace">
          <section className="ops-section magazine-active-issue" data-testid="magazine-active-issue">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <DigestIcon className="app-icon app-icon-xs" />
                  Otwarte wydanie
                </span>
                <h2>{activeRow?.label ?? "Brak wydania"}</h2>
              </div>
              <span>{activeIssue ? getDigestStatusLabel(activeIssue.status) : "oczekuje"}</span>
            </div>

            {activeIssue && activeRow ? (
              <div className="magazine-active-issue-body">
                <div className="magazine-issue-summary">
                  <div>
                    <strong>{activeIssue.title}</strong>
                    <span>{formatIssueArticleCount(activeIssue.article_count)}</span>
                    <span>{formatTimestamp(activeRow.issueDate, "Bez daty wydania")}</span>
                  </div>
                  <div>
                    <ArtifactMeta
                      emptyLabel="Artefakt EPUB jeszcze niedostępny"
                      path={activeIssue.artifact?.path}
                      sizeLabel={activeIssue.artifact?.path ? formatArtifactSize(activeIssue.artifact.size_bytes) : null}
                    />
                  </div>
                </div>

                {activeIssue.category_summary && activeIssue.category_summary.length > 0 ? (
                  <div className="magazine-category-strip" aria-label="Kategorie w wydaniu">
                    {activeIssue.category_summary.map((category) => (
                      <span className="metric-chip" key={category.category}>
                        {formatMagazineCategoryLabel(category.category)} · {formatIssueArticleCount(category.article_count)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {activeIssueArticles.length > 0 ? (
                  <section
                    aria-labelledby="magazine-reading-preview-title"
                    className="magazine-reading-preview"
                    data-testid="magazine-reading-preview"
                    id="magazine-reading-preview"
                  >
                    <div className="magazine-reading-preview-header">
                      <div>
                        <span className="panel-badge panel-badge-with-icon">
                          <KindleIcon className="app-icon app-icon-xs" />
                          Podgląd przed wysyłką
                        </span>
                        <h3 id="magazine-reading-preview-title">Czytaj wydanie przed wysłaniem</h3>
                        <p>
                          {activeIssue.title} · {formatIssueArticleCount(activeIssue.article_count)} ·{" "}
                          {activeIssueReadTime}
                        </p>
                      </div>
                      {activeIssue.artifact?.path ? <span>EPUB gotowy</span> : <span>EPUB oczekuje</span>}
                    </div>
                    <div className="magazine-reading-articles">
                      {activeIssueArticles.map((article) => (
                        <article className="magazine-reading-article" key={article.item_id}>
                          <div className="magazine-reading-article-kicker">
                            <span>#{article.position}</span>
                            <span>{article.channel_title ?? article.category ?? "Źródło"}</span>
                            <span>{formatTimestamp(article.published_at, "bez daty")}</span>
                          </div>
                          <h4>{article.title}</h4>
                          {article.author ? <p className="magazine-reading-author">Autor: {article.author}</p> : null}
                          {article.content_html ? (
                            <div
                              className="magazine-reading-body reader-article-prose"
                              dangerouslySetInnerHTML={{ __html: article.content_html }}
                            />
                          ) : (
                            <p className="magazine-reading-body-fallback">
                              {article.excerpt ??
                                "To starsze wydanie nie ma zapisanej pełnej treści w podglądzie. Otwórz źródło albo zbuduj nowe wydanie, aby zachować pełny tekst przed wysyłką."}
                            </p>
                          )}
                          {article.source_url ? (
                            <a className="magazine-reading-source" href={article.source_url} rel="noreferrer" target="_blank">
                              Otwórz źródło
                            </a>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="magazine-issue-detail-actions">
                  <a className="secondary-button" href="#magazine-reading-preview">
                    <span className="button-with-icon">
                      <KindleIcon className="app-icon button-inline-icon" />
                      Czytaj przed wysyłką
                    </span>
                  </a>
                  <button
                    className="secondary-button"
                    disabled={issuePreflightDisabled}
                    onClick={() => activeIssue && onDeliveryPreflight(activeIssue)}
                    type="button"
                  >
                    <span className="button-with-icon">
                      <DeliveryIcon className="app-icon button-inline-icon" />
                      Preflight tego wydania
                    </span>
                  </button>
                  <button
                    className="secondary-button"
                    disabled={issueSendDisabled}
                    onClick={() => activeIssue && onSendDigestDryRun(activeIssue)}
                    type="button"
                  >
                    <span className="button-with-icon">
                      <StatusIcon className="app-icon button-inline-icon" />
                      Test tego wydania
                    </span>
                  </button>
                  <button
                    className="action-button compact-button"
                    disabled={issueSendDisabled}
                    onClick={() => activeIssue && onSendDigestLive(activeIssue)}
                    type="button"
                  >
                    <span className="button-with-icon">
                      <KindleIcon className="app-icon button-inline-icon" />
                      Wyślij to wydanie
                    </span>
                  </button>
                </div>

                {activeIssueGroups.length > 0 ? (
                  <div className="magazine-issue-groups" data-testid="magazine-issue-groups">
                    {activeIssueGroups.map((group) => (
                      <section className="magazine-issue-group" data-testid="magazine-issue-group" key={group.key}>
                        <div className="magazine-issue-group-header">
                          <h3>{group.label}</h3>
                          <span>{formatIssueArticleCount(group.articles.length)}</span>
                        </div>
                        <ol className="magazine-issue-articles">
                          {group.articles.map((article) => (
                            <li className="magazine-issue-article" data-testid="magazine-issue-article" key={article.item_id}>
                              <div>
                                <strong>{article.title}</strong>
                                <span>
                                  {[article.category, formatTimestamp(article.published_at, "bez daty")]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </div>
                              {article.source_url ? (
                                <a href={article.source_url} rel="noreferrer" target="_blank">
                                  Źródło
                                </a>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">To wydanie nie ma zapisanego snapshotu artykułów. Zbuduj nowe wydanie, aby utrwalić listę treści.</p>
                )}
              </div>
            ) : (
              <div className="magazine-active-empty" data-testid="magazine-active-empty">
                <strong>Gotowe miejsce na Wydanie 1/2026</strong>
                <p className="empty-state">
                  Pierwszy numer pokaże zawartość wydania, podgląd czytania, grupy źródeł oraz akcje wysyłki Kindle.
                </p>
                <button className="secondary-button" onClick={onBuild} type="button">
                  Zbuduj pierwsze wydanie
                </button>
              </div>
            )}
          </section>

          <div className="magazine-secondary-grid">
            <section className="ops-section magazine-next-issue" data-testid="magazine-next-issue-panel">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <StatusIcon className="app-icon app-icon-xs" />
                    Następne wydanie
                  </span>
                  <h3>Zbuduj kolejny numer</h3>
                </div>
                <span>{countLabel}</span>
              </div>
              <p className="empty-state">
                Ta sekcja przygotowuje następny numer z artykułów oznaczonych w czytniku do publikacji w magazynie.
              </p>

              <div className="channel-actions">
                <button className="secondary-button" disabled={previewDisabled} onClick={onPreview} type="button">
                  Sprawdź zawartość
                </button>
                <button className="action-button compact-button" disabled={buildDisabled} onClick={onBuild} type="button">
                  {busy ? "Buduję wydanie..." : "Zbuduj następne wydanie"}
                </button>
                <button className="secondary-button" onClick={onShowDigestQueue} type="button">
                  Otwórz listę w czytniku
                </button>
              </div>

              {preview ? (
                <div className="magazine-next-preview" data-testid="magazine-next-preview">
                  <div className="ops-row-top">
                    <strong>{preview.title}</strong>
                    <span>{getPreviewStatusLabel(status)}</span>
                  </div>
                  <span>
                    {formatIssueArticleCount(preview.stats.article_count)}, {preview.stats.word_count} słów,{" "}
                    {preview.stats.estimated_read_minutes} min
                  </span>
                  {preview.category_summary.length > 0 ? (
                    <span>{preview.category_summary.map((group) => `${group.category}: ${group.article_count}`).join(" · ")}</span>
                  ) : null}
                </div>
              ) : (
                <p className="empty-state">{message ?? getPreviewStatusLabel(status)}</p>
              )}
            </section>

            <section className="ops-section magazine-delivery-status">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <DeliveryIcon className="app-icon app-icon-xs" />
                    Delivery
                  </span>
                  <h3>Stan wysyłki</h3>
                </div>
                <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
              </div>
              {deliveryPreflight ? (
                <div className="ops-row">
                  <div className="ops-row-top">
                    <strong>{deliveryPreflight.artifact.title}</strong>
                    <span>{formatDeliveryStatus(deliveryPreflight.status)}</span>
                  </div>
                  <span>{deliveryPreflight.recipient ? `Odbiorca: ${deliveryPreflight.recipient}` : "Odbiorca nieustalony"}</span>
                  <span>
                    {deliveryPreflight.artifact.artifact_exists
                      ? `Rozmiar artefaktu: ${formatArtifactSize(deliveryPreflight.artifact.artifact_bytes)}`
                      : "Brak artefaktu"}
                  </span>
                </div>
              ) : (
                <p className="empty-state">Uruchom preflight dla otwartego wydania, aby potwierdzić gotowość wysyłki.</p>
              )}
            </section>

            <section className="ops-section magazine-settings-panel" data-testid="magazine-settings-panel">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <StatusIcon className="app-icon app-icon-xs" />
                    Konfiguracja
                  </span>
                  <h3>Harmonogram wydań</h3>
                </div>
                <span>{magazineSettings?.ready ? "gotowe" : "wymaga decyzji"}</span>
              </div>
              <p className="empty-state">
                Ustaw, jak RSSmaster ma przygotowywać kolejne numery. V1 zapisuje harmonogram i preflight, a generowanie możesz nadal uruchamiać ręcznie.
              </p>
              <form
                className="magazine-settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onMagazineSettingsSave();
                }}
              >
                <label className="field">
                  <span>Tryb</span>
                  <select
                    data-testid="magazine-frequency-select"
                    onChange={(event) => onMagazineSettingsDraftChange("frequency", event.target.value)}
                    value={magazineSettingsDraft.frequency}
                  >
                    <option value="disabled">Wyłączony</option>
                    <option value="manual">Ręczny</option>
                    <option value="daily">Codzienny</option>
                    <option value="weekly">Tygodniowy</option>
                  </select>
                </label>
                <label className="field">
                  <span>Strefa czasowa</span>
                  <input
                    onChange={(event) => onMagazineSettingsDraftChange("timezone", event.target.value)}
                    placeholder="Europe/Warsaw"
                    value={magazineSettingsDraft.timezone}
                  />
                </label>
                <label className="field">
                  <span>Godzina</span>
                  <input
                    onChange={(event) => onMagazineSettingsDraftChange("time_of_day", event.target.value)}
                    placeholder="07:00"
                    type="time"
                    value={magazineSettingsDraft.time_of_day}
                  />
                </label>
                <label className="field">
                  <span>Dzień tygodnia</span>
                  <select
                    onChange={(event) => onMagazineSettingsDraftChange("day_of_week", event.target.value)}
                    value={magazineSettingsDraft.day_of_week}
                  >
                    <option value="1">Poniedziałek</option>
                    <option value="2">Wtorek</option>
                    <option value="3">Środa</option>
                    <option value="4">Czwartek</option>
                    <option value="5">Piątek</option>
                    <option value="6">Sobota</option>
                    <option value="7">Niedziela</option>
                  </select>
                </label>
                <label className="field">
                  <span>Limit artykułów</span>
                  <input
                    max={200}
                    min={1}
                    onChange={(event) => onMagazineSettingsDraftChange("article_limit", event.target.value)}
                    type="number"
                    value={magazineSettingsDraft.article_limit}
                  />
                </label>
                <label className="field">
                  <span>Zakres</span>
                  <select
                    onChange={(event) => onMagazineSettingsDraftChange("source_scope", event.target.value)}
                    value={magazineSettingsDraft.source_scope}
                  >
                    <option value="digest_candidates">Artykuły oznaczone do magazynu</option>
                    <option value="favorites">Zapisane/favorites</option>
                    <option value="all_active">Wszystkie aktywne źródła</option>
                  </select>
                </label>
                <label className="field">
                  <span>Format</span>
                  <select
                    onChange={(event) => onMagazineSettingsDraftChange("output_format", event.target.value)}
                    value={magazineSettingsDraft.output_format}
                  >
                    <option value="epub">EPUB Kindle-ready</option>
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Wysyłka</span>
                  <span className="app-checkbox-row">
                    <input
                      checked={magazineSettingsDraft.kindle_delivery_enabled}
                      onChange={(event) =>
                        onMagazineSettingsDraftChange("kindle_delivery_enabled", event.target.checked)
                      }
                      type="checkbox"
                    />
                    Po wygenerowaniu przygotuj wysyłkę na Kindle, jeśli delivery jest gotowe.
                  </span>
                </label>
                <div className="channel-actions field-wide">
                  <button className="action-button compact-button" disabled={magazineSettingsBusy} type="submit">
                    {magazineSettingsBusy ? "Zapisuję..." : "Zapisz harmonogram"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={magazineSettingsBusy}
                    onClick={onMagazineSettingsPreflight}
                    type="button"
                  >
                    Sprawdź harmonogram
                  </button>
                </div>
              </form>
              {magazineSettingsMessage ? <p className="empty-state">{magazineSettingsMessage}</p> : null}
              {magazineSettingsPreflight ? (
                <div className="magazine-settings-preflight">
                  <div className="ops-row-top">
                    <strong>Preflight harmonogramu: {formatDeliveryStatus(magazineSettingsPreflight.status)}</strong>
                    <span>{magazineSettingsPreflight.can_generate ? "można generować" : "wymaga konfiguracji"}</span>
                  </div>
                  <ul>
                    {magazineSettingsPreflight.checks.map((check) => (
                      <li key={`${check.name}:${check.status}`}>
                        <strong>{check.name}</strong>: {check.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : magazineSettings?.issues.length ? (
                <ul className="magazine-settings-preflight">
                  {magazineSettings.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>

          {feedbackCard ? <div className="magazine-feedback-slot">{feedbackCard}</div> : null}
        </div>
      </div>
    </section>
  );
}
