// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderInlineHighlightHtml, sanitizeReaderHtml } from "@/app/lib/reader-html";

const CORPUS_CASES = [
  {
    id: "text-only",
    html: [
      "<p>Plain opening paragraph with enough additional prose to survive the reader cleanup heuristics.</p>",
      "<p>Second paragraph with <strong>bold</strong> and <em>italic</em> emphasis, plus a little more context for the corpus.</p>",
      "<h2>Section heading</h2>",
    ].join(""),
    title: "Text only story",
    assertions: (sanitized: string) => {
      expect(sanitized).toContain("Plain opening paragraph with enough additional prose");
      expect(sanitized).toContain("<strong>bold</strong>");
      expect(sanitized).toContain("<em>italic</em>");
      expect(sanitized).toContain("<h2>Section heading</h2>");
    },
  },
  {
    id: "hero-image",
    html: [
      '<figure><img src="https://example.com/hero.jpg" alt="Hero" /><figcaption>Hero caption</figcaption></figure>',
      "<p>Follow up paragraph.</p>",
    ].join(""),
    title: "Hero image",
    assertions: (sanitized: string) => {
      expect(sanitized).toContain('class="reader-article-figure"');
      expect(sanitized).toContain('class="reader-article-image"');
      expect(sanitized).toContain('class="reader-article-caption"');
      expect(sanitized).toContain('loading="lazy"');
      expect(sanitized).toContain('alt="Hero"');
      expect(sanitized).toContain("Hero caption");
    },
  },
  {
    id: "multi-image",
    html: [
      '<p>Gallery intro.</p>',
      '<figure><img src="https://example.com/one.jpg" alt="One" /></figure>',
      '<figure><img src="https://example.com/two.jpg" alt="Two" /></figure>',
      '<p>Gallery outro.</p>',
    ].join(""),
    title: "Gallery intro",
    assertions: (sanitized: string) => {
      expect((sanitized.match(/class="reader-article-figure"/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect((sanitized.match(/class="reader-article-image"/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(sanitized).toContain('alt="One"');
      expect(sanitized).toContain('alt="Two"');
    },
  },
  {
    id: "srcset-lazyload",
    html: [
      '<figure>',
      '<img src="/fallback.jpg" srcset="/small.jpg 480w, /large.jpg 960w" loading="lazy" data-src="/ignored.jpg" alt="Responsive hero" />',
      '<figcaption>Responsive caption</figcaption>',
      "</figure>",
      "<p>Responsive media copy.</p>",
    ].join(""),
    title: "Responsive hero",
    assertions: (sanitized: string) => {
      expect(sanitized).toContain('src="/fallback.jpg"');
      expect(sanitized).toContain('loading="lazy"');
      expect(sanitized).not.toContain("srcset=");
      expect(sanitized).not.toContain("data-src=");
      expect(sanitized).toContain('class="reader-article-caption"');
    },
  },
  {
    id: "noscript-fallback",
    html: [
      "<p>Above the fold.</p>",
      '<figure><noscript><img src="https://example.com/fallback.jpg" alt="No script fallback" /></noscript></figure>',
      "<p>Below the fold.</p>",
    ].join(""),
    title: "Above the fold",
    assertions: (sanitized: string) => {
      expect(sanitized).toContain('class="reader-article-figure"');
      expect(sanitized).not.toContain("<noscript");
      expect(sanitized).toContain('src="https://example.com/fallback.jpg"');
    },
  },
  {
    id: "malformed-noisy",
    html: [
      "<div><h2>Noise heading</h2>",
      "<p>Malformed noisy story intro.</p>",
      "<p>Broken <strong>tag<p>Still readable</p>",
      '<script>alert("xss")</script>',
      '<style>.evil{display:none}</style>',
      '<figure><img src="https://example.com/noisy.jpg" alt="Noisy" /></figure>',
      "<ul><li>First</li><li>Second",
      "<blockquote><p>Recovered quote</p></blockquote>",
      "</div>",
    ].join(""),
    title: "Reader Rich Story malformed-noisy corpus",
    assertions: (sanitized: string) => {
      expect(sanitized).toContain("Malformed noisy");
      expect(sanitized).toContain("Still readable");
      expect(sanitized).not.toContain("<script");
      expect(sanitized).not.toContain("<style");
      expect(sanitized).toContain('class="reader-article-image"');
      expect(sanitized).toContain('class="reader-article-quote"');
      expect(sanitized).toContain('<ul class="reader-article-list">');
    },
  },
];

describe("reader html helpers", () => {
  it.each(CORPUS_CASES)("keeps rich cleaned_html structure for $id", ({ html, title, assertions }) => {
    const sanitized = sanitizeReaderHtml(html, title);
    assertions(sanitized);
  });

  it("adds reader-safe hooks for standalone media, links, code blocks, and tables", () => {
    const html = [
      '<figure><img src="https://example.com/hero.jpg" alt="Hero" /><figcaption>Hero caption</figcaption></figure>',
      '<p>Visit <a href="https://example.com/article">the source</a>.</p>',
      "<pre><code>const answer = 42;</code></pre>",
      "<table><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table>",
    ].join("");

    const sanitized = sanitizeReaderHtml(html, "Reader article");

    expect(sanitized).toContain('<figure class="reader-article-figure">');
    expect(sanitized).toContain('class="reader-article-image"');
    expect(sanitized).toContain('loading="lazy"');
    expect(sanitized).toContain('class="reader-article-link"');
    expect(sanitized).toContain('class="reader-article-pre"');
    expect(sanitized).toContain('class="reader-article-table-shell"');
    expect(sanitized).toContain('class="reader-article-table"');
  });

  it("normalizes picture, lazy media attributes, and srcset into one stable image", () => {
    const html = [
      '<figure><picture><source srcset="https://example.com/hero-small.jpg 640w, https://example.com/hero-large.jpg 1600w" /><img src="data:image/gif;base64,abc" data-src="https://example.com/hero-data.jpg" alt="Hero picture" /></picture><figcaption>Hero caption</figcaption></figure>',
      '<p><img src="data:image/gif;base64,abc" data-original="https://example.com/inline.jpg" title="Inline title" /></p>',
      "<p>Tekst utrzymuje reader w meaningful mode mimo agresywnego lazy-load HTML.</p>",
    ].join("");

    const sanitized = sanitizeReaderHtml(html, "Reader article");

    expect(sanitized).toContain('<img src="https://example.com/hero-large.jpg" alt="Hero picture"');
    expect(sanitized).toContain('src="https://example.com/inline.jpg"');
    expect(sanitized).toContain('alt="Inline title"');
    expect(sanitized).toContain('title="Inline title"');
    expect(sanitized).not.toContain("data:image/gif");
    expect(sanitized).not.toContain("<picture");
    expect(sanitized).not.toContain("data-src");
    expect(sanitized).not.toContain("srcset=");
  });

  it("returns null when cleaned_html has no meaningful readable body", () => {
    const html = '<figure><img src="data:image/gif;base64,abc" data-src="" alt="" /></figure>';

    const sanitized = sanitizeReaderHtml(html, "Reader article");

    expect(sanitized).toBeNull();
  });

  it("uses caption text as fallback alt text when an image ships without alt", () => {
    const html = '<figure><img src="https://example.com/hero.jpg" /><figcaption>Hero caption</figcaption></figure>';

    const sanitized = sanitizeReaderHtml(html, "Reader article");

    expect(sanitized).toContain('alt="Hero caption"');
  });

  it("returns null for weak cleaned_html so the reader can fall back", () => {
    const html = "<p>Short teaser only.</p>";

    expect(sanitizeReaderHtml(html, "Short teaser only")).toBeNull();
  });

  it("highlights matched text without flattening images or formatting", () => {
    const html = [
      "<p>Start of the article with <strong>important phrase</strong> and context.</p>",
      '<figure><img src="https://example.com/diagram.png" alt="Diagram" /></figure>',
      "<blockquote><p>One more supporting sentence.</p></blockquote>",
    ].join("");

    const highlighted = renderInlineHighlightHtml(html, [
      { id: "ann-1", kind: "highlight", quote_text: "important phrase" },
    ]);

    expect(highlighted).toContain('mark class="reader-inline-highlight"');
    expect(highlighted).toContain('data-annotation-id="ann-1"');
    expect(highlighted).toContain('<strong><mark class="reader-inline-highlight" data-annotation-id="ann-1">important phrase</mark></strong>');
    expect(highlighted).toContain('<img src="https://example.com/diagram.png" alt="Diagram">');
    expect(highlighted).toContain("<blockquote>");
  });

  it("preserves a readable baseline for quote-heavy rich cleaned_html", () => {
    const html = [
      '<h2>Deep dive into cleaner feeds</h2>',
      '<p>Intro with <strong>bold</strong> and <em>italics</em>.</p>',
      '<figure><img src="https://example.com/hero.jpg" alt="Hero" /><figcaption>Hero caption</figcaption></figure>',
      '<blockquote><p>Relevant quote with <a href="https://example.com">source link</a>.</p></blockquote>',
      "<ul><li>First point</li><li>Second point</li></ul>",
    ].join("");

    const sanitized = sanitizeReaderHtml(html, "Deep dive into cleaner feeds");

    expect(sanitized).not.toContain("<h2>");
    expect(sanitized).toContain("<strong>bold</strong>");
    expect(sanitized).toContain("<em>italics</em>");
    expect(sanitized).toContain('class="reader-article-figure"');
    expect(sanitized).toContain('class="reader-article-image"');
    expect(sanitized).toContain('class="reader-article-caption"');
    expect(sanitized).toContain('class="reader-article-quote"');
    expect(sanitized).toContain('<ul class="reader-article-list"><li>First point</li><li>Second point</li></ul>');
  });
});
