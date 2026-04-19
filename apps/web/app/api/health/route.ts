import { NextResponse } from "next/server";
import { getWebStartupDiagnostics } from "@/lib/env";

export function GET() {
  const diagnostics = getWebStartupDiagnostics();

  return NextResponse.json(
    {
      checkedAt: diagnostics.checkedAt,
      environment: diagnostics.config?.environment ?? "invalid",
      errors: diagnostics.errors,
      service: "web",
      status: diagnostics.valid ? "ok" : "error",
    },
    {
      status: diagnostics.valid ? 200 : 500,
    },
  );
}

