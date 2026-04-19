type FeedBrowserChannel = {
  id: string;
  label: string;
  meta: string | number;
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

function getFeedGlyph(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return "F";
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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
  return (
    <div className="feed-browser">
      <div className="feed-browser-header">
        <div className="feed-browser-header-copy">
          <strong>{title}</strong>
        </div>
        <div className="feed-browser-header-actions">
          <button aria-label="Przeglad feedow" className="feed-browser-header-button" onClick={onManageFeeds} type="button">
            *
          </button>
          <button aria-label="Dodaj feed" className="feed-browser-header-button" onClick={onAddFeed} type="button">
            +
          </button>
          <button aria-label="Ustawienia" className="feed-browser-header-button" onClick={onOpenSettings} type="button">
            ...
          </button>
        </div>
      </div>

      <button
        className={`feed-browser-overview ${overviewActive ? "feed-browser-overview-active" : ""}`}
        onClick={onOverviewSelect}
        type="button"
      >
        <span aria-hidden="true" className="feed-browser-overview-icon">
          N
        </span>
        <div>
          <strong>{overviewLabel}</strong>
        </div>
        <b>{overviewMeta}</b>
      </button>

      <div className="feed-browser-tree">
        {folders.map((folder) => (
          <section className="feed-folder" key={folder.id}>
            <div className={`feed-folder-row ${folder.active ? "feed-folder-row-active" : ""}`}>
              <button
                aria-expanded={folder.expanded}
                aria-label={folder.expanded ? `Zwin ${folder.label}` : `Rozwin ${folder.label}`}
                className="feed-folder-toggle"
                onClick={folder.onToggle}
                type="button"
              >
                {folder.expanded ? "-" : "+"}
              </button>

              <button className="feed-folder-link" onClick={folder.onSelect} type="button">
                <span className="feed-folder-label">
                  <span aria-hidden="true" className="feed-row-icon feed-row-icon-folder">
                    {getFeedGlyph(folder.label)}
                  </span>
                  <span>{folder.label}</span>
                </span>
                <strong>{folder.meta}</strong>
              </button>
            </div>

            {folder.expanded ? (
              <div className="feed-folder-children">
                {folder.channels.map((channel) => (
                  <button
                    className={`feed-channel-link ${channel.active ? "feed-channel-link-active" : ""}`}
                    key={channel.id}
                    onClick={channel.onSelect}
                    type="button"
                  >
                    <span className="feed-row-icon feed-row-icon-channel" aria-hidden="true">
                      {getFeedGlyph(channel.label)}
                    </span>
                    <span className="feed-channel-label">{channel.label}</span>
                    <strong>{channel.meta}</strong>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
