"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buildCaptureBookmarklet } from "@/app/lib/capture-share";
import { buildAppHref } from "@/app/lib/app-routes";

type CaptureStudioProps = {
  apiBaseUrl: string;
  initialNote?: string;
  initialTitle?: string;
  initialUrl?: string;
};

type CapturePayload = {
  item: {
    id: string;
    title: string;
  };
};

type CaptureErrorEnvelope = {
  error?: {
    message?: string;
  };
};

export function CaptureStudio({
  apiBaseUrl,
  initialNote = "",
  initialTitle = "",
  initialUrl = "",
}: CaptureStudioProps) {
  const router = useRouter();
  const bookmarkletLinkRef = useRef<HTMLAnchorElement | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [captureResult, setCaptureResult] = useState<{ itemId: string; title: string } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "idle" | "success" | "error"; title: string; detail: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !bookmarkletLinkRef.current) {
      return;
    }
    bookmarkletLinkRef.current.setAttribute("href", buildCaptureBookmarklet(window.location.origin));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/workspace/capture`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const payload = ((await response.json()) as CapturePayload | CaptureErrorEnvelope) ?? {};
      if (!response.ok || !("item" in payload) || !payload.item) {
        const message = "error" in payload ? payload.error?.message : undefined;
        throw new Error(message ?? "Nie udalo sie zapisac artykulu do biblioteki.");
      }

      setCaptureResult({ itemId: payload.item.id, title: payload.item.title });
      setFeedback({
        tone: "success",
        title: "Artykul jest juz w RSSmasterze",
        detail: "Link trafil do zapisanej biblioteki i jest gotowy do czytania w czystym widoku.",
      });
    } catch (error) {
      setCaptureResult(null);
      setFeedback({
        tone: "error",
        title: "Capture nie udal sie",
        detail: error instanceof Error ? error.message : "Przegladarka nie dostala poprawnej odpowiedzi z API.",
      });
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setUrl("");
    setTitle("");
    setNote("");
    setCaptureResult(null);
    setFeedback(null);
  }

  return (
    <main className="capture-page">
      <section className="capture-shell">
        <div className="capture-hero">
          <span className="panel-badge">Capture</span>
          <h1>Zapisz artykul z dowolnej strony</h1>
          <p>
            Wklej link i jednym ruchem wrzuc go do zapisanej biblioteki. Ten ekran jest tez gotowy pod bookmarklet i systemowe
            udostepnianie.
          </p>
        </div>

        <div className="capture-grid">
          <section className="capture-card">
            <div className="capture-card-header">
              <div>
                <strong>Szybki zapis</strong>
                <span>Najkrotsza droga od strony w przegladarce do czystego czytnika RSSmastera.</span>
              </div>
              <Link className="secondary-button" href="/sources">
                Dodawanie zrodel
              </Link>
            </div>

            <form className="capture-form" onSubmit={handleSubmit}>
              <label className="capture-field">
                <span>Adres artykulu</span>
                <input
                  autoComplete="off"
                  autoFocus
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/artykul"
                  required
                  value={url}
                />
              </label>

              <div className="capture-field-grid">
                <label className="capture-field">
                  <span>Tytul opcjonalny</span>
                  <input onChange={(event) => setTitle(event.target.value)} placeholder="Nadpisz tytul tylko, jesli potrzebujesz" value={title} />
                </label>
                <label className="capture-field">
                  <span>Notatka opcjonalna</span>
                  <input onChange={(event) => setNote(event.target.value)} placeholder="Dlaczego warto do tego wrocic" value={note} />
                </label>
              </div>

              <div className="capture-actions">
                <button className="action-button" disabled={!url.trim() || busy} type="submit">
                  {busy ? "Zapisywanie..." : "Zapisz do biblioteki"}
                </button>
                <button className="secondary-button" disabled={busy && !captureResult} onClick={resetForm} type="button">
                  Wyczysc
                </button>
              </div>
            </form>

            {feedback ? (
              <div className={`capture-feedback capture-feedback-${feedback.tone}`}>
                <strong>{feedback.title}</strong>
                <p>{feedback.detail}</p>
                {captureResult ? (
                  <div className="capture-feedback-actions">
                    <button
                      className="action-button compact-button"
                      onClick={() =>
                        router.push(
                          buildAppHref({
                            section: "read",
                            libraryView: "saved",
                            item: captureResult.itemId,
                          }),
                        )
                      }
                      type="button"
                    >
                      Otworz zapisany artykul
                    </button>
                    <button className="secondary-button" onClick={resetForm} type="button">
                      Zapisz kolejny link
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="capture-card capture-card-aside">
            <div className="capture-card-header">
              <div>
                <strong>Wejscia z zewnatrz</strong>
                <span>To jest ten sam flow, ale gotowy na codzienny use-case poza glownym workspace.</span>
              </div>
            </div>

            <div className="capture-hint-stack">
              <div className="capture-hint-card">
                <span className="panel-badge">Bookmarklet</span>
                <strong>Przeciagnij do paska zakladek</strong>
                <p>Klikniecie na dowolnej stronie otworzy RSSmaster z gotowym URL-em do zapisu.</p>
                <a className="action-button compact-button" href="#" ref={bookmarkletLinkRef}>
                  Zapisz do RSSmastera
                </a>
              </div>

              <div className="capture-hint-card">
                <span className="panel-badge">Share target</span>
                <strong>Udostepnianie z telefonu lub przegladarki</strong>
                <p>Po instalacji aplikacji system moze kierowac udostepniony link bezposrednio tutaj, z prefillowanym adresem i tytulem.</p>
              </div>

              <div className="capture-hint-card">
                <span className="panel-badge">Po zapisie</span>
                <strong>Artykul trafia prosto do zapisanych</strong>
                <p>Capture ustawia wpis jako zapisany i gotowy do dalszego czytania, digestu albo anotacji.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
