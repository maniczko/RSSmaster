import type { ReactNode } from "react";

import type { DigestCandidatePreviewStatus, DigestQueueCopy } from "@/app/lib/digest-selection";

import { DigestCandidateSummary, type DigestCandidateSummaryPreview } from "./digest-candidate-summary";
import { DigestIcon } from "./ui-icons";

type DigestBuildPanelProps = {
  badgeLabel: string;
  buildDisabled: boolean;
  buildLabel?: string;
  busy: boolean;
  countLabel: string;
  message: string | null;
  onBackToReader: () => void;
  onBuild: () => void;
  onPreview: () => void;
  onShowDigestQueue: () => void;
  preview: DigestCandidateSummaryPreview | null;
  previewDisabled: boolean;
  previewLabel?: string;
  queueCopy: DigestQueueCopy;
  showBadgeIcon?: boolean;
  showButtonIcons?: boolean;
  showSummaryActions: boolean;
  status: DigestCandidatePreviewStatus;
  title?: string;
};

function renderDigestButtonLabel(label: ReactNode, showIcon: boolean) {
  if (!showIcon) {
    return label;
  }

  return (
    <span className="button-with-icon">
      <DigestIcon className="app-icon button-inline-icon" />
      {label}
    </span>
  );
}

export function DigestBuildPanel({
  badgeLabel,
  buildDisabled,
  buildLabel = "Zbuduj EPUB",
  busy,
  countLabel,
  message,
  onBackToReader,
  onBuild,
  onPreview,
  onShowDigestQueue,
  preview,
  previewDisabled,
  previewLabel,
  queueCopy,
  showBadgeIcon = false,
  showButtonIcons = false,
  showSummaryActions,
  status,
  title = "Podglad i budowa",
}: DigestBuildPanelProps) {
  const resolvedPreviewLabel = previewLabel ?? (busy ? "Praca..." : "Podejrzyj digest");

  return (
    <section className="ops-section">
      <div className="ops-section-header">
        <div>
          <span className={showBadgeIcon ? "panel-badge panel-badge-with-icon" : "panel-badge"}>
            {showBadgeIcon ? <DigestIcon className="app-icon app-icon-xs" /> : null}
            {badgeLabel}
          </span>
          <h3>{title}</h3>
        </div>
        <span>{countLabel}</span>
      </div>

      <div className="channel-actions">
        <button className="secondary-button" disabled={previewDisabled} onClick={onPreview} type="button">
          {renderDigestButtonLabel(resolvedPreviewLabel, showButtonIcons)}
        </button>
        <button className="action-button compact-button" disabled={buildDisabled} onClick={onBuild} type="button">
          {renderDigestButtonLabel(buildLabel, showButtonIcons)}
        </button>
      </div>

      <DigestCandidateSummary
        message={message}
        onBackToReader={onBackToReader}
        onShowDigestQueue={onShowDigestQueue}
        preview={preview}
        queueCopy={queueCopy}
        showActions={showSummaryActions}
        status={status}
      />
    </section>
  );
}
