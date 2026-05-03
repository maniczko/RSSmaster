import type { ReactNode } from "react";

import type { RankingPreference } from "@/app/lib/editorial-support";
import type {
  AuthAccount,
  DeliverySettings,
  DeliverySettingsDraft,
  WorkspaceInterest,
  WorkspaceProfile,
} from "@/app/lib/channel-lab-types";

import { AccountStatus } from "./local-auth";
import { DeliverySettingsPanel } from "./delivery-settings-panel";
import { RankingPreferencesPanel } from "./ranking-preferences-panel";
import {
  DeliveryIcon,
  LibraryIcon,
  SettingsIcon,
  StatusIcon,
  TopicIcon,
} from "./ui-icons";
import { WorkspaceButton, WorkspaceChip, WorkspacePanel } from "./workspace-primitives";

type SettingsCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

type RuntimeLink = {
  href: string;
  label: string;
};

type WorkspaceSettingsSectionProps = {
  activeChannelCount: number;
  apiBaseUrl: string;
  authenticatedAccount: AuthAccount | null;
  authBusy: boolean;
  authRequired: boolean;
  copy: SettingsCopy;
  deliveryBusy: boolean;
  deliverySettings: DeliverySettings | null;
  deliverySettingsMessage: string | null;
  feedbackCard: ReactNode;
  formatTimestamp: (value: string | null | undefined, fallback: string) => string;
  hasLocalAccounts: boolean;
  interestDraft: string;
  interestWeight: WorkspaceInterest["weight"];
  onDeliverySettingsDraftChange: (field: keyof DeliverySettingsDraft, value: string) => void;
  onDeliverySettingsPreflight: () => void;
  onDeliverySettingsSave: () => void;
  onInterestDraftChange: (value: string) => void;
  onInterestWeightChange: (value: WorkspaceInterest["weight"]) => void;
  onLogin: () => void;
  onLogout: () => void;
  onSaveWorkspaceProfile: (patch: Partial<WorkspaceProfile> & { interests?: WorkspaceInterest[] }) => Promise<unknown>;
  rankingPreferences: RankingPreference<string>[];
  runtimeLinks: RuntimeLink[];
  settingsBusy: boolean;
  settingsDraft: DeliverySettingsDraft;
  workspaceBusy: boolean;
  workspaceProfile: WorkspaceProfile | null;
};

export function WorkspaceSettingsSection({
  activeChannelCount,
  apiBaseUrl,
  authenticatedAccount,
  authBusy,
  authRequired,
  copy,
  deliveryBusy,
  deliverySettings,
  deliverySettingsMessage,
  feedbackCard,
  formatTimestamp,
  hasLocalAccounts,
  interestDraft,
  interestWeight,
  onDeliverySettingsDraftChange,
  onDeliverySettingsPreflight,
  onDeliverySettingsSave,
  onInterestDraftChange,
  onInterestWeightChange,
  onLogin,
  onLogout,
  onSaveWorkspaceProfile,
  rankingPreferences,
  runtimeLinks,
  settingsBusy,
  settingsDraft,
  workspaceBusy,
  workspaceProfile,
}: WorkspaceSettingsSectionProps) {
  return (
    <section className="section-screen">
      <div className="section-screen-header">
        <div>
          <span className="panel-badge panel-badge-with-icon">
            <SettingsIcon className="app-icon app-icon-xs" />
            {copy.eyebrow}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </div>

      <div className="section-grid section-grid-two">
        <div className="screen-stack">
          {feedbackCard}

          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <LibraryIcon className="app-icon app-icon-xs" />
                  Konto lokalne
                </span>
                <h3>Sesja operatora</h3>
              </div>
              <span>{authenticatedAccount ? "zalogowane" : authRequired ? "wymaga logowania" : "tryb otwarty"}</span>
            </div>
            <AccountStatus
              account={authenticatedAccount}
              authRequired={authRequired}
              busy={authBusy}
              formatTimestamp={formatTimestamp}
              hasLocalAccounts={hasLocalAccounts}
              onLogin={onLogin}
              onLogout={onLogout}
            />
          </section>

          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <DeliveryIcon className="app-icon app-icon-xs" />
                  Delivery
                </span>
                <h3>SMTP i Kindle</h3>
              </div>
              <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
            </div>
            <DeliverySettingsPanel
              deliveryBusy={deliveryBusy}
              draft={settingsDraft}
              message={deliverySettingsMessage}
              onDraftChange={onDeliverySettingsDraftChange}
              onPreflight={onDeliverySettingsPreflight}
              onSave={onDeliverySettingsSave}
              settings={deliverySettings}
              settingsBusy={settingsBusy}
              showButtonIcons
            />
          </section>

          <WorkspacePanel
            eyebrow={
              <span className="workspace-eyebrow-with-icon">
                <StatusIcon className="app-icon app-icon-xs" />
                Diagnostyka
              </span>
            }
            title="Stan aplikacji"
            description="Narzedia diagnostyczne i szybkie wejscie do healthcheckow po przebudowie shellu."
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
              {runtimeLinks.map((item) => (
                <a className="app-inline-link" href={item.href} key={item.href} target={item.href.startsWith("http") ? "_blank" : undefined}>
                  {item.label}
                </a>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
              <WorkspaceChip active tone="accent">
                API {apiBaseUrl.replace(/^https?:\/\//, "")}
              </WorkspaceChip>
              <WorkspaceChip>{activeChannelCount} aktywnych zrodel</WorkspaceChip>
            </div>
          </WorkspacePanel>
        </div>

        <div className="screen-stack">
          <section className="ops-section">
            <RankingPreferencesPanel
              actions={
                workspaceProfile ? (
                  <WorkspaceChip active tone="accent">
                    Limit awaryjny {workspaceProfile.emergency_source_cap}
                  </WorkspaceChip>
                ) : null
              }
              onPreferenceChange={(preferenceId, nextValue) =>
                void onSaveWorkspaceProfile({
                  [preferenceId]: Number.parseInt(nextValue, 10),
                } as Partial<WorkspaceProfile>)
              }
              preferences={rankingPreferences}
            />
          </section>

          <WorkspacePanel
            eyebrow={
              <span className="workspace-eyebrow-with-icon">
                <TopicIcon className="app-icon app-icon-xs" />
                Profil
              </span>
            }
            title="Zainteresowania tematyczne"
            description="Deklaruj trwale tematy, aby korygowac ranking kolejki i ograniczac przeciazenie czytnikiem."
            tone="accent"
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
              {workspaceProfile?.interests.map((interest) => (
                <WorkspaceButton
                  key={interest.id}
                  onClick={() =>
                    void onSaveWorkspaceProfile({
                      interests: workspaceProfile.interests.filter((entry) => entry.id !== interest.id),
                    })
                  }
                  tone={interest.weight > 0 ? "accent" : interest.weight < 0 ? "danger" : "default"}
                >
                  {interest.label} {interest.weight > 0 ? "wzmacniaj" : interest.weight < 0 ? "tlum" : "neutralnie"}
                </WorkspaceButton>
              ))}
              {!workspaceProfile?.interests.length ? <WorkspaceChip>Brak skonfigurowanych zainteresowan</WorkspaceChip> : null}
            </div>
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <input onChange={(event) => onInterestDraftChange(event.target.value)} placeholder="szachy, AI, ksiazki, security" value={interestDraft} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
                <select onChange={(event) => onInterestWeightChange(Number.parseInt(event.target.value, 10) as WorkspaceInterest["weight"])} value={interestWeight}>
                  <option value={2}>Wzmacniaj</option>
                  <option value={1}>Preferuj</option>
                  <option value={0}>Neutralnie</option>
                  <option value={-1}>Tlum</option>
                </select>
                <WorkspaceButton
                  disabled={!interestDraft.trim() || !workspaceProfile || workspaceBusy}
                  onClick={() =>
                    workspaceProfile
                      ? void onSaveWorkspaceProfile({
                          interests: [
                            ...workspaceProfile.interests.filter((entry) => entry.label.toLowerCase() !== interestDraft.trim().toLowerCase()),
                            {
                              id: `draft_${interestDraft.trim().toLowerCase()}`,
                              label: interestDraft.trim(),
                              normalized_topic: interestDraft.trim().toLowerCase(),
                              kind: "topic",
                              weight: interestWeight,
                            },
                          ],
                        }).then(() => {
                          onInterestDraftChange("");
                          onInterestWeightChange(1);
                        })
                      : undefined
                  }
                  tone="accent"
                >
                  <span className="button-with-icon">
                    <TopicIcon className="app-icon button-inline-icon" />
                    Dodaj zainteresowanie
                  </span>
                </WorkspaceButton>
              </div>
            </div>
          </WorkspacePanel>
        </div>
      </div>
    </section>
  );
}
