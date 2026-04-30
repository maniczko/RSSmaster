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

  if (!diagnostics.valid || !diagnostics.config) {
    return (
      <main aria-labelledby="capture-runtime-blocker-title" className="workspace-root">
        <section className="workspace-runtime-blocker">
          <div className="panel-badge">Problem z konfiguracja</div>
          <h1 id="capture-runtime-blocker-title">Frontend wymaga poprawki konfiguracji, zanim capture wystartuje.</h1>
          <ul className="error-list">
            {diagnostics.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  return (
    <div className="workspace-root">
      <CaptureStudio
        apiBaseUrl={diagnostics.config.apiBaseUrl}
        initialNote={normalizeCaptureQueryValue(params.note)}
        initialTitle={normalizeCaptureQueryValue(params.title)}
        initialUrl={normalizeCaptureQueryValue(params.url)}
      />
    </div>
  );
}
