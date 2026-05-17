from __future__ import annotations

import io
import unittest
from zipfile import ZIP_STORED, ZipFile

from app.digests.epub import build_epub_bytes


class DigestEpubTests(unittest.TestCase):
    def test_epub_contains_kindle_ready_structure_and_article_toc(self) -> None:
        epub_bytes = build_epub_bytes(
            digest_id="dig_epub_test",
            title="RSSmaster Magazine Test",
            author_label="rssmaster",
            generated_at="2026-05-10T08:00:00Z",
            period_start="2026-05-01T00:00:00Z",
            period_end="2026-05-10T00:00:00Z",
            groups=[
                {
                    "category": "Technologia",
                    "article_count": 2,
                    "items": [
                        {
                            "title": "Pierwszy artykuł magazynu",
                            "author": "Autorka",
                            "channel_title": "Źródło A",
                            "published_at": "2026-05-10T07:00:00Z",
                            "excerpt": "Krótki opis pierwszego artykułu.",
                            "content_html": "<p>Pełna treść pierwszego artykułu.</p>",
                            "source_url": "https://example.com/one",
                        },
                        {
                            "title": "Drugi artykuł magazynu",
                            "author": None,
                            "channel_title": "Źródło B",
                            "published_at": "2026-05-09T07:00:00Z",
                            "excerpt": None,
                            "content_html": "<p>Pełna treść drugiego artykułu.</p>",
                            "source_url": "https://example.com/two",
                        },
                    ],
                }
            ],
        )

        with ZipFile(io.BytesIO(epub_bytes)) as archive:
            names = archive.namelist()
            self.assertEqual(names[0], "mimetype")
            self.assertEqual(archive.getinfo("mimetype").compress_type, ZIP_STORED)
            self.assertIn("META-INF/container.xml", names)
            self.assertIn("OEBPS/content.opf", names)
            self.assertIn("OEBPS/toc.ncx", names)
            self.assertIn("OEBPS/cat-1.xhtml", names)

            toc = archive.read("OEBPS/toc.ncx").decode("utf-8")
            chapter = archive.read("OEBPS/cat-1.xhtml").decode("utf-8")
            intro = archive.read("OEBPS/intro.xhtml").decode("utf-8")

        self.assertIn('<meta name="dtb:depth" content="2"/>', toc)
        self.assertIn("Pierwszy artykuł magazynu", toc)
        self.assertIn("cat-1.xhtml#article-1", toc)
        self.assertIn('id="article-1"', chapter)
        self.assertIn('id="article-2"', chapter)
        self.assertIn("cat-1.xhtml#article-2", intro)
        self.assertNotIn("<script", chapter.lower())


if __name__ == "__main__":
    unittest.main()
