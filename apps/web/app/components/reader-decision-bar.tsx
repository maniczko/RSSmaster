import {
  getReaderDecisionButtonLabel,
  getReaderDecisionNextLine,
  readerDecisionActions,
  type ReaderDecisionAction,
} from "@/app/lib/reader-decision";

type ReaderDecisionBarProps = {
  busy: boolean;
  canArchive: boolean;
  canUndo: boolean;
  nextItemTitle: string | null;
  undoBusy: boolean;
  onAction: (action: ReaderDecisionAction) => void;
  onUndo: () => void;
};

export function ReaderDecisionBar({
  busy,
  canArchive,
  canUndo,
  nextItemTitle,
  onAction,
  onUndo,
  undoBusy,
}: ReaderDecisionBarProps) {
  return (
    <div className="reader-decision-bar" data-testid="reader-decision-bar" role="toolbar" aria-label="Szybkie decyzje czytelnika">
      <div className="reader-decision-context">
        <span>Reader loop</span>
        <strong>Decyzja i kolejny artykul bez wracania do listy</strong>
        <small>{getReaderDecisionNextLine(nextItemTitle)}</small>
      </div>
      <div className="reader-decision-actions">
        {readerDecisionActions.map((action) => (
          <button
            className={`reader-decision-button ${action === "read_next" ? "reader-decision-button-primary" : ""}`}
            data-testid={`reader-decision-${action.replace("_", "-")}`}
            disabled={busy || (action === "archive_next" && !canArchive)}
            key={action}
            onClick={() => onAction(action)}
            type="button"
          >
            {getReaderDecisionButtonLabel(action)}
          </button>
        ))}
        <button
          className="reader-decision-button reader-decision-button-ghost"
          data-testid="reader-decision-undo"
          disabled={!canUndo || undoBusy}
          onClick={onUndo}
          type="button"
        >
          {undoBusy ? "Cofanie..." : "Cofnij"}
        </button>
      </div>
    </div>
  );
}
