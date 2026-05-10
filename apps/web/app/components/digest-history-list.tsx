import { getDigestStatusLabel } from "@/app/lib/digest-selection";
import { Badge } from "@/app/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/app/components/ui/empty";

import { ArtifactMeta } from "./artifact-meta";

export type DigestHistoryListItem = {
  id: string;
  status: string;
  title: string;
  article_count: number;
  created_at?: string | null;
  generated_at: string | null;
  sent_at?: string | null;
  error_message: string | null;
  artifact: {
    path: string | null;
    sha256?: string | null;
    size_bytes?: number | null;
  };
  category_summary?: Array<{
    category: string;
    article_count: number;
  }>;
  selection_snapshot?: Array<{
    item_id: string;
    position: number;
    channel_id: string | null;
    channel_title: string | null;
    category: string | null;
    title: string;
    author?: string | null;
    source_url: string | null;
    excerpt?: string | null;
    published_at: string | null;
    content_html?: string | null;
    word_count?: number | null;
    content_hash: string | null;
  }>;
};

type DigestHistoryListProps = {
  emptyMessage?: string | null;
  formatTimestamp: (value: string | null | undefined, fallback: string) => string;
  items: DigestHistoryListItem[];
};

export function DigestHistoryList({ emptyMessage = null, formatTimestamp, items }: DigestHistoryListProps) {
  if (items.length === 0) {
    return emptyMessage ? (
      <Empty className="empty-state">
        <EmptyHeader>
          <EmptyTitle>Brak historii digestu</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : null;
  }

  return (
    <ul className="ops-list">
      {items.map((digest) => (
        <li className="ops-row" key={digest.id}>
          <div className="ops-row-top">
            <strong>{digest.title}</strong>
            <Badge variant="secondary">{getDigestStatusLabel(digest.status)}</Badge>
          </div>
          <span>{digest.article_count} artykul(y)</span>
          <span>{formatTimestamp(digest.generated_at, "Jeszcze nie wygenerowano")}</span>
          <ArtifactMeta
            emptyLabel="Artefakt oczekuje"
            label="Artefakt"
            path={digest.artifact.path}
            sizeLabel={digest.artifact.size_bytes ? `${Math.ceil(digest.artifact.size_bytes / 1024)} KB` : null}
          />
          {digest.error_message ? <span>{digest.error_message}</span> : null}
        </li>
      ))}
    </ul>
  );
}
