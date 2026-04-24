import { NextResponse } from "next/server";

import { getWebStartupDiagnostics } from "@/lib/env";
import { isExpectedSourcePreviewFailureStatus } from "@/app/lib/source-preview";

type SourcePreviewRequest = {
  input_url?: unknown;
};

function buildProxyError(message: string, status = 502) {
  return NextResponse.json(
    {
      error: {
        code: "source_preview_proxy_failed",
        details: null,
        message,
      },
    },
    { status },
  );
}

export async function POST(request: Request) {
  const diagnostics = getWebStartupDiagnostics();
  if (!diagnostics.valid || !diagnostics.config) {
    return buildProxyError("Frontend runtime is not configured.", 500);
  }

  let body: SourcePreviewRequest;
  try {
    body = (await request.json()) as SourcePreviewRequest;
  } catch {
    return buildProxyError("Preview request body is invalid.", 400);
  }

  const inputUrl = typeof body.input_url === "string" ? body.input_url.trim() : "";
  if (!inputUrl) {
    return buildProxyError("Preview request is missing input_url.", 400);
  }

  try {
    const upstreamResponse = await fetch(`${diagnostics.config.apiBaseUrl}/api/v1/channels/preview`, {
      body: JSON.stringify({ input_url: inputUrl }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      method: "POST",
    });

    const upstreamText = await upstreamResponse.text();
    let upstreamPayload: unknown = null;
    try {
      upstreamPayload = upstreamText ? JSON.parse(upstreamText) : null;
    } catch {
      upstreamPayload = {
        error: {
          code: "source_preview_proxy_invalid_payload",
          details: null,
          message: upstreamText || "Upstream preview returned an invalid payload.",
        },
      };
    }

    const responseStatus = isExpectedSourcePreviewFailureStatus(upstreamResponse.status) ? 200 : upstreamResponse.status;
    return NextResponse.json(upstreamPayload, {
      headers: {
        "x-rssmaster-upstream-status": String(upstreamResponse.status),
      },
      status: responseStatus,
    });
  } catch {
    return buildProxyError("Nie udalo sie skontaktowac z API preview.", 502);
  }
}
