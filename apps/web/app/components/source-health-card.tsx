import type { CSSProperties, ReactNode } from "react";
import {
  formatRelativeDate,
  getDomainLabel,
  getSourceHealthFacts,
  getSourceHealthStatusMeta,
  getSourceStateMeta,
  type SourceHealthCardModel,
} from "@/app/lib/editorial-support";
import { mergeStyles, workspaceStyles } from "@/app/lib/workspace-ui";
import {
  WorkspaceChip,
  WorkspaceMetricList,
  WorkspacePanel,
} from "@/app/components/workspace-primitives";

export type SourceHealthCardProps = {
  source: SourceHealthCardModel;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  indicatorLimit?: number;
};

export function SourceHealthCard({
  source,
  actions,
  className,
  style,
  indicatorLimit = 4,
}: SourceHealthCardProps) {
  const healthMeta = getSourceHealthStatusMeta(source.health.status);
  const stateMeta = source.state ? getSourceStateMeta(source.state) : null;
  const facts = getSourceHealthFacts(source);
  const domain = getDomainLabel(source.siteUrl ?? source.feedUrl);
  const visibleIndicators = source.health.indicators.slice(0, indicatorLimit);

  return (
    <WorkspacePanel
      actions={actions}
      className={className}
      description={source.health.summary}
      eyebrow="Stan zrodla"
      style={style}
      title={source.title}
      tone={healthMeta.tone}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flexWrap: "wrap",
        }}
      >
        <WorkspaceChip active tone={healthMeta.tone}>
          {healthMeta.label}
        </WorkspaceChip>
        {stateMeta ? (
          <WorkspaceChip active={source.state === "active"} tone={stateMeta.tone}>
            {stateMeta.label}
          </WorkspaceChip>
        ) : null}
        {source.category ? <WorkspaceChip>{source.category}</WorkspaceChip> : null}
        {source.health.stale ? (
          <WorkspaceChip tone="warning" active>
            Nieaktualne
          </WorkspaceChip>
        ) : null}
        {source.health.noisy ? (
          <WorkspaceChip tone="danger" active>
            Glosne
          </WorkspaceChip>
        ) : null}
        {domain ? <WorkspaceChip>{domain}</WorkspaceChip> : null}
      </div>

      <WorkspaceMetricList columns={Math.min(4, Math.max(facts.length, 1))} items={facts} />

      {visibleIndicators.length > 0 ? (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <strong style={workspaceStyles.title}>Sygnaly na zywo</strong>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.45rem",
            }}
          >
            {visibleIndicators.map((indicator) => (
              <WorkspaceChip key={indicator}>{indicator}</WorkspaceChip>
            ))}
          </div>
        </div>
      ) : null}

      {source.health.lastErrorMessage ? (
        <div
          style={mergeStyles(workspaceStyles.panelMuted, {
            padding: "0.85rem 0.9rem",
            borderColor: "rgba(194, 65, 45, 0.18)",
            background: "rgba(255, 245, 243, 0.92)",
          })}
        >
          <strong style={workspaceStyles.title}>Ostatni blad</strong>
          <p style={workspaceStyles.bodyText}>{source.health.lastErrorMessage}</p>
        </div>
      ) : null}

      <div
        style={mergeStyles(workspaceStyles.dividerTop, {
          display: "flex",
          flexWrap: "wrap",
          gap: "0.65rem",
        })}
      >
        <span style={workspaceStyles.caption}>
          Ostatni fetch: {formatRelativeDate(source.health.lastFetchAt, new Date(), "Nigdy")}
        </span>
        <span style={workspaceStyles.caption}>
          Ostatni sukces:{" "}
          {formatRelativeDate(source.health.lastSuccessfulFetchAt, new Date(), "Brak udanego syncu")}
        </span>
        <span style={workspaceStyles.caption}>
          Ostatni artykul: {formatRelativeDate(source.health.latestItemAt, new Date(), "Brak artykulow")}
        </span>
      </div>
    </WorkspacePanel>
  );
}
