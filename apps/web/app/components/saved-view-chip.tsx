import type { CSSProperties } from "react";
import {
  formatCompactNumber,
  getSavedViewMeta,
  type SavedViewChipModel,
} from "@/app/lib/editorial-support";
import {
  getButtonStyle,
  mergeStyles,
  workspaceStyles,
} from "@/app/lib/workspace-ui";
import {
  BookmarkIcon,
  DigestIcon,
  DismissIcon,
  DiscoverIcon,
  SearchIcon,
} from "@/app/components/ui-icons";
import { WorkspaceButton, WorkspaceChip } from "@/app/components/workspace-primitives";

export type SavedViewChipProps = {
  view: SavedViewChipModel;
  onSelect?: (viewId: string) => void;
  onClear?: (viewId: string) => void;
  className?: string;
  style?: CSSProperties;
};

export function SavedViewChip({
  view,
  onSelect,
  onClear,
  className,
  style,
}: SavedViewChipProps) {
  const meta = getSavedViewMeta(view.kind);
  const accent = view.accent ?? meta.accent;

  function renderSavedViewIcon() {
    if (view.kind === "saved") {
      return <BookmarkIcon className="app-icon" />;
    }
    if (view.kind === "digest") {
      return <DigestIcon className="app-icon" />;
    }
    if (view.kind === "cluster") {
      return <DiscoverIcon className="app-icon" />;
    }
    return <SearchIcon className="app-icon" />;
  }

  const content = (
    <>
      <span className="saved-view-chip-content">
        <span className="saved-view-chip-icon">{renderSavedViewIcon()}</span>
        <span className="saved-view-chip-copy">
          <span style={workspaceStyles.title}>{view.label}</span>
          {view.description ? <span style={workspaceStyles.caption}>{view.description}</span> : null}
        </span>
      </span>

      <span className="saved-view-chip-metrics">
        <WorkspaceChip active accent={accent}>
          {meta.label}
        </WorkspaceChip>
        {typeof view.resultCount === "number" ? (
          <WorkspaceChip>{formatCompactNumber(view.resultCount)} pozycji</WorkspaceChip>
        ) : null}
        {typeof view.unreadCount === "number" ? (
          <WorkspaceChip tone="success" active={view.unreadCount > 0}>
            {formatCompactNumber(view.unreadCount)} nieprzeczytanych
          </WorkspaceChip>
        ) : null}
        {view.isPinned ? (
          <WorkspaceChip tone="warning" active>
            Przypiete
          </WorkspaceChip>
        ) : null}
      </span>
    </>
  );

  return (
    <div
      className={["saved-view-chip-shell", className].filter(Boolean).join(" ")}
      style={mergeStyles(
        {
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "0.55rem",
          alignItems: "stretch",
          maxWidth: "100%",
        },
        style,
      )}
    >
      {onSelect ? (
        <WorkspaceButton
          active={view.isActive}
          accent={accent}
          className="saved-view-chip-button"
          onClick={() => onSelect(view.id)}
          style={{
            minHeight: "2.9rem",
            maxWidth: "100%",
            flex: "1 1 auto",
          }}
          tone={meta.tone}
        >
          {content}
        </WorkspaceButton>
      ) : (
        <div
          className="saved-view-chip-button"
          style={mergeStyles(
            getButtonStyle({
              tone: meta.tone,
              accent,
              active: view.isActive,
            }),
            {
              minHeight: "2.9rem",
              maxWidth: "100%",
              flex: "1 1 auto",
            },
          )}
        >
          {content}
        </div>
      )}

      {onClear ? (
        <WorkspaceButton
          aria-label={`Usun zapisany widok ${view.label}`}
          className="saved-view-chip-clear"
          onClick={() => onClear(view.id)}
          style={{ minHeight: "2.9rem" }}
          title="Usun zapisany widok"
          tone="danger"
        >
          <span className="button-with-icon">
            <span className="saved-view-chip-clear-mark" aria-hidden="true">
              <DismissIcon className="app-icon" />
            </span>
            <span className="saved-view-chip-clear-label">Usun</span>
          </span>
        </WorkspaceButton>
      ) : null}
    </div>
  );
}
