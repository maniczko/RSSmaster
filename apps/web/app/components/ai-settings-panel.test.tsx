import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AISettingsPanel } from "@/app/components/ai-settings-panel";

function renderPanel(overrides: Partial<Parameters<typeof AISettingsPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <AISettingsPanel
      busy={false}
      draft={{
        enabled: true,
        chat_model: "gpt-5.2",
        embedding_model: "text-embedding-3-small",
        openai_api_key: "",
        clear_openai_api_key: false,
      }}
      message={null}
      onDraftChange={() => {}}
      onPreflight={() => {}}
      onSave={() => {}}
      preflight={null}
      preflightBusy={false}
      settings={null}
      {...overrides}
    />,
  );
}

describe("AISettingsPanel", () => {
  it("renders OpenAI configuration fields and actions", () => {
    const markup = renderPanel({ showButtonIcons: true });

    expect(markup).toContain("Tryb AI");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Model tekstowy");
    expect(markup).toContain("gpt-5.2");
    expect(markup).toContain("Model embeddingów");
    expect(markup).toContain("text-embedding-3-small");
    expect(markup).toContain("Zapisz ustawienia AI");
    expect(markup).toContain("Sprawdź konfigurację");
    expect(markup).toContain("button-with-icon");
    expect(markup).toContain('data-slot="button"');
  });

  it("shows redacted key state, issues, and preflight checks", () => {
    const markup = renderPanel({
      message: "Ustawienia AI zapisane.",
      preflight: {
        status: "connection_failed",
        can_use_ai: false,
        checks: [
          {
            name: "chat_model_access",
            status: "failed",
            message: "OpenAI odrzuciło autoryzację.",
          },
        ],
      },
      settings: {
        enabled: true,
        provider: "openai",
        chat_model: "gpt-5.2",
        embedding_model: "text-embedding-3-small",
        openai_api_key: { configured: true, redacted_value: "********" },
        ready: false,
        updated_at: "2026-05-05T12:00:00Z",
        updated_by: "tester",
        issues: ["Brakuje dostępu do modelu."],
      },
    });

    expect(markup).toContain("Aktualna konfiguracja AI");
    expect(markup).toContain("wymaga konfiguracji");
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("Klucz API zapisany");
    expect(markup).toContain("Brakuje dostępu do modelu.");
    expect(markup).toContain("Preflight AI");
    expect(markup).toContain("chat_model_access");
    expect(markup).toContain("Ustawienia AI zapisane.");
  });

  it("keeps busy controls disabled", () => {
    const markup = renderPanel({ busy: true, preflightBusy: true });

    expect(markup.match(/disabled=""/g)?.length).toBe(3);
    expect(markup).toContain("Zapisywanie...");
    expect(markup).toContain("Sprawdzanie...");
  });
});
