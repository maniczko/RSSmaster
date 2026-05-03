import type { SourceAddModeDefinition, SourceAddModeId } from "@/app/lib/source-add-modes";

import {
  BackofficeIcon,
  CaptureIcon,
  FeedIcon,
  ImportIcon,
  SparkIcon,
  WebsiteIcon,
} from "./ui-icons";

type SourceAddModeNavProps = {
  activeModeId: SourceAddModeId;
  importMode: SourceAddModeDefinition | null;
  onCapture: () => void;
  onModeSelect: (modeId: SourceAddModeId, focusTarget: "input" | "import") => void;
  primaryModes: SourceAddModeDefinition[];
  primaryModesLabelId: string;
  secondaryActionsLabelId: string;
  upcomingModes: SourceAddModeDefinition[];
};

export function SourceModeIcon({
  className = "app-icon",
  modeId,
}: {
  className?: string;
  modeId: SourceAddModeId;
}) {
  if (modeId === "website") {
    return <WebsiteIcon className={className} />;
  }
  if (modeId === "web_feed") {
    return <FeedIcon className={className} />;
  }
  if (modeId === "import_feeds") {
    return <ImportIcon className={className} />;
  }
  return <BackofficeIcon className={className} />;
}

export function SourceAddModeNav({
  activeModeId,
  importMode,
  onCapture,
  onModeSelect,
  primaryModes,
  primaryModesLabelId,
  secondaryActionsLabelId,
  upcomingModes,
}: SourceAddModeNavProps) {
  return (
    <aside className="source-add-nav" aria-label="Typ dodawanego źródła">
      <div className="source-add-nav-header">
        <strong id={primaryModesLabelId}>Dodaj źródło</strong>
        <p>Zacznij od strony albo bezpośredniego feedu. Migracje i operacje ręczne zostają w tle.</p>
      </div>
      <div aria-labelledby={primaryModesLabelId} className="source-add-nav-list" role="group">
        {primaryModes.map((mode) => (
          <button
            aria-pressed={activeModeId === mode.id}
            className={`source-add-nav-item ${activeModeId === mode.id ? "source-add-nav-item-active" : ""}`}
            data-testid={`source-mode-${mode.id}`}
            key={mode.id}
            onClick={() => onModeSelect(mode.id, "input")}
            type="button"
          >
            <span className="source-add-nav-icon">
              <SourceModeIcon modeId={mode.id} />
            </span>
            <span className="source-add-nav-copy">
              <strong>{mode.label}</strong>
              <small>{mode.enabled ? mode.description : "Wkrotce"}</small>
            </span>
          </button>
        ))}
      </div>
      {importMode ? (
        <div className="source-add-nav-secondary">
          <div className="source-add-nav-secondary-copy">
            <strong id={secondaryActionsLabelId}>Migracja i przechwytywanie</strong>
            <p>Przenieś bibliotekę z OPML albo zapisz pojedynczy link bez opuszczania produktu.</p>
          </div>
          <div aria-labelledby={secondaryActionsLabelId} className="source-add-nav-link-list" role="group">
            <button
              aria-pressed={activeModeId === importMode.id}
              className={`source-add-nav-link ${activeModeId === importMode.id ? "source-add-nav-link-active" : ""}`}
              data-testid="source-mode-import"
              onClick={() => onModeSelect(importMode.id, "import")}
              type="button"
            >
              <span className="button-with-icon">
                <ImportIcon className="app-icon button-inline-icon" />
                {importMode.label}
              </span>
            </button>
            <button className="source-add-nav-link" data-testid="source-capture-link" onClick={onCapture} type="button">
              <span className="button-with-icon">
                <CaptureIcon className="app-icon button-inline-icon" />
                Przechwyć link
              </span>
            </button>
          </div>
        </div>
      ) : null}
      {upcomingModes.length > 0 ? (
        <details className="source-add-nav-upcoming">
          <summary>
            <span className="button-with-icon">
              <SparkIcon className="app-icon button-inline-icon" />
              Więcej wkrótce ({upcomingModes.length})
            </span>
          </summary>
          <div className="source-add-nav-upcoming-list">
            {upcomingModes.map((mode) => (
              <span className="source-add-nav-upcoming-chip" key={mode.id}>
                {mode.label}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </aside>
  );
}
