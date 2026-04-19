import { describe, expect, it } from "vitest";
import { dedupeStoryClusterStories, mapStoryClusterCard } from "@/app/lib/story-clusters";

describe("story cluster helpers", () => {
  it("dedupes repeated story ids while preserving order", () => {
    const stories = dedupeStoryClusterStories([
      {
        id: "itm_1",
        title: "Lead",
        channel_title: "Source A",
        published_at: "2026-04-19T08:00:00+00:00",
        excerpt: "Lead summary",
        source_url: "https://example.com/lead",
        is_favorite: false,
        is_read: false,
      },
      {
        id: "itm_1",
        title: "Lead duplicate",
        channel_title: "Source A",
        published_at: "2026-04-19T08:00:00+00:00",
        excerpt: "Duplicate summary",
        source_url: "https://example.com/lead-duplicate",
        is_favorite: false,
        is_read: false,
      },
      {
        id: "itm_2",
        title: "Alternate",
        channel_title: "Source B",
        published_at: "2026-04-19T09:00:00+00:00",
        excerpt: "Alternate summary",
        source_url: "https://example.com/alternate",
        is_favorite: true,
        is_read: false,
      },
    ]);

    expect(stories.map((story) => story.id)).toEqual(["itm_1", "itm_2"]);
  });

  it("maps cluster cards with unique story ids only", () => {
    const cluster = mapStoryClusterCard({
      id: "stc_1",
      headline: "Rynek walut",
      item_count: 3,
      category: "finanse",
      primary: {
        id: "itm_1",
        title: "Lead",
        channel_title: "Money",
        published_at: "2026-04-19T08:00:00+00:00",
        excerpt: "Lead summary",
        source_url: "https://example.com/lead",
        is_favorite: false,
        is_read: false,
      },
      alternates: [
        {
          id: "itm_1",
          title: "Lead duplicate",
          channel_title: "Money",
          published_at: "2026-04-19T08:10:00+00:00",
          excerpt: "Duplicate summary",
          source_url: "https://example.com/lead-duplicate",
          is_favorite: false,
          is_read: true,
        },
        {
          id: "itm_2",
          title: "Alternate",
          channel_title: "Reuters",
          published_at: "2026-04-19T09:00:00+00:00",
          excerpt: "Alternate summary",
          source_url: "https://example.com/alternate",
          is_favorite: true,
          is_read: false,
        },
      ],
    });

    expect(cluster.storyCount).toBe(2);
    expect(cluster.sourceCount).toBe(2);
    expect(cluster.savedCount).toBe(1);
    expect(cluster.unreadCount).toBe(2);
    expect(cluster.stories.map((story) => story.id)).toEqual(["itm_1", "itm_2"]);
  });
});
