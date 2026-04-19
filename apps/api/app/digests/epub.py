from __future__ import annotations

from datetime import UTC, datetime
from html import escape
import io
import re
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

STYLE_CSS = """body {
  font-family: serif;
  margin: 0;
  padding: 0;
  line-height: 1.45;
  color: #111111;
}
h1, h2, h3 {
  font-family: serif;
  font-weight: bold;
  line-height: 1.2;
  margin: 0 0 0.6em;
}
h1 {
  font-size: 1.8em;
}
h2 {
  font-size: 1.3em;
  margin-top: 1.5em;
}
h3 {
  font-size: 1.1em;
  margin-top: 1.2em;
}
p {
  margin: 0 0 0.9em;
  text-align: justify;
}
.book {
  padding: 1.2em 1em 2em;
}
.meta {
  color: #555555;
  font-size: 0.9em;
  margin: 0 0 1em;
}
.toc-list {
  list-style: none;
  margin: 1em 0 0;
  padding: 0;
}
.toc-list li {
  margin: 0 0 0.6em;
}
a {
  color: #111111;
  text-decoration: none;
}
.article {
  page-break-before: always;
}
.source {
  font-size: 0.9em;
  margin-top: 1.2em;
}
"""

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def build_epub_bytes(
    *,
    digest_id: str,
    title: str,
    author_label: str,
    generated_at: str,
    groups: list[dict[str, object]],
    period_start: str | None,
    period_end: str | None,
) -> bytes:
    buffer = io.BytesIO()

    documents: list[tuple[str, str, str]] = [
        ("intro", "Digest Overview", build_intro_document(title=title, generated_at=generated_at, groups=groups)),
    ]

    for group_index, group in enumerate(groups, start=1):
        category = str(group["category"])
        documents.append(
            (
                f"cat-{group_index}",
                category,
                build_category_document(
                    title=title,
                    category=category,
                    items=list(group["items"]),
                ),
            )
        )

    manifest_items = [
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="style" href="styles.css" media-type="text/css"/>',
    ]
    spine_items = []
    nav_points = []

    for play_order, (doc_id, label, _) in enumerate(documents, start=1):
        manifest_items.append(f'<item id="{doc_id}" href="{doc_id}.xhtml" media-type="application/xhtml+xml"/>')
        spine_items.append(f'<itemref idref="{doc_id}"/>')
        nav_points.append(
            f"""
            <navPoint id="{doc_id}" playOrder="{play_order}">
              <navLabel><text>{xml_escape(label)}</text></navLabel>
              <content src="{doc_id}.xhtml"/>
            </navPoint>
            """.strip()
        )

    content_opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>{xml_escape(title)}</dc:title>
    <dc:creator opf:role="aut">{xml_escape(author_label)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:rssmaster:{xml_escape(digest_id)}</dc:identifier>
    <dc:date>{xml_escape(generated_at)}</dc:date>
    <dc:publisher>rssmaster</dc:publisher>
    <dc:description>{xml_escape(build_description(period_start=period_start, period_end=period_end))}</dc:description>
  </metadata>
  <manifest>
    {' '.join(manifest_items)}
  </manifest>
  <spine toc="ncx">
    {' '.join(spine_items)}
  </spine>
</package>
"""

    toc_ncx = f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:rssmaster:{xml_escape(digest_id)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{xml_escape(title)}</text></docTitle>
  <navMap>
    {' '.join(nav_points)}
  </navMap>
</ncx>
"""

    with ZipFile(buffer, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        archive.writestr(
            "META-INF/container.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
""",
            compress_type=ZIP_DEFLATED,
        )
        archive.writestr("OEBPS/content.opf", content_opf, compress_type=ZIP_DEFLATED)
        archive.writestr("OEBPS/toc.ncx", toc_ncx, compress_type=ZIP_DEFLATED)
        archive.writestr("OEBPS/styles.css", STYLE_CSS, compress_type=ZIP_DEFLATED)
        for doc_id, _, content in documents:
            archive.writestr(f"OEBPS/{doc_id}.xhtml", content, compress_type=ZIP_DEFLATED)

    return buffer.getvalue()


def build_intro_document(*, title: str, generated_at: str, groups: list[dict[str, object]]) -> str:
    total_articles = sum(int(group["article_count"]) for group in groups)
    toc_items = "".join(
        f'<li><a href="cat-{index}.xhtml">{escape(str(group["category"]))} ({int(group["article_count"])})</a></li>'
        for index, group in enumerate(groups, start=1)
    )
    generated_label = format_timestamp(generated_at)
    return wrap_document(
        title=title,
        body=f"""
        <section class="book">
          <h1>{escape(title)}</h1>
          <p class="meta">Generated {escape(generated_label)} with {total_articles} article(s).</p>
          <h2>Contents</h2>
          <ol class="toc-list">{toc_items}</ol>
        </section>
        """,
    )


def build_category_document(*, title: str, category: str, items: list[dict[str, object]]) -> str:
    article_markup = "".join(build_article_markup(item) for item in items)
    return wrap_document(
        title=f"{title} - {category}",
        body=f"""
        <section class="book">
          <h1>{escape(category)}</h1>
          <p class="meta">{len(items)} article(s)</p>
          {article_markup}
        </section>
        """,
    )


def build_article_markup(item: dict[str, object]) -> str:
    title = escape(str(item["title"]))
    author = escape(str(item["author"])) if item.get("author") else None
    channel = escape(str(item["channel_title"]))
    published_at = format_timestamp(item.get("published_at"))
    excerpt = escape(str(item["excerpt"])) if item.get("excerpt") else None
    body = str(item["content_html"])
    meta_parts = [channel]
    if author:
        meta_parts.append(author)
    if published_at:
        meta_parts.append(published_at)
    meta_line = " | ".join(meta_parts)
    excerpt_markup = f"<p><strong>Summary:</strong> {excerpt}</p>" if excerpt else ""
    return f"""
    <article class="article">
      <h2>{title}</h2>
      <p class="meta">{meta_line}</p>
      {excerpt_markup}
      {body}
      <p class="source">Source: <a href="{escape(str(item['source_url']))}">{escape(str(item['source_url']))}</a></p>
    </article>
    """


def wrap_document(*, title: str, body: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <title>{escape(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>{body}</body>
</html>
"""


def html_fragment_from_text(text: str) -> str:
    paragraphs = [
        f"<p>{escape(paragraph)}</p>"
        for paragraph in split_paragraphs(text)
        if paragraph
    ]
    if not paragraphs:
        return "<p>No readable content was available, so rssmaster kept the article metadata only.</p>"
    return "".join(paragraphs)


def html_fragment_from_markup(markup: str) -> str:
    text = WHITESPACE_RE.sub(" ", TAG_RE.sub(" ", markup)).strip()
    return html_fragment_from_text(text)


def split_paragraphs(text: str) -> list[str]:
    return [paragraph.strip() for paragraph in re.split(r"\n{2,}", text) if paragraph.strip()]


def format_timestamp(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return value
    return parsed.strftime("%Y-%m-%d %H:%M UTC")


def build_description(*, period_start: str | None, period_end: str | None) -> str:
    start_label = format_timestamp(period_start) or "n/a"
    end_label = format_timestamp(period_end) or "n/a"
    return f"rssmaster digest covering {start_label} to {end_label}"


def xml_escape(value: str) -> str:
    return escape(value, quote=True)
