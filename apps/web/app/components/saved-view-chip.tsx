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

  const content = (
    <>
      <span style={{ display: "grid", gap: "0.14rem", textAlign: "left", minWidth: 0 }}>
        <span style={workspaceStyles.title}>{view.label}</span>
        {view.description ? <span style={workspaceStyles.caption}>{view.description}</span> : null}
      </span>

      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
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
      className={className}
      style={mergeStyles(
        {
          display: "inline-flex",
          alignItems: "stretch",
          gap: "0.45rem",
          maxWidth: "100%",
        },
        style,
      )}
    >
      {onSelect ? (
        <WorkspaceButton
          active={view.isActive}
          accent={accent}
          onClick={() => onSelect(view.id)}
          style={{
            minHeight: "2.9rem",
            maxWidth: "100%",
            padding: "0.48rem 0.82rem",
            borderRadius: 999,
            justifyContent: "space-between",
            flexWrap: "wrap",
            flex: "1 1 auto",
          }}
          tone={meta.tone}
        >
          {content}
        </WorkspaceButton>
      ) : (
        <div
          style={mergeStyles(
            getButtonStyle({
              tone: meta.tone,
              accent,
              active: view.isActive,
            }),
            {
              minHeight: "2.9rem",
              maxWidth: "100%",
              padding: "0.48rem 0.82rem",
              borderRadius: 999,
              justifyContent: "space-between",
              flexWrap: "wrap",
              flex: "1 1 auto",
            },
          )}
        >
          {content}
        </div>
      )}

      {onClear ? (
        <WorkspaceButton
          onClick={() => onClear(view.id)}
          style={{ minHeight: "2.9rem", borderRadius: 999 }}
          tone="danger"
        >
          Wyczysc
        </WorkspaceButton>
      ) : null}
    </div>
  );
}
