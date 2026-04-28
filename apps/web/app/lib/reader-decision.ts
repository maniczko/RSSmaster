export type ReaderDecisionAction = "read_next" | "save_next" | "digest_next" | "archive_next";

export type ReaderDecisionPatch = {
  is_read?: boolean;
  digest_candidate?: boolean;
  library_action?: "save" | "archive";
};

export type ReaderDecisionQueueItem = {
  id: string;
};

export const readerDecisionActions: ReaderDecisionAction[] = [
  "read_next",
  "save_next",
  "digest_next",
  "archive_next",
];

const readerDecisionActionLabels: Record<ReaderDecisionAction, string> = {
  read_next: "Przeczytaj i dalej",
  save_next: "Zapisz i dalej",
  digest_next: "Do digestu i dalej",
  archive_next: "Archiwizuj i dalej",
};

const readerDecisionButtonLabels: Record<ReaderDecisionAction, string> = {
  read_next: "Przeczytaj + dalej",
  save_next: "Zapisz + dalej",
  digest_next: "Digest + dalej",
  archive_next: "Archiwizuj + dalej",
};

export function getReaderDecisionActionLabel(action: ReaderDecisionAction) {
  return readerDecisionActionLabels[action];
}

export function getReaderDecisionButtonLabel(action: ReaderDecisionAction) {
  return readerDecisionButtonLabels[action];
}

export function getReaderDecisionNextLine(nextItemTitle: string | null | undefined) {
  return nextItemTitle ? `Dalej: ${nextItemTitle}` : "To ostatni artykul w biezacej kolejce.";
}

export function buildReaderDecisionPatch(action: ReaderDecisionAction): ReaderDecisionPatch {
  if (action === "read_next") {
    return { is_read: true };
  }
  if (action === "save_next") {
    return { library_action: "save" };
  }
  if (action === "archive_next") {
    return { library_action: "archive" };
  }
  return { digest_candidate: true };
}

export function getReaderDecisionResultLine(hasAdvanced: boolean) {
  return hasAdvanced
    ? "Biezacy artykul zostal zaktualizowany, a fokus przesunal sie dalej w kolejce."
    : "Biezacy artykul zostal zaktualizowany. W tym wycinku kolejki nie ma kolejnego artykulu.";
}

export function resolveReaderDecisionNextItemId<TItem extends ReaderDecisionQueueItem>(
  queueItems: TItem[],
  currentItemId: string,
) {
  if (queueItems.length === 0) {
    return null;
  }

  const currentIndex = queueItems.findIndex((candidate) => candidate.id === currentItemId);
  const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = Math.min(resolvedIndex + 1, queueItems.length - 1);
  return queueItems[nextIndex]?.id ?? null;
}

export function didReaderDecisionAdvance(nextItemId: string | null, currentItemId: string) {
  return Boolean(nextItemId && nextItemId !== currentItemId);
}
