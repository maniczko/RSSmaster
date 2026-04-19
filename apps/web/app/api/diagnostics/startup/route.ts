import { NextResponse } from "next/server";
import { getWebStartupDiagnostics } from "@/lib/env";

export function GET() {
  const diagnostics = getWebStartupDiagnostics();

  return NextResponse.json(
    {
      ...diagnostics,
      expectedRoutes: ["/api/health", "/api/diagnostics/startup"],
      service: "web",
    },
    {
      status: diagnostics.valid ? 200 : 500,
    },
  );
}

