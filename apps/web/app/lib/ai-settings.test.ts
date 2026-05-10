import { describe, expect, it } from "vitest";

import { buildAISettingsPatch, createAISettingsDraft } from "@/app/lib/ai-settings";
import type { AISettings } from "@/app/lib/channel-lab-types";

const configuredSettings: AISettings = {
  enabled: true,
  provider: "openai",
  chat_model: "gpt-5.2",
  embedding_model: "text-embedding-3-small",
  openai_api_key: {
    configured: true,
    redacted_value: "********",
  },
  ready: true,
  updated_at: "2026-05-05T12:00:00Z",
  updated_by: "tester",
  issues: [],
};

describe("AI settings helpers", () => {
  it("creates a draft without copying the redacted secret into the password field", () => {
    const draft = createAISettingsDraft(configuredSettings);

    expect(draft.openai_api_key).toBe("");
    expect(draft.clear_openai_api_key).toBe(false);
    expect(draft.chat_model).toBe("gpt-5.2");
  });

  it("sends only edited non-secret fields", () => {
    const draft = createAISettingsDraft(configuredSettings);
    draft.embedding_model = "text-embedding-3-large";

    expect(buildAISettingsPatch(draft, configuredSettings)).toEqual({
      embedding_model: "text-embedding-3-large",
    });
  });

  it("does not overwrite a configured secret unless the user enters or clears it", () => {
    expect(buildAISettingsPatch(createAISettingsDraft(configuredSettings), configuredSettings)).toEqual({});

    expect(
      buildAISettingsPatch(
        {
          ...createAISettingsDraft(configuredSettings),
          openai_api_key: "sk-new",
        },
        configuredSettings,
      ),
    ).toEqual({ openai_api_key: "sk-new" });

    expect(
      buildAISettingsPatch(
        {
          ...createAISettingsDraft(configuredSettings),
          clear_openai_api_key: true,
        },
        configuredSettings,
      ),
    ).toEqual({ openai_api_key: null });
  });
});
