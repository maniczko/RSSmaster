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
  return (
    <div className="library-views-nav">
      {items.map((item) => (
        <button
          className={`library-view-button ${item.active ? "library-view-button-active" : ""} ${item.highlighted ? "library-view-button-highlighted" : ""}`}
          key={item.id}
          onClick={item.onSelect}
          type="button"
        >
          <div>
            <strong>{item.label}</strong>
            {item.hint ? <span>{item.hint}</span> : null}
          </div>
          <b>{item.meta}</b>
        </button>
      ))}
    </div>
  );
}
