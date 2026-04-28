import type { FormEvent, ReactNode } from "react";

import {
  DismissIcon,
  LibraryIcon,
  StatusIcon,
} from "@/app/components/ui-icons";

export type LocalAuthMode = "login" | "register";
export type LocalAuthStatus = "loading" | "ready" | "unauthenticated";

export type LocalAuthAccount = {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
};

export type LocalAuthFormState = {
  username: string;
  displayName: string;
  password: string;
};

type AuthScreenProps = {
  busy: boolean;
  form: LocalAuthFormState;
  hasLocalAccounts: boolean;
  message: string | null;
  mode: LocalAuthMode;
  onFormChange: (patch: Partial<LocalAuthFormState>) => void;
  onModeToggle: () => void;
  onSubmit: () => void;
};

type AccountStatusProps = {
  account: LocalAuthAccount | null;
  authRequired: boolean;
  busy: boolean;
  compact?: boolean;
  formatTimestamp: (value: string | null, fallback: string) => string;
  hasLocalAccounts: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

type LocalAuthGateProps = {
  authStatus: LocalAuthStatus;
  children: ReactNode;
  screen: AuthScreenProps;
};

export function AuthScreen({
  busy,
  form,
  hasLocalAccounts,
  message,
  mode,
  onFormChange,
  onModeToggle,
  onSubmit,
}: AuthScreenProps) {
  const resolvedMode = hasLocalAccounts ? mode : "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="section-screen" style={{ padding: "min(9vh, 4rem) 1.25rem" }}>
      <div className="section-grid section-grid-two" style={{ alignItems: "start", maxWidth: "1120px", margin: "0 auto" }}>
        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge panel-badge-with-icon">
                <LibraryIcon className="app-icon app-icon-xs" />
                Konta lokalne
              </span>
              <h2>{hasLocalAccounts ? "Zaloguj się do swojej biblioteki" : "Utwórz pierwsze konto RSSmaster"}</h2>
            </div>
            <span>{hasLocalAccounts ? "wymagane logowanie" : "przejęcie bieżącej biblioteki"}</span>
          </div>

          <p style={{ margin: "0 0 1rem", color: "var(--muted-text)" }}>
            {hasLocalAccounts
              ? "Twoje feedy, zapisane artykuły i ustawienia są przypisane do lokalnego konta."
              : "Pierwsze konto przejmie bieżącą bibliotekę z tego komputera i skopiuje ją do osobnej bazy operatora."}
          </p>
          {hasLocalAccounts ? (
            <p style={{ margin: "0 0 1rem", color: "var(--muted-text)" }}>
              Kolejne konta mają osobną bazę danych, więc aby odzyskać zapisy, zaloguj się do istniejącego konta.
            </p>
          ) : null}

          <form className="channel-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Nazwa konta</span>
              <input
                autoComplete="username"
                name="username"
                onChange={(event) => onFormChange({ username: event.target.value })}
                placeholder="mateusz"
                value={form.username}
              />
            </label>
            {resolvedMode === "register" ? (
              <label className="field">
                <span>Nazwa wyświetlana</span>
                <input
                  autoComplete="nickname"
                  name="displayName"
                  onChange={(event) => onFormChange({ displayName: event.target.value })}
                  placeholder="Mateusz"
                  value={form.displayName}
                />
              </label>
            ) : null}
            <label className="field">
              <span>Hasło</span>
              <input
                autoComplete={resolvedMode === "register" ? "new-password" : "current-password"}
                name="password"
                onChange={(event) => onFormChange({ password: event.target.value })}
                type="password"
                value={form.password}
              />
            </label>

            <div className="channel-actions">
              <button className="secondary-button" disabled={busy} type="submit">
                <span className="button-with-icon">
                  <LibraryIcon className="app-icon button-inline-icon" />
                  {busy
                    ? resolvedMode === "register"
                      ? "Tworzenie konta..."
                      : "Logowanie..."
                    : resolvedMode === "register"
                      ? "Utwórz konto i otwórz bibliotekę"
                      : "Zaloguj"}
                </span>
              </button>
              {hasLocalAccounts ? (
                <button className="mini-button" disabled={busy} onClick={onModeToggle} type="button">
                  {resolvedMode === "register" ? "Mam już konto" : "Nowe konto"}
                </button>
              ) : null}
            </div>
          </form>

          {message ? (
            <div className="ops-row" role="status">
              <strong>Sesja lokalna</strong>
              <span>{message}</span>
            </div>
          ) : null}
        </section>

        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge panel-badge-with-icon">
                <StatusIcon className="app-icon app-icon-xs" />
                Co stało się z danymi
              </span>
              <h3>Dlaczego biblioteka mogła wyglądać na pustą</h3>
            </div>
          </div>
          <div className="ops-row">
            <strong>Dane nie musiały zniknąć</strong>
            <span>
              RSSmaster wcześniej działał jako jedna lokalna przestrzeń robocza. Po włączeniu kont pierwsze konto przejmuje
              istniejącą bibliotekę, zamiast zaczynać od pustej bazy.
            </span>
            <span>
              Po zalogowaniu zobaczysz swoje zapisane artykuły, feedy i ustawienia w kontekście własnego lokalnego konta.
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}

export function AccountStatus({
  account,
  authRequired,
  busy,
  compact = false,
  formatTimestamp,
  hasLocalAccounts,
  onLogin,
  onLogout,
}: AccountStatusProps) {
  if (compact) {
    return account ? (
      <div className="account-status account-status-compact">
        <span className="runtime-pill runtime-pill-ok">@{account.username}</span>
        <button className="mini-button" disabled={busy} onClick={onLogout} type="button">
          {busy ? "Wylogowywanie..." : "Wyloguj"}
        </button>
      </div>
    ) : (
      <button className="mini-button mini-button-accent" disabled={busy} onClick={onLogin} type="button">
        {hasLocalAccounts || authRequired ? "Zaloguj" : "Utwórz konto"}
      </button>
    );
  }

  return (
    <div className="ops-row">
      {account ? (
        <>
          <div className="ops-row-top">
            <strong>{account.display_name}</strong>
            <span>@{account.username}</span>
          </div>
          <span>Utworzone: {formatTimestamp(account.created_at, "brak daty")}</span>
          <span>Ostatnie logowanie: {formatTimestamp(account.last_login_at, "jeszcze brak logowania")}</span>
          <span>Pierwsze konto przejmuje bieżącą bibliotekę z tego komputera. Kolejne konta mają osobne bazy.</span>
          <div className="channel-actions">
            <button className="secondary-button" disabled={busy} onClick={onLogout} type="button">
              <span className="button-with-icon">
                <DismissIcon className="app-icon button-inline-icon" />
                {busy ? "Wylogowywanie..." : "Wyloguj"}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <strong>Brak aktywnej sesji</strong>
          <span>
            {hasLocalAccounts
              ? "Zaloguj się, aby otworzyć swoją bibliotekę i odzyskać zapisane feedy oraz artykuły."
              : "Utwórz pierwsze konto, aby przypisać tę bibliotekę do operatora tego komputera."}
          </span>
          <div className="channel-actions">
            <button className="secondary-button" disabled={busy} onClick={onLogin} type="button">
              <span className="button-with-icon">
                <LibraryIcon className="app-icon button-inline-icon" />
                {hasLocalAccounts ? "Zaloguj się" : "Utwórz pierwsze konto"}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function LocalAuthGate({
  authStatus,
  children,
  screen,
}: LocalAuthGateProps) {
  if (authStatus === "loading") {
    return (
      <section className="workspace-redirect-shell">
        <span className="panel-badge panel-badge-with-icon">
          <LibraryIcon className="app-icon app-icon-xs" />
          rssmaster
        </span>
        <h2>Sprawdzam lokalną sesję</h2>
        <p>Otwieram odpowiednią bazę biblioteki i przygotowuję shell czytnika.</p>
      </section>
    );
  }

  if (authStatus === "unauthenticated") {
    return <AuthScreen {...screen} />;
  }

  return <>{children}</>;
}
