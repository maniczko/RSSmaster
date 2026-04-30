import { getDigestStatusLabel } from "@/app/lib/digest-selection";

export type DigestHistoryListItem = {
  id: string;
  status: string;
  title: string;
  article_count: number;
  generated_at: string | null;
  error_message: string | null;
  artifact: {
    path: string | null;
  };
};

type DigestHistoryListProps = {
  emptyMessage?: string | null;
  formatTimestamp: (value: string | null | undefined, fallback: string) => string;
  items: DigestHistoryListItem[];
};

export function DigestHistoryList({ emptyMessage = null, formatTimestamp, items }: DigestHistoryListProps) {
  if (items.length === 0) {
    return emptyMessage ? <p className="empty-state">{emptyMessage}</p> : null;
  }

  return (
    <ul className="ops-list">
      {items.map((digest) => (
        <li className="ops-row" key={digest.id}>
          <div className="ops-row-top">
            <strong>{digest.title}</strong>
            <span>{getDigestStatusLabel(digest.status)}</span>
          </div>
          <span>{digest.article_count} artykul(y)</span>
          <span>{formatTimestamp(digest.generated_at, "Jeszcze nie wygenerowano")}</span>
          <span>{digest.artifact.path ? `Artefakt: ${digest.artifact.path}` : "Artefakt oczekuje"}</span>
          {digest.error_message ? <span>{digest.error_message}</span> : null}
        </li>
      ))}
    </ul>
  );
}
