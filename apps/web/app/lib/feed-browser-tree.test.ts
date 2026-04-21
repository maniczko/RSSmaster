import { describe, expect, it } from "vitest";

import {
  ROOT_FEED_FOLDER_LABEL,
  buildFeedBrowserTree,
  getFeedFolderId,
  normalizeFeedFolderSegments,
} from "./feed-browser-tree";

describe("feed browser tree helpers", () => {
  it("normalizes category separators into clean path segments", () => {
    expect(normalizeFeedFolderSegments("Biznes > Rynki/Polska")).toEqual(["Biznes", "Rynki", "Polska"]);
    expect(normalizeFeedFolderSegments("Technologia\\AI")).toEqual(["Technologia", "AI"]);
    expect(normalizeFeedFolderSegments(null)).toEqual([]);
  });

  it("builds nested folders and aggregates unread counts", () => {
    const tree = buildFeedBrowserTree([
      {
        id: "feed-pl",
        label: "Rynek Polska",
        category: "Biznes/Rynki/Polska",
        siteUrl: "https://example.com",
        unreadCount: 4,
      },
      {
        id: "feed-intl",
        label: "Rynek Zagranica",
        category: "Biznes/Rynki/Zagranica",
        siteUrl: "https://example.org",
        unreadCount: 2,
      },
      {
        id: "feed-tech",
        label: "AI Daily",
        category: "Technologia",
        siteUrl: "https://ai.example",
        unreadCount: 3,
      },
      {
        id: "feed-root",
        label: "Bez kategorii",
        category: null,
        siteUrl: null,
        unreadCount: 1,
      },
    ]);

    expect(tree.map((folder) => [folder.id, folder.unreadCount])).toEqual([
      ["Biznes", 6],
      ["Technologia", 3],
      [ROOT_FEED_FOLDER_LABEL, 1],
    ]);

    expect(tree[0]?.children[0]?.id).toBe("Biznes / Rynki");
    expect(tree[0]?.children[0]?.unreadCount).toBe(6);
    expect(tree[0]?.children[0]?.children.map((folder) => folder.id)).toEqual([
      "Biznes / Rynki / Polska",
      "Biznes / Rynki / Zagranica",
    ]);
    expect(tree[0]?.children[0]?.children[0]?.channels[0]?.id).toBe("feed-pl");
    expect(tree[2]?.channels[0]?.id).toBe("feed-root");
  });

  it("builds stable folder ids for filters", () => {
    expect(getFeedFolderId("Biznes/Rynki/Polska")).toBe("Biznes / Rynki / Polska");
    expect(getFeedFolderId("  ")).toBe(ROOT_FEED_FOLDER_LABEL);
  });
});
