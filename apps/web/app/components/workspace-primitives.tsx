import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";
import {
  getButtonStyle,
  getChipStyle,
  getPanelToneStyle,
  mergeStyles,
  workspaceStyles,
} from "@/app/lib/workspace-ui";
import type {
  WorkspaceAccent,
  WorkspaceTone,
} from "@/app/lib/workspace-ui";

export type WorkspacePanelProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export function WorkspacePanel({
  eyebrow,
  title,
  description,
  actions,
  footer,
  tone = "default",
  accent,
  className,
  style,
  children,
}: WorkspacePanelProps) {
  return (
    <section
      className={className}
      style={mergeStyles(
        workspaceStyles.panel,
        getPanelToneStyle({ tone, accent }),
        style,
      )}
    >
      {eyebrow || title || description || actions ? (
        <header style={workspaceStyles.headerRow}>
          <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            {eyebrow ? (
              <span
                style={mergeStyles(
                  workspaceStyles.eyebrow,
                  accent ? getChipStyle({ accent, active: true }) : undefined,
                )}
              >
                {eyebrow}
              </span>
            ) : null}
            {title ? <h3 style={workspaceStyles.title}>{title}</h3> : null}
            {description ? <p style={workspaceStyles.bodyText}>{description}</p> : null}
          </div>

          {actions ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.55rem",
                justifyContent: "flex-end",
              }}
            >
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}

      {children}

      {footer ? <footer style={workspaceStyles.dividerTop}>{footer}</footer> : null}
    </section>
  );
}

export type WorkspaceChipProps = {
  children: ReactNode;
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function WorkspaceChip({
  children,
  tone = "muted",
  accent,
  active = false,
  className,
  style,
  title,
}: WorkspaceChipProps) {
  return (
    <span
      className={className}
      style={mergeStyles(getChipStyle({ tone, accent, active }), style)}
      title={title}
    >
      {children}
    </span>
  );
}

export type WorkspaceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: WorkspaceTone;
  accent?: WorkspaceAccent;
  active?: boolean;
};

export function WorkspaceButton({
  tone = "default",
  accent,
  active = false,
  style,
  type = "button",
  ...props
}: WorkspaceButtonProps) {
  return (
    <button
      {...props}
      style={mergeStyles(
        getButtonStyle({
          tone,
          accent,
          active,
          disabled: props.disabled,
        }),
        style,
      )}
      type={type}
    />
  );
}

export type WorkspaceMetricListProps = {
  items: readonly {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
  }[];
  columns?: number;
  className?: string;
  style?: CSSProperties;
};

export function WorkspaceMetricList({
  items,
  columns = 3,
  className,
  style,
}: WorkspaceMetricListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={mergeStyles(
        {
          display: "grid",
          gap: "0.65rem",
          gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
        },
        style,
      )}
    >
      {items.map((item) => (
        <div key={item.label} style={workspaceStyles.metricCard}>
          <span style={workspaceStyles.caption}>{item.label}</span>
          <strong style={workspaceStyles.title}>{item.value}</strong>
          {item.detail ? <span style={workspaceStyles.caption}>{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

export type WorkspaceEmptyStateProps = {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function WorkspaceEmptyState({
  title,
  description,
  action,
  className,
  style,
}: WorkspaceEmptyStateProps) {
  return (
    <div
      className={className}
      style={mergeStyles(
        workspaceStyles.panelMuted,
        {
          display: "grid",
          gap: "0.55rem",
          alignContent: "start",
          padding: "1.1rem 1.15rem",
        },
        style,
      )}
    >
      <strong style={workspaceStyles.title}>{title}</strong>
      <p style={workspaceStyles.bodyText}>{description}</p>
      {action ? <div style={{ marginTop: "0.85rem" }}>{action}</div> : null}
    </div>
  );
}
