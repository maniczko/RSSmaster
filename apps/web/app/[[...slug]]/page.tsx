import { ChannelLab } from "@/app/channel-lab";
import { getWebStartupDiagnostics } from "@/lib/env";

export default function WorkspacePage() {
  const diagnostics = getWebStartupDiagnostics();

  return (
    <main className="workspace-root">
      {diagnostics.valid && diagnostics.config ? (
        <ChannelLab apiBaseUrl={diagnostics.config.apiBaseUrl} />
      ) : (
        <section className="workspace-runtime-blocker">
          <div className="panel-badge">Problem z konfiguracja</div>
          <h2>Frontend wymaga poprawki konfiguracji, zanim shell czytnika wystartuje.</h2>
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
