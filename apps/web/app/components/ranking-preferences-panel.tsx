import type { CSSProperties, ReactNode } from "react";
import {
  getRankingPreferenceOption,
  summarizeRankingPreferences,
  sortRankingPreferences,
  type RankingPreference,
  type RankingPreferenceScope,
} from "@/app/lib/editorial-support";
import { mergeStyles, workspaceStyles } from "@/app/lib/workspace-ui";
import {
  WorkspaceButton,
  WorkspaceChip,
  WorkspaceEmptyState,
  WorkspaceMetricList,
  WorkspacePanel,
} from "@/app/components/workspace-primitives";

export type RankingPreferencesPanelProps<TValue extends string = string> = {
  preferences: readonly RankingPreference<TValue>[];
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  emptyState?: {
    title: ReactNode;
    description: ReactNode;
  };
  onPreferenceChange?: (preferenceId: string, nextValue: TValue) => void;
  onResetPreference?: (preferenceId: string) => void;
  className?: string;
  style?: CSSProperties;
};

const scopeLabels = {
  freshness: "Swiezosc",
  source: "Zrodlo",
  cluster: "Klaster",
  format: "Format",
  author: "Autor",
  manual: "Recznie",
} satisfies Record<RankingPreferenceScope, string>;

function getScopeLabel(scope: RankingPreferenceScope | undefined): string | null {
  return scope ? scopeLabels[scope] : null;
}

export function RankingPreferencesPanel<TValue extends string = string>({
  preferences,
  title = "Preferencje rankingu",
  description = "Dostroj, jak czytnik priorytetyzuje swiezosc, zaufanie do zrodla i glebie klastra.",
  actions,
  emptyState = {
    title: "Brak ustawien rankingu",
    description: "Tutaj pojawia sie sygnaly sterujace priorytetyzacja artykulow.",
  },
  onPreferenceChange,
  onResetPreference,
  className,
  style,
}: RankingPreferencesPanelProps<TValue>) {
  const orderedPreferences = sortRankingPreferences(preferences);
  const summary = summarizeRankingPreferences(orderedPreferences);

  return (
    <WorkspacePanel
      actions={actions}
      className={className}
      description={description}
      eyebrow="Ranking"
      style={style}
      title={title}
      tone="accent"
    >
      {orderedPreferences.length === 0 ? (
        <WorkspaceEmptyState
          description={emptyState.description}
          title={emptyState.title}
        />
      ) : (
        <>
          <WorkspaceMetricList
            columns={summary.weightedScore === null ? 3 : 4}
            items={[
              {
                label: "Kontrolki",
                value: summary.total,
                detail: summary.scopes.length > 0 ? summary.scopes.join(" / ") : "Brak zakresow",
              },
              {
                label: "Wlasne",
                value: summary.customized,
                detail:
                  summary.customized > 0
                    ? "Aktywne niestandardowe ustawienia"
                    : "Wciaz domyslne",
              },
              {
                label: "Przypiete",
                value: summary.pinned,
                detail:
                  summary.pinned > 0
                    ? "Przypiete na gorze stosu ustawien"
                    : "Brak przypietych priorytetow",
              },
              ...(summary.weightedScore === null
                ? []
                : [
                    {
                      label: "Wplyw",
                      value: `${Math.round(summary.weightedScore * 100)}%`,
                      detail: "Wazony wynik dla aktualnych opcji",
                    },
                  ]),
            ]}
          />

          <div style={{ display: "grid", gap: "0.8rem" }}>
            {orderedPreferences.map((preference) => {
              const selectedOption = getRankingPreferenceOption(preference);
              const scopeLabel = getScopeLabel(preference.scope);
              const isCustomized = preference.value !== preference.defaultValue;

              return (
                <section
                  key={preference.id}
                  style={mergeStyles(workspaceStyles.listItem, {
                    gap: "0.7rem",
                  })}
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
                    <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={workspaceStyles.title}>{preference.label}</strong>
                        {scopeLabel ? <WorkspaceChip>{scopeLabel}</WorkspaceChip> : null}
                        {preference.isPinned ? (
                          <WorkspaceChip accent="blue" active>
                            Przypiete
                          </WorkspaceChip>
                        ) : null}
                        {isCustomized ? (
                          <WorkspaceChip tone="accent" active>
                            Wlasne
                          </WorkspaceChip>
                        ) : null}
                        {preference.locked ? (
                          <WorkspaceChip tone="warning" active>
                            Zablokowane
                          </WorkspaceChip>
                        ) : null}
                      </div>
                      {preference.description ? (
                        <p style={workspaceStyles.bodyText}>{preference.description}</p>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {typeof preference.weight === "number" ? (
                        <WorkspaceChip title="Wzgledna waga sygnalu">
                          Waga {preference.weight}
                        </WorkspaceChip>
                      ) : null}
                      {onResetPreference && isCustomized ? (
                        <WorkspaceButton
                          onClick={() => onResetPreference(preference.id)}
                          tone="default"
                        >
                          Resetuj
                        </WorkspaceButton>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.55rem",
                    }}
                  >
                    {preference.options.map((option) => {
                      const isActive = option.value === preference.value;

                      if (!onPreferenceChange) {
                        return (
                          <WorkspaceChip
                            active={isActive}
                            accent={isActive ? "blue" : undefined}
                            key={`${preference.id}-${option.value}`}
                            title={option.description}
                          >
                            {option.shortLabel ?? option.label}
                          </WorkspaceChip>
                        );
                      }

                      return (
                        <WorkspaceButton
                          active={isActive}
                          accent={isActive ? "blue" : undefined}
                          disabled={preference.locked}
                          key={`${preference.id}-${option.value}`}
                          onClick={() => onPreferenceChange(preference.id, option.value)}
                          title={option.description}
                        >
                          {option.shortLabel ?? option.label}
                        </WorkspaceButton>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={workspaceStyles.caption}>
                      {selectedOption?.description ??
                        preference.hint ??
                        `Domyslnie: ${
                          getRankingPreferenceOption(preference, preference.defaultValue)?.label ??
                          preference.defaultValue
                        }`}
                    </span>
                    <span style={workspaceStyles.caption}>
                      Aktywna wartosc: {selectedOption?.label ?? preference.value}
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </WorkspacePanel>
  );
}
