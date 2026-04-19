import type { CSSProperties, ReactNode } from "react";
import {
  formatAbsoluteDate,
  formatRelativeDate,
  getAnnotationKindMeta,
  getAnnotationStatusMeta,
  type AnnotationEntry,
  type AnnotationPanelModel,
} from "@/app/lib/editorial-support";
import { workspaceStyles } from "@/app/lib/workspace-ui";
import {
  WorkspaceButton,
  WorkspaceChip,
  WorkspaceEmptyState,
  WorkspacePanel,
} from "@/app/components/workspace-primitives";

export type AnnotationPanelProps = {
  panel: AnnotationPanelModel;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxEntries?: number;
  onCreateAnnotation?: () => void;
  entryActions?: (entry: AnnotationEntry) => ReactNode;
};

export function AnnotationPanel({
  panel,
  actions,
  className,
  style,
  maxEntries = 4,
  onCreateAnnotation,
  entryActions,
}: AnnotationPanelProps) {
  const statusMeta = getAnnotationStatusMeta(panel.status);
  const visibleEntries = panel.entries.slice(0, maxEntries);

  return (
    <WorkspacePanel
      actions={actions}
      className={className}
      description={
        panel.storyTitle
          ? `Notatki i decyzje dla: ${panel.storyTitle}.`
          : "Notatki, podkreslenia i decyzje zwiazane z czytaniem."
      }
      eyebrow="Adnotacje"
      style={style}
      title={panel.title}
      tone={statusMeta.tone}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flexWrap: "wrap",
        }}
      >
        <WorkspaceChip active tone={statusMeta.tone}>
          {statusMeta.label}
        </WorkspaceChip>
        {panel.selectionLabel ? <WorkspaceChip>{panel.selectionLabel}</WorkspaceChip> : null}
        {typeof panel.linkedStoryCount === "number" ? (
          <WorkspaceChip>{panel.linkedStoryCount} powiazane historie</WorkspaceChip>
        ) : null}
        {panel.updatedAt ? (
          <WorkspaceChip title={formatAbsoluteDate(panel.updatedAt)}>
            Zaktualizowano {formatRelativeDate(panel.updatedAt)}
          </WorkspaceChip>
        ) : null}
      </div>

      {visibleEntries.length === 0 ? (
        <WorkspaceEmptyState
          action={
            onCreateAnnotation ? (
              <WorkspaceButton onClick={onCreateAnnotation} tone="accent">
                Dodaj adnotacje
              </WorkspaceButton>
            ) : null
          }
          description={
            panel.emptyState?.body ??
            "Uzyj tego panelu do notatek, uwag o ekstrakcji i decyzji do digestu."
          }
          title={panel.emptyState?.title ?? "Brak adnotacji"}
        />
      ) : (
        <ul style={workspaceStyles.list}>
          {visibleEntries.map((entry) => {
            const kindMeta = getAnnotationKindMeta(entry.kind);
            const entryStatusMeta = getAnnotationStatusMeta(entry.status);

            return (
              <li key={entry.id} style={workspaceStyles.listItem}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <WorkspaceChip active tone={kindMeta.tone}>
                      {kindMeta.label}
                    </WorkspaceChip>
                    {entry.status ? (
                      <WorkspaceChip tone={entryStatusMeta.tone} active>
                        {entryStatusMeta.label}
                      </WorkspaceChip>
                    ) : null}
                    {entry.tags?.map((tag) => (
                      <WorkspaceChip key={`${entry.id}-${tag}`}>{tag}</WorkspaceChip>
                    ))}
                  </div>

                  <span
                    style={workspaceStyles.caption}
                    title={formatAbsoluteDate(entry.createdAt)}
                  >
                    {formatRelativeDate(entry.createdAt)}
                  </span>
                </div>

                {entry.quote ? <blockquote style={workspaceStyles.quoteCard}>{entry.quote}</blockquote> : null}

                <p style={workspaceStyles.bodyText}>{entry.body}</p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.65rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={workspaceStyles.caption}>
                    {entry.authorLabel}
                    {entry.quoteContext ? ` | ${entry.quoteContext}` : ""}
                  </span>
                  {entryActions ? <div>{entryActions(entry)}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {panel.entries.length > visibleEntries.length ? (
        <span style={workspaceStyles.caption}>
          Pokazano {visibleEntries.length} z {panel.entries.length} adnotacji.
        </span>
      ) : null}
    </WorkspacePanel>
  );
}
