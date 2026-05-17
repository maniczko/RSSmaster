from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re

SLUG_RE = re.compile(r"[^a-z0-9]+")


@dataclass(slots=True, frozen=True)
class SavedEditionArtifact:
    path: str
    sha256: str
    size_bytes: int


class EditionStorage:
    """Local-first archive for generated magazine/digest artifacts."""

    def __init__(self, artifact_root: Path) -> None:
        self.artifact_root = artifact_root

    def save_epub(self, *, edition_id: str, title: str, epub_bytes: bytes) -> SavedEditionArtifact:
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        artifact_path = self.artifact_root / f"{edition_id}-{slugify(title)}.epub"
        artifact_path.write_bytes(epub_bytes)
        return SavedEditionArtifact(
            path=str(artifact_path),
            sha256=sha256(epub_bytes).hexdigest(),
            size_bytes=len(epub_bytes),
        )


def slugify(value: str) -> str:
    normalized = SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return normalized or "digest"
