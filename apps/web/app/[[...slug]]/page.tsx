import { ChannelLab } from "@/app/channel-lab";
import { getWebStartupDiagnostics } from "@/lib/env";

export default function WorkspacePage() {
  const diagnostics = getWebStartupDiagnostics();

  if (!diagnostics.valid || !diagnostics.config) {
    return (
      <main aria-labelledby="workspace-runtime-blocker-title" className="workspace-root">
        <section className="workspace-runtime-blocker">
          <div className="panel-badge">Problem z konfiguracja</div>
          <h1 id="workspace-runtime-blocker-title">Frontend wymaga poprawki konfiguracji, zanim shell czytnika wystartuje.</h1>
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
      <ChannelLab apiBaseUrl={diagnostics.config.apiBaseUrl} />
    </div>
  );
}
