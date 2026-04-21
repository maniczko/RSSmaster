import { CaptureStudio } from "@/app/components";
import { normalizeCaptureQueryValue } from "@/app/lib";
import { getWebStartupDiagnostics } from "@/lib/env";

type CapturePageProps = {
  searchParams: Promise<{
    note?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>;
};

export default async function CapturePage({ searchParams }: CapturePageProps) {
  const diagnostics = getWebStartupDiagnostics();
  const params = await searchParams;

  return (
    <main className="workspace-root">
      {diagnostics.valid && diagnostics.config ? (
        <CaptureStudio
          apiBaseUrl={diagnostics.config.apiBaseUrl}
          initialNote={normalizeCaptureQueryValue(params.note)}
          initialTitle={normalizeCaptureQueryValue(params.title)}
          initialUrl={normalizeCaptureQueryValue(params.url)}
        />
      ) : (
        <section className="workspace-runtime-blocker">
          <div className="panel-badge">Problem z konfiguracja</div>
          <h2>Frontend wymaga poprawki konfiguracji, zanim capture wystartuje.</h2>
          <ul className="error-list">
            {diagnostics.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
