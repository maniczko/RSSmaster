import type { StoryClusterModel as EditorialStoryClusterModel } from "@/app/lib/editorial-support";

type WorkspaceStoryCard = {
  id: string;
  title: string;
  channel_title: string;
  published_at: string | null;
  excerpt: string | null;
  source_url: string;
  is_favorite: boolean;
  is_read: boolean;
};

type WorkspaceStoryCluster = {
  id: string;
  headline: string;
  item_count: number;
  category: string | null;
  primary: WorkspaceStoryCard;
  alternates: WorkspaceStoryCard[];
};

export function dedupeStoryClusterStories(stories: readonly WorkspaceStoryCard[]): WorkspaceStoryCard[] {
  const seenIds = new Set<string>();
  const uniqueStories: WorkspaceStoryCard[] = [];
  for (const story of stories) {
    const storyId = story.id.trim();
    if (!storyId || seenIds.has(storyId)) {
      continue;
    }
    seenIds.add(storyId);
    uniqueStories.push(story);
  }
  return uniqueStories;
}

export function mapStoryClusterCard(cluster: WorkspaceStoryCluster): EditorialStoryClusterModel {
  const stories = dedupeStoryClusterStories([cluster.primary, ...cluster.alternates]);
  const unreadCount = stories.filter((story) => !story.is_read).length;
  const savedCount = stories.filter((story) => story.is_favorite).length;
  return {
    id: cluster.id,
    title: cluster.headline,
    summary:
      stories.length > 1
        ? `${stories.length} powiazane publikacje o tym samym temacie.`
        : "Historia z jednego zrodla.",
    labels: cluster.category ? [cluster.category] : [],
    sourceCount: new Set(stories.map((story) => story.channel_title)).size,
    storyCount: stories.length,
    savedCount,
    unreadCount,
    updatedAt: stories[0]?.published_at ?? cluster.primary.published_at,
    leadSource: stories[0]?.channel_title ?? cluster.primary.channel_title,
    momentum: stories.length >= 4 ? "peaking" : stories.length >= 2 ? "steady" : "emerging",
    stories: stories.map((story) => ({
      id: story.id,
      title: story.title,
      source: story.channel_title,
      publishedAt: story.published_at,
      summary: story.excerpt ?? undefined,
      url: story.source_url,
      state: story.is_favorite ? "saved" : story.is_read ? "seen" : "unread",
    })),
  };
}
