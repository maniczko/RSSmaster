import Link from "next/link";
import type { ReactNode, RefObject } from "react";

export type AppShellProps = {
  header: ReactNode;
  navRail?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
};

export function AppShell({
  header,
  navRail,
  sidebar,
  children,
  sidebarOpen = false,
  onSidebarClose,
}: AppShellProps) {
  return (
    <div className={`app-shell ${sidebarOpen ? "app-shell-sidebar-open" : ""} ${navRail ? "app-shell-with-nav-rail" : ""}`}>
      <header className="app-header">{header}</header>
      <div className="app-body">
        {navRail ? <aside className="app-nav-rail">{navRail}</aside> : null}
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
        <aside className="app-sidebar" id="rssmaster-sidebar">
          {sidebar}
        </aside>
        <main className="app-workspace">{children}</main>
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
};

export function AppSidebarLink({
  href,
  label,
  meta,
  active = false,
}: AppSidebarLinkProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`app-sidebar-link ${active ? "app-sidebar-link-active" : ""}`}
      href={href}
    >
      <span>{label}</span>
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
      <span>Szukaj</span>
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
