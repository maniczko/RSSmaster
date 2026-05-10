import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeliverySettingsPanel } from "@/app/components/delivery-settings-panel";

function renderPanel(overrides: Partial<Parameters<typeof DeliverySettingsPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <DeliverySettingsPanel
      deliveryBusy={false}
      draft={{
        kindle_email: "reader@kindle.com",
        smtp_from: "rss@example.com",
        smtp_host: "smtp.example.com",
        smtp_password: "",
        smtp_port: "587",
        smtp_username: "rss@example.com",
      }}
      message={null}
      onDraftChange={() => {}}
      onPreflight={() => {}}
      onSave={() => {}}
      settings={null}
      settingsBusy={false}
      {...overrides}
    />,
  );
}

describe("DeliverySettingsPanel", () => {
  it("renders SMTP and Kindle fields with save and preflight actions", () => {
    const markup = renderPanel({ showButtonIcons: true });

    expect(markup).toContain("SMTP host");
    expect(markup).toContain("smtp.example.com");
    expect(markup).toContain("Kindle email");
    expect(markup).toContain("reader@kindle.com");
    expect(markup).toContain("Zapisz ustawienia");
    expect(markup).toContain("Sprawdz konfiguracje");
    expect(markup).toContain("button-with-icon");
    expect(markup).toContain('data-slot="button"');
  });

  it("shows current delivery configuration and validation messages", () => {
    const markup = renderPanel({
      message: "Ustawienia wysylki zapisane.",
      settings: {
        issues: ["Brak approved sender"],
        kindle_email: "reader@kindle.com",
        smtp_host: "smtp.example.com",
        smtp_password: { configured: true },
        smtp_port: 587,
        smtp_ready: false,
      },
    });

    expect(markup).toContain("Aktualna konfiguracja wysylki");
    expect(markup).toContain("niepelna");
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("smtp.example.com:587");
    expect(markup).toContain("Haslo zapisane");
    expect(markup).toContain("Brak approved sender");
    expect(markup).toContain("Ustawienia wysylki zapisane.");
  });

  it("keeps busy controls disabled", () => {
    const markup = renderPanel({ deliveryBusy: true, settingsBusy: true });

    expect(markup.match(/disabled=""/g)?.length).toBe(2);
    expect(markup).toContain("Zapisywanie...");
  });
});
