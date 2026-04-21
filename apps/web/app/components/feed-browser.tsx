import type { ReactNode } from "react";

import { buildFeedIconUrl, getFeedGlyph } from "@/app/lib/feed-icon";

type FeedBrowserChannel = {
  id: string;
  label: string;
  meta: string | number;
  siteUrl?: string | null;
  active?: boolean;
  onSelect: () => void;
};

type FeedBrowserFolder = {
  id: string;
  label: string;
  meta: string | number;
  active?: boolean;
  expanded?: boolean;
  onSelect: () => void;
  onToggle: () => void;
  children?: FeedBrowserFolder[];
  channels: FeedBrowserChannel[];
};

type FeedBrowserProps = {
  title: string;
  overviewLabel: string;
  overviewMeta: string | number;
  overviewActive?: boolean;
  onOverviewSelect: () => void;
  onManageFeeds?: () => void;
  onAddFeed?: () => void;
  onOpenSettings?: () => void;
  folders: FeedBrowserFolder[];
};

function BrowserActionIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg aria-hidden="true" className="feed-browser-header-button-icon" viewBox="0 0 20 20">
      {children}
    </svg>
  );
}

function FeedMark({
  label,
  siteUrl,
}: {
  label: string;
  siteUrl?: string | null;
}) {
  const iconUrl = buildFeedIconUrl(siteUrl);

  return (
    <span aria-hidden="true" className="feed-row-icon feed-row-icon-channel">
      {iconUrl ? (
        <img
          alt=""
          className="feed-row-icon-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={iconUrl}
        />
      ) : null}
      <span className="feed-row-icon-fallback">{getFeedGlyph(label)}</span>
    </span>
  );
}

export function FeedBrowser({
  title,
  overviewLabel,
  overviewMeta,
  overviewActive = false,
  onOverviewSelect,
  onManageFeeds,
  onAddFeed,
  onOpenSettings,
  folders,
}: FeedBrowserProps) {
  function renderFolder(folder: FeedBrowserFolder, depth = 0) {
    return (
      <section className="feed-folder" key={folder.id}>
        <div className={`feed-folder-row ${folder.active ? "feed-folder-row-active" : ""}`}>
          <button
            aria-expanded={folder.expanded}
            aria-label={folder.expanded ? `Zwin ${folder.label}` : `Rozwin ${folder.label}`}
            className="feed-folder-toggle"
            onClick={folder.onToggle}
            type="button"
          >
            <svg aria-hidden="true" className={`feed-folder-toggle-icon ${folder.expanded ? "feed-folder-toggle-icon-open" : ""}`} viewBox="0 0 20 20">
              <path d="m7 5.75 5.25 4.25L7 14.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </button>

          <button className="feed-folder-link" onClick={folder.onSelect} type="button">
            <span className="feed-folder-label">
              <span aria-hidden="true" className="feed-row-icon feed-row-icon-folder">
                <svg viewBox="0 0 20 20">
                  <path
                    d="M3.75 6.5A1.75 1.75 0 0 1 5.5 4.75h3.1l1.1 1.25h4.8a1.75 1.75 0 0 1 1.75 1.75v6.75a1.75 1.75 0 0 1-1.75 1.75H5.5a1.75 1.75 0 0 1-1.75-1.75z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="1.35"
                  />
                </svg>
              </span>
              <span>{folder.label}</span>
            </span>
            <strong>{folder.meta}</strong>
          </button>
        </div>

        {folder.expanded ? (
          <div className="feed-folder-children" style={{ paddingLeft: `${depth * 0.95 + 1.95}rem` }}>
            {folder.children?.map((child) => renderFolder(child, depth + 1))}
            {folder.channels.map((channel) => (
              <button
                className={`feed-channel-link ${channel.active ? "feed-channel-link-active" : ""}`}
                key={channel.id}
                onClick={channel.onSelect}
                type="button"
              >
                <FeedMark label={channel.label} siteUrl={channel.siteUrl} />
                <span className="feed-channel-label">{channel.label}</span>
                <strong>{channel.meta}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="feed-browser">
      <div className="feed-browser-header">
        <div className="feed-browser-header-copy">
          <strong>{title}</strong>
        </div>
        <div className="feed-browser-header-actions">
          <button aria-label="Pokaz wszystkie feedy" className="feed-browser-header-button" onClick={onManageFeeds} type="button">
            <BrowserActionIcon>
              <path
                d="M4 5.25A1.25 1.25 0 0 1 5.25 4h9.5A1.25 1.25 0 0 1 16 5.25v9.5A1.25 1.25 0 0 1 14.75 16h-9.5A1.25 1.25 0 0 1 4 14.75z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M7 7h6M7 10h6M7 13h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
            </BrowserActionIcon>
          </button>
          <button aria-label="Dodaj feed" className="feed-browser-header-button" onClick={onAddFeed} type="button">
            <BrowserActionIcon>
              <path d="M10 5.5v9M5.5 10h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </BrowserActionIcon>
          </button>
          <button aria-label="Ustawienia" className="feed-browser-header-button" onClick={onOpenSettings} type="button">
            <BrowserActionIcon>
              <path
                d="M10 4.75 11.1 6.5l1.98.3-.7 1.88 1.38 1.45-1.66 1.1.12 2.02-1.92-.44L8.54 15.5l-1.02-1.74-1.98-.31.7-1.87-1.38-1.46 1.66-1.1-.12-2.01 1.92.43z"
                fill="none"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.2"
              />
              <circle cx="10" cy="10" fill="none" r="1.75" stroke="currentColor" strokeWidth="1.3" />
            </BrowserActionIcon>
          </button>
        </div>
      </div>

      <button
        className={`feed-browser-overview ${overviewActive ? "feed-browser-overview-active" : ""}`}
        onClick={onOverviewSelect}
        type="button"
      >
        <span aria-hidden="true" className="feed-browser-overview-icon">
          <svg viewBox="0 0 20 20">
            <path d="M5.25 6.25h9.5M5.25 10h9.5M5.25 13.75h6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
        </span>
        <div>
          <strong>{overviewLabel}</strong>
        </div>
        <b>{overviewMeta}</b>
      </button>

      <div className="feed-browser-tree">
        {folders.map((folder) => renderFolder(folder))}
      </div>
    </div>
  );
}
