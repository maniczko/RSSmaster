import type { CSSProperties, ReactNode } from "react";
import {
  formatCountLabel,
  formatRelativeDate,
  getStoryClusterMomentumMeta,
  type StoryClusterModel,
} from "@/app/lib/editorial-support";
import { mergeStyles, workspaceStyles } from "@/app/lib/workspace-ui";
import {
  WorkspaceChip,
  WorkspaceMetricList,
  WorkspacePanel,
} from "@/app/components/workspace-primitives";

export type StoryClusterCardProps = {
  cluster: StoryClusterModel;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxStories?: number;
  onStorySelect?: (storyId: string) => void;
};

function getStoryStateTone(state: StoryClusterModel["stories"][number]["state"]) {
  if (state === "saved") {
    return "accent";
  }
  if (state === "archived") {
    return "danger";
  }
  if (state === "seen") {
    return "muted";
  }
  return "success";
}

function getStoryStateLabel(state: StoryClusterModel["stories"][number]["state"]) {
  if (state === "saved") {
    return "Zapisane";
  }
  if (state === "archived") {
    return "Archiwum";
  }
  if (state === "seen") {
    return "Widziane";
  }
  return "Nowe";
}

export function StoryClusterCard({
  cluster,
  actions,
  className,
  style,
  maxStories = 3,
  onStorySelect,
}: StoryClusterCardProps) {
  const momentumMeta = getStoryClusterMomentumMeta(cluster.momentum);
  const visibleStories = cluster.stories.slice(0, maxStories);

  return (
    <WorkspacePanel
      actions={actions}
      className={className}
      description={cluster.summary ?? "Zgrupowane publikacje o jednym rozwijajacym sie temacie."}
      eyebrow="Klaster historii"
      style={style}
      title={cluster.title}
      tone={momentumMeta.tone}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flexWrap: "wrap",
        }}
      >
        <WorkspaceChip active tone={momentumMeta.tone}>
          {momentumMeta.label}
        </WorkspaceChip>
        {cluster.leadSource ? <WorkspaceChip>{cluster.leadSource}</WorkspaceChip> : null}
        {cluster.labels?.map((label) => (
          <WorkspaceChip key={label}>{label}</WorkspaceChip>
        ))}
      </div>

      <WorkspaceMetricList
        columns={4}
        items={[
          {
            label: "Zrodla",
            value: cluster.sourceCount,
            detail: formatCountLabel(cluster.sourceCount, "zrodlo", "zrodla"),
          },
          {
            label: "Historie",
            value: cluster.storyCount,
            detail: formatCountLabel(cluster.storyCount, "historia", "historie"),
          },
          {
            label: "Nieprzeczytane",
            value: cluster.unreadCount ?? 0,
            detail:
              typeof cluster.unreadCount === "number"
                ? "Wciaz czekaja w kolejce"
                : "Jeszcze nie sledzone",
          },
          {
            label: "Zapisane",
            value: cluster.savedCount ?? 0,
            detail:
              typeof cluster.savedCount === "number"
                ? "Juz zapisane przez uzytkownika"
                : "Brak zapisanych",
          },
        ]}
      />

      {visibleStories.length > 0 ? (
        <ul style={workspaceStyles.list}>
          {visibleStories.map((story) => (
            <li key={story.id} style={workspaceStyles.listItem}>
              <button
                onClick={onStorySelect ? () => onStorySelect(story.id) : undefined}
                style={{
                  display: "grid",
                  gap: "0.45rem",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  width: "100%",
                  textAlign: "left",
                  cursor: onStorySelect ? "pointer" : "default",
                }}
                type="button"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.3rem", minWidth: 0 }}>
                    <strong style={workspaceStyles.title}>{story.title}</strong>
                    <span style={workspaceStyles.bodyText}>
                      {story.source} | {formatRelativeDate(story.publishedAt, new Date(), "Nieznany czas publikacji")}
                    </span>
                  </div>
                  {story.state ? (
                    <WorkspaceChip tone={getStoryStateTone(story.state)} active={story.state !== "seen"}>
                      {getStoryStateLabel(story.state)}
                    </WorkspaceChip>
                  ) : null}
                </div>
                {story.summary ? <p style={workspaceStyles.bodyText}>{story.summary}</p> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        style={mergeStyles(workspaceStyles.dividerTop, {
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
        })}
      >
        <span style={workspaceStyles.caption}>
          Zaktualizowano {formatRelativeDate(cluster.updatedAt, new Date(), "Nieznany czas")}
        </span>
        <span style={workspaceStyles.caption}>
          {formatCountLabel(cluster.storyCount, "historia", "historie")} w {formatCountLabel(cluster.sourceCount, "zrodle", "zrodlach")}
        </span>
      </div>
    </WorkspacePanel>
  );
}
