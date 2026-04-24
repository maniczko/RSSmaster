import {
  ChevronRightIcon,
  ArchiveIcon,
  BookmarkIcon,
  DigestIcon,
  LibraryIcon,
  ReaderIcon,
} from "@/app/components/ui-icons";

type LibraryViewItem = {
  id: string;
  label: string;
  meta: string | number;
  hint?: string;
  active?: boolean;
  highlighted?: boolean;
  onSelect: () => void;
};

export function LibraryViewsNav({ items }: { items: LibraryViewItem[] }) {
  function renderViewIcon(id: string) {
    if (id === "inbox") {
      return <LibraryIcon className="app-icon" />;
    }
    if (id === "continue") {
      return <ReaderIcon className="app-icon" />;
    }
    if (id === "saved") {
      return <BookmarkIcon className="app-icon" />;
    }
    if (id === "digest") {
      return <DigestIcon className="app-icon" />;
    }
    if (id === "archive") {
      return <ArchiveIcon className="app-icon" />;
    }
    return <LibraryIcon className="app-icon" />;
  }

  return (
    <div className="library-views-nav">
      {items.map((item) => (
        <button
          className={`library-view-button ${item.active ? "library-view-button-active" : ""} ${item.highlighted ? "library-view-button-highlighted" : ""}`}
          aria-pressed={item.active}
          key={item.id}
          onClick={item.onSelect}
          type="button"
        >
          <div className="library-view-button-copy">
            <span className="library-view-button-icon">{renderViewIcon(item.id)}</span>
            <div>
              <strong>{item.label}</strong>
              {item.hint ? <span>{item.hint}</span> : null}
            </div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <b>{item.meta}</b>
            <ChevronRightIcon className="app-icon app-icon-xs" />
          </span>
        </button>
      ))}
    </div>
  );
}
