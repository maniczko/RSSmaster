import type { DigestCandidatePreviewStatus, DigestQueueCopy } from "@/app/lib/digest-selection";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";

export type DigestCandidateSummaryPreview = {
  title: string;
  selection_mode: string;
  stats: {
    article_count: number;
    word_count: number;
    estimated_read_minutes: number;
    digest_candidate_count: number;
    favorite_count: number;
  };
  category_summary: Array<{
    category: string;
    article_count: number;
  }>;
};

type DigestCandidateSummaryProps = {
  message: string | null;
  onBackToReader: () => void;
  onShowDigestQueue: () => void;
  preview: DigestCandidateSummaryPreview | null;
  queueCopy: DigestQueueCopy;
  showActions: boolean;
  status: DigestCandidatePreviewStatus;
};

export function DigestCandidateSummary({
  message,
  onBackToReader,
  onShowDigestQueue,
  preview,
  queueCopy,
  showActions,
  status,
}: DigestCandidateSummaryProps) {
  return (
    <div className="ops-row">
      <div className="ops-row-top">
        <strong>{preview ? preview.title : queueCopy.heading}</strong>
        <Badge variant="secondary">{preview ? preview.selection_mode : status}</Badge>
      </div>
      {preview ? (
        <>
          <span>
            {preview.stats.article_count} artykul(y), {preview.stats.word_count} slow, {preview.stats.estimated_read_minutes} min
          </span>
          <span>
            {preview.stats.digest_candidate_count} kandydatow digestu, {preview.stats.favorite_count} zapisanych
          </span>
          <span>{preview.category_summary.map((group) => `${group.category}: ${group.article_count}`).join(" | ")}</span>
          <span>{queueCopy.heading}</span>
        </>
      ) : null}
      <span>{queueCopy.body}</span>
      {message ? <span>{message}</span> : null}
      {showActions ? (
        <div className="channel-actions">
          <Button className="secondary-button" onClick={onShowDigestQueue} type="button" variant="outline">
            Pokaż kolejkę digestu
          </Button>
          <Button className="secondary-button" onClick={onBackToReader} type="button" variant="outline">
            Wróć do czytnika
          </Button>
        </div>
      ) : null}
    </div>
  );
}
