import type { CSSProperties } from "react";

export type WorkspaceTone = "default" | "accent" | "success" | "warning" | "danger" | "muted";
export type WorkspaceAccent = "blue" | "green" | "amber" | "slate" | "rose";

type WorkspacePalette = {
  background: string;
  border: string;
  color: string;
};

const tonePalettes = {
  default: {
    background: "rgba(248, 250, 253, 0.96)",
    border: "var(--line)",
    color: "var(--text)",
  },
  accent: {
    background: "rgba(29, 111, 233, 0.1)",
    border: "rgba(29, 111, 233, 0.18)",
    color: "var(--accent-strong)",
  },
  success: {
    background: "rgba(22, 125, 95, 0.12)",
    border: "rgba(22, 125, 95, 0.18)",
    color: "var(--ok)",
  },
  warning: {
    background: "rgba(187, 120, 38, 0.12)",
    border: "rgba(187, 120, 38, 0.18)",
    color: "#9a5a12",
  },
  danger: {
    background: "rgba(194, 65, 45, 0.1)",
    border: "rgba(194, 65, 45, 0.18)",
    color: "var(--warn)",
  },
  muted: {
    background: "rgba(100, 116, 139, 0.1)",
    border: "rgba(100, 116, 139, 0.18)",
    color: "#576277",
  },
} satisfies Record<WorkspaceTone, WorkspacePalette>;

const accentPalettes = {
  blue: {
    background: "rgba(29, 111, 233, 0.1)",
    border: "rgba(29, 111, 233, 0.18)",
    color: "var(--accent-strong)",
  },
  green: {
    background: "rgba(22, 125, 95, 0.12)",
    border: "rgba(22, 125, 95, 0.18)",
    color: "var(--ok)",
  },
  amber: {
    background: "rgba(187, 120, 38, 0.12)",
    border: "rgba(187, 120, 38, 0.18)",
    color: "#9a5a12",
  },
  slate: {
    background: "rgba(100, 116, 139, 0.1)",
    border: "rgba(100, 116, 139, 0.18)",
    color: "#516079",
  },
  rose: {
    background: "rgba(190, 24, 93, 0.1)",
    border: "rgba(190, 24, 93, 0.18)",
    color: "#9d174d",
  },
} satisfies Record<WorkspaceAccent, WorkspacePalette>;

export const workspaceTypography = {
  sans: '"Aptos", "Segoe UI Variable", "Segoe UI", sans-serif',
  serif: '"Iowan Old Style", "Charter", Georgia, serif',
} as const;

export const workspaceStyles = {
  panel: {
    display: "grid",
    gap: "1rem",
    padding: "1.1rem 1.15rem",
    border: "1px solid var(--line)",
    borderRadius: 16,
    background: "var(--surface-elevated)",
    boxShadow: "none",
  },
  panelMuted: {
    border: "1px solid var(--line)",
    borderRadius: 16,
    background: "var(--surface-subtle)",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.95rem",
    flexWrap: "wrap",
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    minHeight: "1.8rem",
    padding: "0.18rem 0.62rem",
    border: "1px solid var(--line)",
    borderRadius: 999,
    background: "var(--surface-subtle)",
    color: "var(--muted)",
    fontFamily: workspaceTypography.sans,
    fontSize: "0.76rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    color: "var(--text)",
    fontFamily: workspaceTypography.sans,
    fontSize: "1.06rem",
    fontWeight: 700,
    lineHeight: 1.24,
  },
  bodyText: {
    margin: 0,
    color: "var(--muted)",
    fontFamily: workspaceTypography.sans,
    fontSize: "0.9rem",
    lineHeight: 1.6,
  },
  caption: {
    color: "var(--muted)",
    fontFamily: workspaceTypography.sans,
    fontSize: "0.81rem",
    lineHeight: 1.5,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    minHeight: "1.85rem",
    padding: "0.18rem 0.66rem",
    border: "1px solid var(--line)",
    borderRadius: 999,
    background: "var(--surface-elevated)",
    color: "var(--muted)",
    fontFamily: workspaceTypography.sans,
    fontSize: "0.76rem",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  buttonBase: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    minHeight: "2.35rem",
    padding: "0.48rem 0.9rem",
    border: "1px solid var(--line)",
    borderRadius: 12,
    background: "var(--surface-elevated)",
    color: "var(--text)",
    cursor: "pointer",
    fontFamily: workspaceTypography.sans,
    fontSize: "0.84rem",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  metricCard: {
    display: "grid",
    gap: "0.12rem",
    padding: "0.82rem 0.9rem",
    border: "1px solid var(--line)",
    borderRadius: 14,
    background: "var(--surface-subtle)",
  },
  list: {
    display: "grid",
    gap: "0.7rem",
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  listItem: {
    display: "grid",
    gap: "0.5rem",
    padding: "0.85rem 0.9rem",
    border: "1px solid var(--line)",
    borderRadius: 12,
    background: "var(--surface-subtle)",
  },
  quoteCard: {
    margin: 0,
    padding: "0.7rem 0.82rem",
    border: "1px solid rgba(29, 111, 233, 0.14)",
    borderRadius: 12,
    background: "rgba(237, 245, 255, 0.58)",
    color: "var(--text)",
    fontFamily: workspaceTypography.serif,
    fontSize: "0.94rem",
    lineHeight: 1.65,
  },
  dividerTop: {
    paddingTop: "0.9rem",
    borderTop: "1px solid var(--line)",
  },
} satisfies Record<string, CSSProperties>;

export function mergeStyles(
  ...styles: Array<CSSProperties | false | null | undefined>
): CSSProperties {
  const merged: CSSProperties = {};

  for (const style of styles) {
    if (style) {
      Object.assign(merged, style);
    }
  }

  return merged;
}

export function getTonePalette(tone: WorkspaceTone = "default"): WorkspacePalette {
  return tonePalettes[tone];
}

export function getAccentPalette(accent: WorkspaceAccent = "blue"): WorkspacePalette {
  return accentPalettes[accent];
}

export function getChipStyle({
  tone = "muted",
  accent,
  active = false,
}: {
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
  active?: boolean;
} = {}): CSSProperties {
  const palette = accent ? getAccentPalette(accent) : getTonePalette(tone);

  return mergeStyles(
    workspaceStyles.chip,
    active || accent
      ? {
          background: palette.background,
          borderColor: palette.border,
          color: palette.color,
        }
      : undefined,
  );
}

export function getButtonStyle({
  tone = "default",
  accent,
  active = false,
  disabled = false,
}: {
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
  active?: boolean;
  disabled?: boolean;
} = {}): CSSProperties {
  const palette = accent ? getAccentPalette(accent) : getTonePalette(tone);

  return mergeStyles(
    workspaceStyles.buttonBase,
    tone !== "default" || active || accent
      ? {
          background: palette.background,
          borderColor: palette.border,
          color: palette.color,
        }
      : undefined,
    disabled
      ? {
          opacity: 0.55,
          cursor: "not-allowed",
        }
      : undefined,
  );
}

export function getPanelToneStyle({
  tone = "default",
  accent,
}: {
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
} = {}): CSSProperties {
  const palette = accent ? getAccentPalette(accent) : getTonePalette(tone);

  if (tone === "default" && !accent) {
    return {};
  }

  return {
    borderColor: palette.border,
    background: `linear-gradient(180deg, ${palette.background}, rgba(255, 255, 255, 0.98))`,
  };
}
