import type { ReactNode } from "react";

import type { DigestCandidatePreviewStatus, DigestQueueCopy } from "@/app/lib/digest-selection";

import type { DigestCandidateSummaryPreview } from "./digest-candidate-summary";
import { DigestBuildPanel } from "./digest-build-panel";
import { DigestHistoryList, type DigestHistoryListItem } from "./digest-history-list";
import { DeliveryIcon, DigestIcon, StatusIcon } from "./ui-icons";

type DigestSectionCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

type DigestDeliverySettings = {
  smtp_ready: boolean;
} | null;

type DigestDeliveryPreflight = {
  status: string;
  recipient: string | null;
  artifact: {
    title: string;
    artifact_exists: boolean;
    artifact_bytes: number | null;
  };
  checks: Array<{
    name: string;
    status: string;
  }>;
} | null;

export type DigestDeliveryLogItem = {
  id: string;
  target_kind: string;
  recipient: string | null;
  status: string;
  sent_at: string | null;
  digest_title: string | null;
  error_message: string | null;
};

type DigestSectionProps = {
  buildDisabled: boolean;
  busy: boolean;
  copy: DigestSectionCopy;
  countLabel: string;
  deliveryBusy: boolean;
  deliveryLogs: DigestDeliveryLogItem[];
  deliveryPreflight: DigestDeliveryPreflight;
  deliverySettings: DigestDeliverySettings;
  feedbackCard: ReactNode;
  formatDeliveryStatus: (status: string) => string;
  formatTimestamp: (value: string | null | undefined, fallback: string) => string;
  hasLatestDigest: boolean;
  history: DigestHistoryListItem[];
  message: string | null;
  onBackToReader: () => void;
  onBuild: () => void;
  onDeliveryPreflight: () => void;
  onPreview: () => void;
  onSendDigestDryRun: () => void;
  onSendDigestLive: () => void;
  onShowDigestQueue: () => void;
  preview: DigestCandidateSummaryPreview | null;
  previewDisabled: boolean;
  queueCopy: DigestQueueCopy;
  showSummaryActions: boolean;
  status: DigestCandidatePreviewStatus;
};

export function DigestSection({
  buildDisabled,
  busy,
  copy,
  countLabel,
  deliveryBusy,
  deliveryLogs,
  deliveryPreflight,
  deliverySettings,
  feedbackCard,
  formatDeliveryStatus,
  formatTimestamp,
  hasLatestDigest,
  history,
  message,
  onBackToReader,
  onBuild,
  onDeliveryPreflight,
  onPreview,
  onSendDigestDryRun,
  onSendDigestLive,
  onShowDigestQueue,
  preview,
  previewDisabled,
  queueCopy,
  showSummaryActions,
  status,
}: DigestSectionProps) {
  const deliveryActionDisabled = deliveryBusy || !hasLatestDigest;

  return (
    <section className="section-screen">
      <div className="section-screen-header">
        <div>
          <span className="panel-badge panel-badge-with-icon">
            <DigestIcon className="app-icon app-icon-xs" />
            {copy.eyebrow}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </div>

      <div className="section-grid section-grid-two">
        <div className="screen-stack">
          {feedbackCard}
          <DigestBuildPanel
            badgeLabel="Digest"
            buildDisabled={buildDisabled}
            busy={busy}
            countLabel={countLabel}
            message={message}
            onBackToReader={onBackToReader}
            onBuild={onBuild}
            onPreview={onPreview}
            onShowDigestQueue={onShowDigestQueue}
            preview={preview}
            previewDisabled={previewDisabled}
            queueCopy={queueCopy}
            showBadgeIcon
            showButtonIcons
            showSummaryActions={showSummaryActions}
            status={status}
          />

          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <StatusIcon className="app-icon app-icon-xs" />
                  Historia
                </span>
                <h3>Zbudowane wydania</h3>
              </div>
              <span>{history.length}</span>
            </div>
            <DigestHistoryList
              emptyMessage="Jeszcze nie zbudowano zadnego wydania."
              formatTimestamp={formatTimestamp}
              items={history}
            />
          </section>
        </div>

        <div className="screen-stack">
          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <DeliveryIcon className="app-icon app-icon-xs" />
                  Delivery
                </span>
                <h3>Preflight i wysylka</h3>
              </div>
              <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
            </div>
            <div className="channel-actions">
              <button className="secondary-button" disabled={deliveryActionDisabled} onClick={onDeliveryPreflight} type="button">
                <span className="button-with-icon">
                  <DeliveryIcon className="app-icon button-inline-icon" />
                  Preflight Kindle
                </span>
              </button>
              <button className="secondary-button" disabled={deliveryActionDisabled} onClick={onSendDigestDryRun} type="button">
                <span className="button-with-icon">
                  <DeliveryIcon className="app-icon button-inline-icon" />
                  Test na sucho
                </span>
              </button>
              <button className="action-button compact-button" disabled={deliveryActionDisabled} onClick={onSendDigestLive} type="button">
                <span className="button-with-icon">
                  <DeliveryIcon className="app-icon button-inline-icon" />
                  Wyslij na Kindle
                </span>
              </button>
            </div>
            {deliveryPreflight ? (
              <div className="ops-row">
                <div className="ops-row-top">
                  <strong>{deliveryPreflight.artifact.title}</strong>
                  <span>{formatDeliveryStatus(deliveryPreflight.status)}</span>
                </div>
                <span>{deliveryPreflight.recipient ? `Odbiorca: ${deliveryPreflight.recipient}` : "Odbiorca nieustalony"}</span>
                <span>
                  {deliveryPreflight.artifact.artifact_exists
                    ? `Rozmiar artefaktu: ${deliveryPreflight.artifact.artifact_bytes}`
                    : "Brak artefaktu"}
                </span>
                <span>{deliveryPreflight.checks.map((check) => `${check.name}:${check.status}`).join(" | ")}</span>
              </div>
            ) : (
              <p className="empty-state">Najpierw zbuduj digest, potem uruchom preflight lub wysylke.</p>
            )}
          </section>

          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <StatusIcon className="app-icon app-icon-xs" />
                  Logi
                </span>
                <h3>Historia delivery</h3>
              </div>
              <span>{deliveryLogs.length}</span>
            </div>
            {deliveryLogs.length > 0 ? (
              <ul className="ops-list">
                {deliveryLogs.map((log) => (
                  <li className="ops-row" key={log.id}>
                    <div className="ops-row-top">
                      <strong>{log.digest_title ?? "Wysylka digestu"}</strong>
                      <span>{formatDeliveryStatus(log.status)}</span>
                    </div>
                    <span>
                      {log.target_kind} {log.recipient ?? "odbiorca oczekuje"}
                    </span>
                    <span>{formatTimestamp(log.sent_at, "Jeszcze nie wyslano")}</span>
                    {log.error_message ? <span>{log.error_message}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">Brak logow delivery dla biezacego wydania.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
