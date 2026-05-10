import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { DismissIcon, SearchIcon } from "@/app/components/ui-icons";
import { WorkspaceButton } from "@/app/components/workspace-primitives";

export type AppShellProps = {
  header: ReactNode;
  navRail?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
};

export function AppShell({
  header,
  navRail,
  sidebar,
  children,
  className,
  sidebarOpen = false,
  onSidebarClose,
}: AppShellProps) {
  const shellClassName = [
    "app-shell",
    sidebarOpen ? "app-shell-sidebar-open" : "",
    navRail ? "app-shell-with-nav-rail" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <a className="skip-link" href="#rssmaster-main">
        Przejdź do treści
      </a>
      <header className="app-header">{header}</header>
      <div className="app-body">
        {navRail ? <aside aria-label="Główne sekcje produktu" className="app-nav-rail">{navRail}</aside> : null}
        {onSidebarClose ? (
          <button
            aria-hidden={!sidebarOpen}
            aria-label="Zamknij menu"
            className="app-sidebar-backdrop"
            onClick={onSidebarClose}
            tabIndex={sidebarOpen ? 0 : -1}
            type="button"
          />
        ) : null}
        <aside aria-label="Menu boczne i feedy" className="app-sidebar" id="rssmaster-sidebar">
          {onSidebarClose ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
              <WorkspaceButton
                aria-label="Zamknij menu"
                onClick={onSidebarClose}
                style={{ borderRadius: 999, padding: "0.36rem 0.7rem" }}
                tone="muted"
              >
                <span className="button-with-icon">
                  <DismissIcon className="app-icon button-inline-icon" />
                  Zamknij
                </span>
              </WorkspaceButton>
            </div>
          ) : null}
          {sidebar}
        </aside>
        <main aria-label="Główna zawartość RSSmastera" className="app-workspace" id="rssmaster-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export type AppSidebarSectionProps = {
  title?: ReactNode;
  children: ReactNode;
};

export function AppSidebarSection({ title, children }: AppSidebarSectionProps) {
  return (
    <section className="app-sidebar-section">
      {title ? <div className="app-sidebar-section-title">{title}</div> : null}
      {children}
    </section>
  );
}

export type AppSidebarLinkProps = {
  href: string;
  label: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  icon?: ReactNode;
};

export function AppSidebarLink({
  href,
  label,
  meta,
  active = false,
  icon,
}: AppSidebarLinkProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`app-sidebar-link ${active ? "app-sidebar-link-active" : ""}`}
      href={href}
    >
      <span className="app-sidebar-link-main">
        {icon ? <span className="app-sidebar-link-icon">{icon}</span> : null}
        <span>{label}</span>
      </span>
      {meta ? <strong>{meta}</strong> : null}
    </Link>
  );
}

export type AppHeaderSearchProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function AppHeaderSearch({
  value,
  placeholder,
  onChange,
  inputRef,
}: AppHeaderSearchProps) {
  return (
    <label className="app-header-search">
      <span className="app-header-search-meta">
        <SearchIcon className="app-icon app-icon-sm" />
        <span>Szukaj</span>
      </span>
      <input
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
      />
    </label>
  );
}
