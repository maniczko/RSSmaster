from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from html.parser import HTMLParser
import re
from typing import Iterable, Mapping
from urllib.parse import urlparse

WHITESPACE_RE = re.compile(r"\s+")
VOID_TAGS = frozenset({"area", "br", "hr", "img", "source", "wbr"})
BLOCKED_TAGS = frozenset({"script", "style", "iframe", "object", "embed", "template"})


@dataclass(slots=True, frozen=True)
class HtmlSanitizationPolicy:
    allowed_tags: frozenset[str]
    allowed_attributes: dict[str, frozenset[str]]
    allowed_url_schemes: frozenset[str] = frozenset({"http", "https", "mailto"})
    blocked_tags: frozenset[str] = BLOCKED_TAGS
    allow_relative_urls: bool = False
    unwrap_disallowed_tags: bool = True
    max_output_length: int | None = None

    @classmethod
    def create(
        cls,
        *,
        allowed_tags: Iterable[str],
        allowed_attributes: Mapping[str, Iterable[str]],
        allowed_url_schemes: Iterable[str] = ("http", "https", "mailto"),
        blocked_tags: Iterable[str] = BLOCKED_TAGS,
        allow_relative_urls: bool = False,
        unwrap_disallowed_tags: bool = True,
        max_output_length: int | None = None,
    ) -> "HtmlSanitizationPolicy":
        return cls(
            allowed_tags=frozenset(tag.lower() for tag in allowed_tags),
            allowed_attributes={
                tag.lower(): frozenset(attribute.lower() for attribute in attributes)
                for tag, attributes in allowed_attributes.items()
            },
            allowed_url_schemes=frozenset(scheme.lower() for scheme in allowed_url_schemes),
            blocked_tags=frozenset(tag.lower() for tag in blocked_tags),
            allow_relative_urls=allow_relative_urls,
            unwrap_disallowed_tags=unwrap_disallowed_tags,
            max_output_length=max_output_length,
        )


@dataclass(slots=True, frozen=True)
class SanitizationResult:
    html: str
    text: str
    removed_tags: tuple[str, ...] = field(default_factory=tuple)
    removed_attributes: tuple[str, ...] = field(default_factory=tuple)
    truncated: bool = False


READER_HTML_POLICY = HtmlSanitizationPolicy.create(
    allowed_tags=(
        "a",
        "article",
        "blockquote",
        "br",
        "code",
        "div",
        "em",
        "figcaption",
        "figure",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "img",
        "li",
        "ol",
        "p",
        "pre",
        "section",
        "span",
        "strong",
        "ul",
    ),
    allowed_attributes={
        "*": ("lang", "title"),
        "a": ("href", "title"),
        "img": ("alt", "src", "title"),
    },
    allow_relative_urls=False,
    max_output_length=300_000,
)


DIGEST_HTML_POLICY = HtmlSanitizationPolicy.create(
    allowed_tags=(
        "a",
        "blockquote",
        "br",
        "code",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "li",
        "ol",
        "p",
        "pre",
        "strong",
        "ul",
    ),
    allowed_attributes={
        "*": ("lang", "title"),
        "a": ("href", "title"),
    },
    allow_relative_urls=False,
    max_output_length=180_000,
)


class _HtmlPolicySanitizer(HTMLParser):
    def __init__(self, policy: HtmlSanitizationPolicy) -> None:
        super().__init__(convert_charrefs=True)
        self.policy = policy
        self.output: list[str] = []
        self.output_length = 0
        self.open_tags: list[str] = []
        self.removed_tags: list[str] = []
        self.removed_attributes: list[str] = []
        self._blocked_depth = 0
        self._truncated = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()

        if normalized_tag in self.policy.blocked_tags:
            self.removed_tags.append(normalized_tag)
            self._blocked_depth += 1
            return

        if self._blocked_depth > 0:
            return

        if normalized_tag not in self.policy.allowed_tags:
            self.removed_tags.append(normalized_tag)
            return

        sanitized_attrs = self._sanitize_attrs(normalized_tag, attrs)
        serialized_attrs = "".join(
            f' {name}="{escape(value, quote=True)}"' if value else f" {name}"
            for name, value in sanitized_attrs
        )
        if normalized_tag in VOID_TAGS:
            self._append(f"<{normalized_tag}{serialized_attrs}>")
            return

        self._append(f"<{normalized_tag}{serialized_attrs}>")
        self.open_tags.append(normalized_tag)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()

        if normalized_tag in self.policy.blocked_tags:
            if self._blocked_depth > 0:
                self._blocked_depth -= 1
            return

        if self._blocked_depth > 0 or normalized_tag in VOID_TAGS:
            return

        if not self.open_tags or self.open_tags[-1] != normalized_tag:
            return

        self.open_tags.pop()
        self._append(f"</{normalized_tag}>")

    def handle_data(self, data: str) -> None:
        if self._blocked_depth > 0 or not data:
            return
        self._append(escape(data))

    def handle_entityref(self, name: str) -> None:
        self.handle_data(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.handle_data(f"&#{name};")

    def close(self) -> None:
        super().close()
        while self.open_tags:
            self._append(f"</{self.open_tags.pop()}>")

    def result(self) -> SanitizationResult:
        html_output = "".join(self.output)
        text_output = sanitize_text_excerpt(html_output, max_length=None)
        return SanitizationResult(
            html=html_output,
            text=text_output,
            removed_tags=tuple(self.removed_tags),
            removed_attributes=tuple(self.removed_attributes),
            truncated=self._truncated,
        )

    def _sanitize_attrs(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> list[tuple[str, str | None]]:
        allowed = set(self.policy.allowed_attributes.get("*", ()))
        allowed.update(self.policy.allowed_attributes.get(tag, ()))
        sanitized: list[tuple[str, str | None]] = []

        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            if name.startswith("on") or name == "style":
                self.removed_attributes.append(f"{tag}.{name}")
                continue
            if name not in allowed:
                self.removed_attributes.append(f"{tag}.{name}")
                continue

            value = (raw_value or "").strip()
            if name in {"href", "src"}:
                normalized_value = _normalize_url(
                    value,
                    allowed_schemes=self.policy.allowed_url_schemes,
                    allow_relative_urls=self.policy.allow_relative_urls,
                )
                if normalized_value is None:
                    self.removed_attributes.append(f"{tag}.{name}")
                    continue
                value = normalized_value

            sanitized.append((name, value or None))

        return sanitized

    def _append(self, value: str) -> None:
        if not value or self._truncated:
            return

        if self.policy.max_output_length is not None and self.output_length + len(value) > self.policy.max_output_length:
            remaining = max(0, self.policy.max_output_length - self.output_length)
            if remaining > 0 and not value.startswith("<"):
                snippet = value[:remaining]
                self.output.append(snippet)
                self.output_length += len(snippet)
            self._truncated = True
            return

        self.output.append(value)
        self.output_length += len(value)


def sanitize_html_fragment(
    raw_html: str | None,
    *,
    policy: HtmlSanitizationPolicy = READER_HTML_POLICY,
) -> SanitizationResult:
    if not raw_html:
        return SanitizationResult(html="", text="")

    sanitizer = _HtmlPolicySanitizer(policy)
    sanitizer.feed(raw_html)
    sanitizer.close()
    return sanitizer.result()


def sanitize_text_excerpt(value: str | None, *, max_length: int | None = 280) -> str:
    normalized = WHITESPACE_RE.sub(" ", re.sub(r"<[^>]+>", " ", value or "")).strip()
    if max_length is None or len(normalized) <= max_length:
        return normalized
    if max_length <= 1:
        return normalized[:max_length]
    return normalized[: max_length - 1].rstrip() + "..."


def _normalize_url(
    value: str,
    *,
    allowed_schemes: frozenset[str],
    allow_relative_urls: bool,
) -> str | None:
    if not value:
        return None

    parsed = urlparse(value)
    if not parsed.scheme:
        return value if allow_relative_urls and not value.startswith("//") else None
    if parsed.scheme.lower() not in allowed_schemes:
        return None
    return value
