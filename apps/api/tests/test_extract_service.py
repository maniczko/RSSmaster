from __future__ import annotations

import unittest

from app.extract.service import prepare_document


class ExtractionServiceDocumentTests(unittest.TestCase):
    def assert_fragments_absent(self, value: str | None, *fragments: str) -> None:
        self.assertIsNotNone(value)
        for fragment in fragments:
            self.assertNotIn(fragment, value)

    def test_prepare_document_preserves_markup_and_absolutizes_relative_urls(self) -> None:
        html = """
        <article>
          <h1>Story title</h1>
          <p>Intro with <a href="/read-more">read more</a>.</p>
          <figure>
            <img src="/images/hero.jpg" alt="Hero image" />
            <figcaption>Hero caption</figcaption>
          </figure>
          <blockquote>
            <p>Quoted <strong>passage</strong>.</p>
          </blockquote>
          <ul>
            <li>First item</li>
            <li>Second item</li>
          </ul>
          <script>alert("remove me")</script>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn("<h1>Story title</h1>", result.cleaned_html)
        self.assertIn('<a href="https://example.com/read-more">read more</a>', result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/hero.jpg" alt="Hero image">', result.cleaned_html)
        self.assertIn("<figcaption>Hero caption</figcaption>", result.cleaned_html)
        self.assertIn("<blockquote>", result.cleaned_html)
        self.assertIn("<li>First item</li>", result.cleaned_html)
        self.assertNotIn("<script", result.cleaned_html)
        self.assertNotIn("alert(", result.cleaned_html)

        self.assertIsNotNone(result.content_text)
        self.assertIn("Story title", result.content_text)
        self.assertIn("read more", result.content_text)
        self.assertIn("Hero caption", result.content_text)
        self.assertIn("Quoted passage", result.content_text)
        self.assertIn("First item", result.content_text)

    def test_prepare_document_normalizes_lazy_images_and_srcset(self) -> None:
        html = """
        <article>
          <p>Intro with a deferred image.</p>
          <img
            src="/images/placeholder.gif"
            data-src="/images/hero.jpg"
            data-lazy-src="/images/hero-lazy.jpg"
            data-original="/images/hero-original.jpg"
            data-url="/images/hero-url.jpg"
            srcset="/images/hero-small.jpg 320w, /images/hero-large.jpg 1280w"
            alt="Deferred hero"
          />
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/hero.jpg" alt="Deferred hero">', result.cleaned_html)
        self.assertNotIn("placeholder.gif", result.cleaned_html)
        self.assertNotIn("hero-lazy.jpg", result.cleaned_html)
        self.assertNotIn("hero-original.jpg", result.cleaned_html)
        self.assertNotIn("hero-url.jpg", result.cleaned_html)
        self.assertNotIn("hero-small.jpg", result.cleaned_html)
        self.assertNotIn("hero-large.jpg", result.cleaned_html)
        self.assertIn("deferred image", result.content_text or "")

    def test_prepare_document_flattens_picture_sources_to_img(self) -> None:
        html = """
        <article>
          <picture>
            <source media="(max-width: 799px)" srcset="/images/mobile.jpg 1x, /images/mobile@2x.jpg 2x" />
            <source media="(min-width: 800px)" srcset="/images/desktop.jpg 1x, /images/desktop@2x.jpg 2x" />
            <img src="/images/placeholder.gif" alt="Feature image" />
            <noscript>
              <img data-src="/images/ignored.jpg" alt="Feature image" />
            </noscript>
          </picture>
          <p>Body copy.</p>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/mobile@2x.jpg" alt="Feature image">', result.cleaned_html)
        self.assertNotIn("<picture", result.cleaned_html)
        self.assertNotIn("<source", result.cleaned_html)
        self.assertNotIn("placeholder.gif", result.cleaned_html)
        self.assertNotIn("ignored.jpg", result.cleaned_html)
        self.assertIn("Body copy.", result.content_text or "")

    def test_prepare_document_uses_noscript_fallback_image(self) -> None:
        html = """
        <article>
          <picture>
            <img src="/images/placeholder.gif" alt="Feature image" />
            <noscript>
              <img data-src="/images/fallback.jpg" alt="Feature image" />
            </noscript>
          </picture>
          <p>Body copy.</p>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/fallback.jpg" alt="Feature image">', result.cleaned_html)
        self.assertNotIn("placeholder.gif", result.cleaned_html)
        self.assertNotIn("<picture", result.cleaned_html)
        self.assertIn("Body copy.", result.content_text or "")

    def test_prepare_document_keeps_sanitized_html_when_text_is_short(self) -> None:
        html = """
        <article>
          <figure>
            <img src="/images/short.jpg" alt="Short image" />
            <figcaption>Short caption</figcaption>
          </figure>
          <p>Short note.</p>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/short",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn("<figure>", result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/short.jpg" alt="Short image">', result.cleaned_html)
        self.assertIn("<figcaption>Short caption</figcaption>", result.cleaned_html)
        self.assertIn("Short note.", result.content_text or "")
        self.assertIn("Short caption", result.content_text or "")

    def test_prepare_document_normalizes_lazy_picture_and_noscript_media(self) -> None:
        html = """
        <article>
          <h1>Rich media story</h1>
          <p>Lead akapit dla ekstrakcji o odpowiedniej dlugosci i czytelnej strukturze.</p>
          <picture>
            <source srcset="/images/hero-small.jpg 640w, /images/hero-large.jpg 1600w" />
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/images/hero-data.jpg" alt="Hero picture" />
          </picture>
          <p>
            <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-original="/images/inline-original.jpg" alt="Inline image" />
            <noscript><img src="/images/inline-noscript.jpg" alt="Inline image" /></noscript>
          </p>
          <p>Drugi akapit potwierdza, ze parser nie gubi tekstu po normalizacji mediow i dalej buduje poprawny fallback tekstowy dla czytnika lokalnego.</p>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/rich-media",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/hero-large.jpg" alt="Hero picture">', result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/inline-original.jpg" alt="Inline image">', result.cleaned_html)
        self.assertNotIn("data:image/gif", result.cleaned_html)
        self.assertEqual(result.cleaned_html.count('alt="Inline image"'), 1)
        self.assertIn("Rich media story", result.content_text or "")
        self.assertIn("Lead akapit", result.content_text or "")

    def test_prepare_document_preserves_table_markup_after_sanitization(self) -> None:
        html = """
        <article>
          <h1>Tabela redakcyjna</h1>
          <p>Wstep do tabeli z odpowiednio dlugim tekstem, aby ekstrakcja premium zachowala strukture i nie zredukowala wszystkiego do golych paragrafow.</p>
          <table>
            <thead>
              <tr><th>Kolumna</th><th>Wartosc</th></tr>
            </thead>
            <tbody>
              <tr><td>Pierwsza</td><td>Druga</td></tr>
            </tbody>
          </table>
          <p>Zakonczenie artykulu utrzymuje pelna czytelnosc tekstu i zapewnia sensowny excerpt.</p>
        </article>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/table",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn("<table>", result.cleaned_html)
        self.assertIn("<thead>", result.cleaned_html)
        self.assertIn("<tbody>", result.cleaned_html)
        self.assertIn("<th>Kolumna</th>", result.cleaned_html)
        self.assertIn("<td>Pierwsza</td>", result.cleaned_html)
        self.assertIn("Tabela redakcyjna", result.content_text or "")
        self.assertIn("Pierwsza", result.content_text or "")

    def test_prepare_document_injects_og_image_from_full_document_when_article_header_is_stripped(self) -> None:
        html = """
        <html>
          <head>
            <title>XYZ hero story</title>
            <meta property="og:title" content="XYZ hero story" />
            <meta property="og:image" content="/images/hero-2048x1365.jpg" />
            <meta property="og:image:alt" content="Hero image from metadata" />
          </head>
          <body>
            <article>
              <header>
                <img src="/images/header-hero-1024x682.jpg" alt="Header hero" />
              </header>
              <p>Lead akapit o odpowiedniej dlugosci, zeby ekstrakcja traktowala ten dokument jako pelny artykul i nie ucinala rich media fallbacku z metadanych wydawcy.</p>
              <p>Drugi akapit utrzymuje odpowiednia liczbe znakow oraz potwierdza, ze tresc pozostaje czytelna po wstrzyknieciu obrazu z og:image.</p>
              <figure>
                <img src="/images/chart.jpg" alt="Inline chart" />
                <figcaption>Chart caption</figcaption>
              </figure>
            </article>
          </body>
        </html>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertTrue(result.cleaned_html.startswith("<figure><img"))
        self.assertIn(
            '<img src="https://example.com/images/hero-2048x1365.jpg" alt="Hero image from metadata">',
            result.cleaned_html,
        )
        self.assertIn('<img src="https://example.com/images/chart.jpg" alt="Inline chart">', result.cleaned_html)
        self.assertIn("<figcaption>Chart caption</figcaption>", result.cleaned_html)
        self.assertIn("Lead akapit", result.content_text or "")
        self.assertIn("Drugi akapit", result.content_text or "")

    def test_prepare_document_strips_elevenlabs_widget_noise_from_cleaned_output(self) -> None:
        html = """
        <html>
          <head>
            <meta property="og:image" content="/images/hero.jpg" />
          </head>
          <body>
            <article>
              <section>
                <ol>
                  <li>Pierwszy punkt streszczenia.</li>
                  <li>Drugi punkt streszczenia.</li>
                </ol>
              </section>
              <div
                id="elevenlabs-audionative-widget"
                data-playerurl="https://elevenlabs.io/player/index.html"
                data-projectid="project"
              >
                Loading the <a href="https://elevenlabs.io/text-to-speech">Elevenlabs Text to Speech</a>
                AudioNative Player...
              </div>
              <p>Pelny akapit artykulu o odpowiedniej dlugosci, ktory powinien pozostac w cleaned output bez szumu pochodzacego od widgetu audio wydawcy.</p>
              <p>Drugi akapit potwierdza, ze excerpt i content_text budowane sa z czytelnej tresci redakcyjnej, a nie z placeholdera playera.</p>
            </article>
          </body>
        </html>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn('<img src="https://example.com/images/hero.jpg">', result.cleaned_html)
        self.assertNotIn("Elevenlabs", result.cleaned_html)
        self.assertNotIn("AudioNative Player", result.cleaned_html)
        self.assertNotIn("Elevenlabs", result.content_text or "")
        self.assertNotIn("AudioNative Player", result.content_text or "")
        self.assertNotIn("Elevenlabs", result.excerpt or "")
        self.assertIn("Pelny akapit artykulu", result.content_text or "")

    def test_prepare_document_removes_related_chrome_and_promo_noise_while_preserving_editorial_media(self) -> None:
        html = """
        <html>
          <head>
            <title>Premium cleanup story</title>
            <meta property="og:title" content="Premium cleanup story" />
            <meta property="og:image" content="/images/hero-2048x1365.jpg" />
            <meta property="og:image:alt" content="Metadata hero" />
          </head>
          <body>
            <article>
              <header>
                <img src="/theme/icon-star.svg" alt="Theme badge" />
                <p>Header promo should not survive.</p>
              </header>
              <div id="piano-paywall" class="piano-experience-container">
                <p>Lead paragraph keeps the bounded content threshold language alive and proves premium cleanup preserves coherent editorial prose for the in-app reader.</p>
                <figure>
                  <img src="/images/editorial-photo.jpg" alt="Editorial photo" />
                  <figcaption>Editorial caption</figcaption>
                </figure>
                <figure>
                  <img src="/theme/icon-lightbulb.svg" alt="" />
                  <figcaption>Placeholder caption should not keep theme chrome alive.</figcaption>
                </figure>
                <div class="wp-content-text-raw">
                  <h2 data-video-title="true">Related video headline should not survive.</h2>
                </div>
                <div class="wp-content-part-video">
                  <div class="video-placeholder">Inline video chrome should not survive.</div>
                </div>
                <nav>
                  <a href="/related-story">Related story headline</a>
                  <img src="/theme/icon-star.svg" alt="Theme badge" />
                </nav>
                <div class="wp-content-part-teaser">
                  <a class="teaser-inline" href="/related-story-2">
                    <img src="/images/related-card.jpg" alt="Related card" />
                    <span>Second related teaser should not survive.</span>
                  </a>
                </div>
                <div class="teaser-inline">
                  <img role="presentation" src="/theme/pattern-divider.png" />
                </div>
                <div
                  id="elevenlabs-audionative-widget"
                  data-playerurl="https://elevenlabs.io/player/index.html"
                >
                  Loading the <a href="https://elevenlabs.io/text-to-speech">Elevenlabs Text to Speech</a>
                  AudioNative Player...
                </div>
                <div id="piano-post-content-1" class="piano-experience-container"></div>
                <footer>
                  <p>Footer promo CTA should not survive.</p>
                </footer>
                <p>Second editorial paragraph confirms the article still reads cleanly after related links, decorative chrome, and widget placeholders are removed from the cleaned output.</p>
              </div>
            </article>
          </body>
        </html>
        """

        result = prepare_document(
            html_source=html,
            fallback_text="Fallback title",
            base_url="https://example.com/posts/story",
        )

        self.assertIsNotNone(result.cleaned_html)
        self.assertIn(
            '<img src="https://example.com/images/hero-2048x1365.jpg" alt="Metadata hero">',
            result.cleaned_html,
        )
        self.assertIn(
            '<img src="https://example.com/images/editorial-photo.jpg" alt="Editorial photo">',
            result.cleaned_html,
        )
        self.assertIn("<figcaption>Editorial caption</figcaption>", result.cleaned_html)
        self.assertIn("Lead paragraph keeps the bounded content threshold language alive", result.content_text or "")
        self.assertIn("Second editorial paragraph confirms the article still reads cleanly", result.content_text or "")

        self.assert_fragments_absent(
            result.cleaned_html,
            "Related story headline",
            "Related video headline should not survive.",
            "Inline video chrome should not survive.",
            "Second related teaser should not survive.",
            "Header promo should not survive.",
            "Footer promo CTA should not survive.",
            "Elevenlabs",
            "AudioNative Player",
            "theme/icon-star.svg",
            "Theme badge",
            "related-card.jpg",
            "icon-lightbulb.svg",
            "pattern-divider.png",
        )
        self.assert_fragments_absent(
            result.content_text,
            "Related story headline",
            "Related video headline should not survive.",
            "Inline video chrome should not survive.",
            "Second related teaser should not survive.",
            "Header promo should not survive.",
            "Footer promo CTA should not survive.",
            "Elevenlabs",
            "AudioNative Player",
            "Theme badge",
        )
        self.assert_fragments_absent(
            result.excerpt,
            "Related story headline",
            "Related video headline should not survive.",
            "Inline video chrome should not survive.",
            "Second related teaser should not survive.",
            "Header promo should not survive.",
            "Footer promo CTA should not survive.",
            "Elevenlabs",
            "AudioNative Player",
        )


if __name__ == "__main__":
    unittest.main()
