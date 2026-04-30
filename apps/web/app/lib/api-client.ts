export type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      candidates?: string[];
      [key: string]: unknown;
    };
  };
};

export type FallbackErrorPayload = {
  detail?: string;
};

export function isErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

export function hasDetailMessage(payload: unknown): payload is FallbackErrorPayload {
  return typeof payload === "object" && payload !== null && "detail" in payload;
}

export function isUnsupportedEndpoint(status: number) {
  return status === 404 || status === 405 || status === 501;
}

export async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (isErrorEnvelope(payload)) {
    return payload.error?.message ?? fallback;
  }
  if (hasDetailMessage(payload) && typeof payload.detail === "string") {
    return payload.detail;
  }
  return fallback;
}

export function isAuthRequiredPayload(payload: unknown): payload is ApiErrorEnvelope {
  return isErrorEnvelope(payload) && payload.error?.code === "auth_required";
}
