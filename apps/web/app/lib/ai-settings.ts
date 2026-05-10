import type { AISettings, AISettingsDraft } from "@/app/lib/channel-lab-types";

export type AISettingsPatch = {
  enabled?: boolean;
  provider?: "openai";
  chat_model?: string;
  embedding_model?: string;
  openai_api_key?: string | null;
};

export function createAISettingsDraft(settings: AISettings | null): AISettingsDraft {
  return {
    enabled: settings?.enabled ?? false,
    chat_model: settings?.chat_model ?? "gpt-5.2",
    embedding_model: settings?.embedding_model ?? "text-embedding-3-small",
    openai_api_key: "",
    clear_openai_api_key: false,
  };
}

export function buildAISettingsPatch(draft: AISettingsDraft, current: AISettings | null): AISettingsPatch {
  const patch: AISettingsPatch = {};
  const chatModel = draft.chat_model.trim();
  const embeddingModel = draft.embedding_model.trim();
  const openAIKey = draft.openai_api_key.trim();

  if (!current) {
    patch.enabled = draft.enabled;
    patch.provider = "openai";
    patch.chat_model = chatModel || "gpt-5.2";
    patch.embedding_model = embeddingModel || "text-embedding-3-small";
  } else {
    if (draft.enabled !== current.enabled) {
      patch.enabled = draft.enabled;
    }
    if (chatModel && chatModel !== current.chat_model) {
      patch.chat_model = chatModel;
    }
    if (embeddingModel && embeddingModel !== current.embedding_model) {
      patch.embedding_model = embeddingModel;
    }
  }

  if (openAIKey) {
    patch.openai_api_key = openAIKey;
  } else if (draft.clear_openai_api_key) {
    patch.openai_api_key = null;
  }

  return patch;
}
