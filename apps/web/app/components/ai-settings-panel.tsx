import type { AISettings, AISettingsDraft, AISettingsPreflight } from "@/app/lib/channel-lab-types";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

import { SettingsIcon, SparkIcon, StatusIcon } from "./ui-icons";

type AISettingsPanelProps = {
  busy: boolean;
  draft: AISettingsDraft;
  message: string | null;
  onDraftChange: (field: keyof AISettingsDraft, value: string | boolean) => void;
  onPreflight: () => void;
  onSave: () => void;
  preflight: AISettingsPreflight | null;
  preflightBusy: boolean;
  settings: AISettings | null;
  showButtonIcons?: boolean;
};

function renderButtonLabel(label: string, icon: "settings" | "spark", showIcon: boolean) {
  if (!showIcon) {
    return label;
  }

  const Icon = icon === "settings" ? SettingsIcon : SparkIcon;
  return (
    <span className="button-with-icon">
      <Icon className="app-icon button-inline-icon" />
      {label}
    </span>
  );
}

function getStatusLabel(settings: AISettings | null) {
  if (!settings) {
    return "wczytywanie";
  }
  if (settings.ready) {
    return "gotowe";
  }
  if (settings.enabled) {
    return "wymaga konfiguracji";
  }
  return "wyłączone";
}

export function AISettingsPanel({
  busy,
  draft,
  message,
  onDraftChange,
  onPreflight,
  onSave,
  preflight,
  preflightBusy,
  settings,
  showButtonIcons = false,
}: AISettingsPanelProps) {
  const keyConfigured = settings?.openai_api_key.configured ?? false;

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
          <span>Tryb AI</span>
          <span className="app-checkbox-row">
            <input
              checked={draft.enabled}
              onChange={(event) => onDraftChange("enabled", event.target.checked)}
              type="checkbox"
            />
            Włącz AI dla przyszłych funkcji czytnika
          </span>
        </label>
        <label className="field">
          <span>Dostawca</span>
          <input disabled value="OpenAI" />
        </label>
        <label className="field">
          <span>Model tekstowy</span>
          <input
            onChange={(event) => onDraftChange("chat_model", event.target.value)}
            placeholder="gpt-5.2"
            value={draft.chat_model}
          />
        </label>
        <label className="field">
          <span>Model embeddingów</span>
          <input
            onChange={(event) => onDraftChange("embedding_model", event.target.value)}
            placeholder="text-embedding-3-small"
            value={draft.embedding_model}
          />
        </label>
        <label className="field">
          <span>Klucz OpenAI API</span>
          <input
            autoComplete="off"
            onChange={(event) => onDraftChange("openai_api_key", event.target.value)}
            placeholder={keyConfigured ? "Klucz zapisany - wpisz nowy, aby zmienić" : "sk-..."}
            type="password"
            value={draft.openai_api_key}
          />
        </label>
        {keyConfigured ? (
          <label className="field">
            <span>Usunięcie klucza</span>
            <span className="app-checkbox-row">
              <input
                checked={draft.clear_openai_api_key}
                disabled={Boolean(draft.openai_api_key.trim())}
                onChange={(event) => onDraftChange("clear_openai_api_key", event.target.checked)}
                type="checkbox"
              />
              Usuń lokalnie zapisany klucz przy zapisie
            </span>
          </label>
        ) : null}
        <div className="channel-actions">
          <Button className="secondary-button" disabled={busy} type="submit" variant="outline">
            {renderButtonLabel(busy ? "Zapisywanie..." : "Zapisz ustawienia AI", "settings", showButtonIcons)}
          </Button>
          <Button className="mini-button" disabled={preflightBusy} onClick={onPreflight} type="button" variant="outline">
            {renderButtonLabel(preflightBusy ? "Sprawdzanie..." : "Sprawdź konfigurację", "spark", showButtonIcons)}
          </Button>
        </div>
      </form>

      <div className="ops-row">
        <div className="ops-row-top">
          <strong>Aktualna konfiguracja AI</strong>
          <Badge variant={settings?.ready ? "secondary" : "outline"}>{getStatusLabel(settings)}</Badge>
        </div>
        <span>Provider: OpenAI</span>
        <span>Tekst: {settings?.chat_model ?? draft.chat_model}</span>
        <span>Embeddingi: {settings?.embedding_model ?? draft.embedding_model}</span>
        <span>{keyConfigured ? "Klucz API zapisany" : "Brak zapisanego klucza API"}</span>
        {settings?.issues.length ? <span>{settings.issues.join(" | ")}</span> : null}
        {message ? <span>{message}</span> : null}
      </div>

      {preflight ? (
        <div className="ops-row">
          <div className="ops-row-top">
            <strong>
              <span className="button-with-icon">
                <StatusIcon className="app-icon button-inline-icon" />
                Preflight AI
              </span>
            </strong>
            <Badge variant={preflight.can_use_ai ? "secondary" : "outline"}>{preflight.status}</Badge>
          </div>
          {preflight.checks.map((check) => (
            <span key={check.name}>
              {check.name}: {check.message}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
