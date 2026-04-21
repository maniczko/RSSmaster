export const ROOT_FEED_FOLDER_LABEL = "Bez folderu";

export type FeedBrowserSourceRecord = {
  id: string;
  label: string;
  category: string | null;
  siteUrl: string | null;
  unreadCount: number;
};

export type FeedBrowserTreeChannel = {
  id: string;
  label: string;
  siteUrl: string | null;
  unreadCount: number;
};

export type FeedBrowserTreeFolder = {
  id: string;
  label: string;
  pathLabel: string;
  unreadCount: number;
  channels: FeedBrowserTreeChannel[];
  children: FeedBrowserTreeFolder[];
};

type MutableFeedBrowserTreeFolder = {
  id: string;
  label: string;
  pathLabel: string;
  unreadCount: number;
  channels: FeedBrowserTreeChannel[];
  children: Map<string, MutableFeedBrowserTreeFolder>;
};

function compareByUnreadThenLabel(left: { unreadCount: number; label: string }, right: { unreadCount: number; label: string }) {
  if (right.unreadCount !== left.unreadCount) {
    return right.unreadCount - left.unreadCount;
  }

  return left.label.localeCompare(right.label, "pl");
}

export function normalizeFeedFolderSegments(category: string | null | undefined) {
  const value = category?.trim();
  if (!value) {
    return [];
  }

  return value
    .split(/[\\/›>]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function getFeedFolderId(category: string | null | undefined) {
  const segments = normalizeFeedFolderSegments(category);
  return segments.length > 0 ? segments.join(" / ") : ROOT_FEED_FOLDER_LABEL;
}

function createFolderNode(segments: string[]) {
  const label = segments[segments.length - 1] ?? ROOT_FEED_FOLDER_LABEL;
  const pathLabel = segments.length > 0 ? segments.join(" / ") : ROOT_FEED_FOLDER_LABEL;

  return {
    id: pathLabel,
    label,
    pathLabel,
    unreadCount: 0,
    channels: [],
    children: new Map<string, MutableFeedBrowserTreeFolder>(),
  } satisfies MutableFeedBrowserTreeFolder;
}

function finalizeFolderTree(node: MutableFeedBrowserTreeFolder): FeedBrowserTreeFolder {
  const children = Array.from(node.children.values())
    .sort(compareByUnreadThenLabel)
    .map((child) => finalizeFolderTree(child));

  const channels = [...node.channels].sort(compareByUnreadThenLabel);

  return {
    id: node.id,
    label: node.label,
    pathLabel: node.pathLabel,
    unreadCount: node.unreadCount,
    channels,
    children,
  };
}

export function buildFeedBrowserTree(sources: FeedBrowserSourceRecord[]) {
  const root = new Map<string, MutableFeedBrowserTreeFolder>();

  for (const source of sources) {
    const segments = normalizeFeedFolderSegments(source.category);
    const normalizedSegments = segments.length > 0 ? segments : [ROOT_FEED_FOLDER_LABEL];

    let currentLevel = root;
    let currentNode: MutableFeedBrowserTreeFolder | null = null;

    for (const [index] of normalizedSegments.entries()) {
      const pathSegments = normalizedSegments.slice(0, index + 1);
      const nodeId = pathSegments.join(" / ");
      const existingNode = currentLevel.get(nodeId) ?? createFolderNode(pathSegments);

      existingNode.unreadCount += source.unreadCount;
      currentLevel.set(nodeId, existingNode);
      currentNode = existingNode;
      currentLevel = existingNode.children;
    }

    if (currentNode) {
      currentNode.channels.push({
        id: source.id,
        label: source.label,
        siteUrl: source.siteUrl,
        unreadCount: source.unreadCount,
      });
    }
  }

  return Array.from(root.values())
    .sort(compareByUnreadThenLabel)
    .map((folder) => finalizeFolderTree(folder));
}
