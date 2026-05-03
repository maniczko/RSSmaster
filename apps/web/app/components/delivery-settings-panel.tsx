import { DeliveryIcon, SettingsIcon } from "./ui-icons";

export type DeliverySettingsDraft = {
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
  kindle_email: string;
};

export type DeliverySettingsSnapshot = {
  smtp_host: string | null;
  smtp_port: number;
  smtp_password: {
    configured: boolean;
  };
  kindle_email: string | null;
  issues: string[];
  smtp_ready: boolean;
};

type DeliverySettingsPanelProps = {
  deliveryBusy: boolean;
  draft: DeliverySettingsDraft;
  message: string | null;
  onDraftChange: (field: keyof DeliverySettingsDraft, value: string) => void;
  onPreflight: () => void;
  onSave: () => void;
  settings: DeliverySettingsSnapshot | null;
  settingsBusy: boolean;
  showButtonIcons?: boolean;
};

function renderButtonLabel(label: string, icon: "settings" | "delivery", showIcon: boolean) {
  if (!showIcon) {
    return label;
  }

  const Icon = icon === "settings" ? SettingsIcon : DeliveryIcon;
  return (
    <span className="button-with-icon">
      <Icon className="app-icon button-inline-icon" />
      {label}
    </span>
  );
}

export function DeliverySettingsPanel({
  deliveryBusy,
  draft,
  message,
  onDraftChange,
  onPreflight,
  onSave,
  settings,
  settingsBusy,
  showButtonIcons = false,
}: DeliverySettingsPanelProps) {
  return (
    <>
      <form
        className="channel-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <label className="field">
          <span>SMTP host</span>
          <input onChange={(event) => onDraftChange("smtp_host", event.target.value)} value={draft.smtp_host} />
        </label>
        <label className="field">
          <span>Port</span>
          <input onChange={(event) => onDraftChange("smtp_port", event.target.value)} value={draft.smtp_port} />
        </label>
        <label className="field">
          <span>Uzytkownik</span>
          <input onChange={(event) => onDraftChange("smtp_username", event.target.value)} value={draft.smtp_username} />
        </label>
        <label className="field">
          <span>Haslo</span>
          <input onChange={(event) => onDraftChange("smtp_password", event.target.value)} type="password" value={draft.smtp_password} />
        </label>
        <label className="field">
          <span>Od</span>
          <input onChange={(event) => onDraftChange("smtp_from", event.target.value)} value={draft.smtp_from} />
        </label>
        <label className="field">
          <span>Kindle email</span>
          <input onChange={(event) => onDraftChange("kindle_email", event.target.value)} value={draft.kindle_email} />
        </label>
        <div className="channel-actions">
          <button className="secondary-button" disabled={settingsBusy} type="submit">
            {renderButtonLabel(settingsBusy ? "Zapisywanie..." : "Zapisz ustawienia", "settings", showButtonIcons)}
          </button>
          <button className="mini-button" disabled={deliveryBusy} onClick={onPreflight} type="button">
            {renderButtonLabel("Sprawdz konfiguracje", "delivery", showButtonIcons)}
          </button>
        </div>
      </form>

      {settings ? (
        <div className="ops-row">
          <div className="ops-row-top">
            <strong>Aktualna konfiguracja wysylki</strong>
            <span>{settings.smtp_ready ? "gotowa" : "niepelna"}</span>
          </div>
          <span>{settings.smtp_host ? `${settings.smtp_host}:${settings.smtp_port}` : "Brak hosta SMTP"}</span>
          <span>{settings.smtp_password.configured ? "Haslo zapisane" : "Haslo niezapisane"}</span>
          <span>{settings.kindle_email ? `Kindle: ${settings.kindle_email}` : "Brak adresu Kindle"}</span>
          {settings.issues.length > 0 ? <span>{settings.issues.join(" | ")}</span> : null}
          {message ? <span>{message}</span> : null}
        </div>
      ) : null}
    </>
  );
}
