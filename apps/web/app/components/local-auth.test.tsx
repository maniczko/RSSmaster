import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountStatus, AuthScreen, LocalAuthGate } from "@/app/components/local-auth";

const account = {
  id: "acct_1",
  username: "iwo",
  display_name: "Iwo",
  created_at: "2026-05-10T08:00:00Z",
  last_login_at: "2026-05-10T09:00:00Z",
};

const emptyForm = {
  username: "",
  displayName: "",
  password: "",
};

function formatTimestamp(value: string | null, fallback: string) {
  return value ?? fallback;
}

describe("local auth components", () => {
  it("renders the auth screen with shared shadcn actions", () => {
    const markup = renderToStaticMarkup(
      <AuthScreen
        busy={false}
        form={emptyForm}
        hasLocalAccounts
        message="Zaloguj się ponownie."
        mode="login"
        onFormChange={() => {}}
        onModeToggle={() => {}}
        onSubmit={() => {}}
        returnToLabel="Czytaj"
      />,
    );

    expect(markup).toContain("Zaloguj się do swojej biblioteki");
    expect(markup).toContain("Po zalogowaniu wrócisz do: Czytaj");
    expect(markup).toContain("Zaloguj");
    expect(markup).toContain("Nowe konto");
    expect(markup).toContain('data-slot="button"');
  });

  it("renders compact account status with badge and logout action", () => {
    const markup = renderToStaticMarkup(
      <AccountStatus
        account={account}
        authRequired
        busy={false}
        compact
        formatTimestamp={formatTimestamp}
        hasLocalAccounts
        onLogin={() => {}}
        onLogout={() => {}}
      />,
    );

    expect(markup).toContain("@iwo");
    expect(markup).toContain("Wyloguj");
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('data-slot="button"');
  });

  it("gates children while auth is loading or unauthenticated", () => {
    const loadingMarkup = renderToStaticMarkup(
      <LocalAuthGate
        authStatus="loading"
        screen={{
          busy: false,
          form: emptyForm,
          hasLocalAccounts: false,
          message: null,
          mode: "register",
          onFormChange: () => {},
          onModeToggle: () => {},
          onSubmit: () => {},
        }}
      >
        <span>Biblioteka</span>
      </LocalAuthGate>,
    );
    const readyMarkup = renderToStaticMarkup(
      <LocalAuthGate
        authStatus="ready"
        screen={{
          busy: false,
          form: emptyForm,
          hasLocalAccounts: false,
          message: null,
          mode: "register",
          onFormChange: () => {},
          onModeToggle: () => {},
          onSubmit: () => {},
        }}
      >
        <span>Biblioteka</span>
      </LocalAuthGate>,
    );

    expect(loadingMarkup).toContain("Sprawdzam lokalną sesję");
    expect(loadingMarkup).not.toContain("Biblioteka");
    expect(readyMarkup).toContain("Biblioteka");
  });
});
