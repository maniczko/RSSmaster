"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BookmarkIcon,
  CaptureIcon,
  DismissIcon,
  ReaderIcon,
  SourcesIcon,
} from "@/app/components/ui-icons";
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

type CaptureAuthSessionPayload = {
  has_accounts: boolean;
  auth_required: boolean;
  session: unknown | null;
};

export function CaptureStudio({
  apiBaseUrl,
  initialNote = "",
  initialTitle = "",
  initialUrl = "",
}: CaptureStudioProps) {
  const router = useRouter();
  const bookmarkletLinkRef = useRef<HTMLAnchorElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ready" | "auth-required">("checking");
  const [captureResult, setCaptureResult] = useState<{ itemId: string; title: string } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "idle" | "success" | "error"; title: string; detail: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !bookmarkletLinkRef.current) {
      return;
    }
    bookmarkletLinkRef.current.setAttribute("href", buildCaptureBookmarklet(window.location.origin));
  }, []);

  useEffect(() => {
    if (initialUrl.trim()) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      urlInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [initialUrl]);

  useEffect(() => {
    let active = true;

    async function loadCaptureAuthState() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/auth/session`, {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });
        const payload = (await response.json()) as CaptureAuthSessionPayload;
        if (!active) {
          return;
        }
        setAuthState(payload.auth_required && !payload.session ? "auth-required" : "ready");
      } catch {
        if (active) {
          setAuthState("ready");
        }
      }
    }

    void loadCaptureAuthState();
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      return;
    }

    if (authState === "auth-required") {
      setFeedback({
        tone: "error",
        title: "Najpierw zaloguj się do RSSmastera",
        detail: "Capture zapisuje linki do Twojej lokalnej biblioteki. Otwórz logowanie w głównej aplikacji, a potem wróć do tego formularza.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/workspace/capture`, {
        method: "POST",
        credentials: "include",
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
        if (response.status === 401) {
          setAuthState("auth-required");
          throw new Error("Zaloguj się w głównej aplikacji RSSmaster, aby zapisać artykuł do swojej biblioteki.");
        }
        const message = "error" in payload ? payload.error?.message : undefined;
        throw new Error(message ?? "Nie udało się zapisać artykułu do biblioteki.");
      }

      setCaptureResult({ itemId: payload.item.id, title: payload.item.title });
      setFeedback({
        tone: "success",
        title: "Artykuł jest już w RSSmasterze",
        detail: note.trim()
          ? "Link trafił do zapisanej biblioteki, a notatka została zapisana przy artykule."
          : "Link trafił do zapisanej biblioteki i jest gotowy do czytania w czystym widoku.",
      });
    } catch (error) {
      setCaptureResult(null);
      setFeedback({
        tone: "error",
        title: "Capture nie udał się",
        detail: error instanceof Error ? error.message : "Przeglądarka nie dostała poprawnej odpowiedzi z API.",
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
          <span className="panel-badge panel-badge-with-icon">
            <CaptureIcon className="app-icon app-icon-xs" />
            Capture
          </span>
          <h1>Zapisz artykuł z dowolnej strony</h1>
          <p>
            Wklej link i jednym ruchem wrzuć go do zapisanej biblioteki. Ten ekran jest też gotowy pod bookmarklet i systemowe
            udostępnianie.
          </p>
        </div>

        <div className="capture-grid">
          <section className="capture-card">
            <div className="capture-card-header">
              <div>
                <strong>Szybki zapis</strong>
                <span>Najkrótsza droga od strony w przeglądarce do czystego czytnika RSSmastera.</span>
              </div>
              <Link className="secondary-button" href="/sources">
                <span className="button-with-icon">
                  <SourcesIcon className="app-icon button-inline-icon" />
                  Dodawanie źródeł
                </span>
              </Link>
            </div>

            {authState === "auth-required" ? (
              <div className="capture-feedback capture-feedback-error" role="status">
                <strong>Logowanie jest wymagane</strong>
                <p>Ten formularz zapisuje linki do Twojej lokalnej biblioteki. Zaloguj się w głównej aplikacji, a potem wróć do Capture.</p>
                <div className="capture-feedback-actions">
                  <Link className="action-button compact-button" href="/">
                    Przejdź do logowania
                  </Link>
                </div>
              </div>
            ) : null}

            <form className="capture-form" onSubmit={handleSubmit}>
              <label className="capture-field">
                <span>Adres artykułu</span>
                <input
                  autoComplete="off"
                  name="captureUrl"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/artykul"
                  ref={urlInputRef}
                  required
                  value={url}
                />
              </label>

              <div className="capture-field-grid">
                <label className="capture-field">
                  <span>Tytuł opcjonalny</span>
                  <input
                    autoComplete="off"
                    name="captureTitle"
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Nadpisz tytuł tylko, jeśli potrzebujesz"
                    value={title}
                  />
                </label>
                <label className="capture-field">
                  <span>Notatka opcjonalna</span>
                  <input
                    autoComplete="off"
                    name="captureNote"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Dlaczego warto do tego wrócić"
                    value={note}
                  />
                </label>
              </div>

              <div className="capture-actions">
                <button className="action-button" disabled={!url.trim() || busy || authState === "auth-required"} type="submit">
                  <span className="button-with-icon">
                    <BookmarkIcon className="app-icon button-inline-icon" />
                    {busy ? "Zapisywanie..." : "Zapisz do biblioteki"}
                  </span>
                </button>
                <button className="secondary-button" disabled={busy && !captureResult} onClick={resetForm} type="button">
                  <span className="button-with-icon">
                    <DismissIcon className="app-icon button-inline-icon" />
                    Wyczysc
                  </span>
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
                            surface: "article",
                          }),
                        )
                      }
                      type="button"
                    >
                      <span className="button-with-icon">
                        <ReaderIcon className="app-icon button-inline-icon" />
                        Otwórz zapisany artykuł
                      </span>
                    </button>
                    <button className="secondary-button" onClick={resetForm} type="button">
                      <span className="button-with-icon">
                        <CaptureIcon className="app-icon button-inline-icon" />
                        Zapisz kolejny link
                      </span>
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
                <span>To jest ten sam flow, ale gotowy na codzienny use-case poza głównym workspace.</span>
              </div>
            </div>

            <div className="capture-hint-stack">
              <div className="capture-hint-card">
                <span className="panel-badge panel-badge-with-icon">
                  <BookmarkIcon className="app-icon app-icon-xs" />
                  Bookmarklet
                </span>
                <strong>Przeciagnij do paska zakladek</strong>
                <p>Klikniecie na dowolnej stronie otworzy RSSmaster z gotowym URL-em do zapisu.</p>
                <a className="action-button compact-button" href="#" ref={bookmarkletLinkRef}>
                  <span className="button-with-icon">
                    <CaptureIcon className="app-icon button-inline-icon" />
                    Zapisz do RSSmastera
                  </span>
                </a>
              </div>

              <div className="capture-hint-card">
                <span className="panel-badge panel-badge-with-icon">
                  <CaptureIcon className="app-icon app-icon-xs" />
                  Share target
                </span>
                <strong>Udostępnianie z telefonu lub przeglądarki</strong>
                <p>Po instalacji aplikacji system może kierować udostępniony link bezpośrednio tutaj, z prefillowanym adresem i tytułem.</p>
              </div>

              <div className="capture-hint-card">
                <span className="panel-badge panel-badge-with-icon">
                  <ReaderIcon className="app-icon app-icon-xs" />
                  Po zapisie
                </span>
                <strong>Artykuł trafia prosto do zapisanych</strong>
                <p>Capture ustawia wpis jako zapisany i gotowy do dalszego czytania, digestu albo anotacji.</p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
