from __future__ import annotations

from pathlib import Path
from typing import Any

from . import geometry as g
from . import overlay
from .overlay import Sheet
from .template import build_doc, render_text

Renderable = Sheet | g.Document


def name_of(item: Renderable) -> str:
    return item.name


def title_of(item: Renderable) -> str:
    return item.title


def page_count(item: Renderable) -> int:
    if isinstance(item, Sheet):
        return 1
    return len(item.pages)


def as_text(item: Renderable) -> str:
    if isinstance(item, Sheet):
        return overlay.render_text(item)
    return render_text(item)


def open_doc(item: Renderable) -> Any:
    if isinstance(item, Sheet):
        return overlay.render(item)
    return build_doc(item)


def write_one(item: Renderable, out_pdf: Path | str) -> Path:
    out = Path(out_pdf)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = open_doc(item)
    try:
        doc.save(out)
    finally:
        doc.close()
    return out


def write_all(
    items: tuple[Renderable, ...] | list[Renderable],
    out_dir: Path | str,
    stem: str,
    pdf: bool = True,
    text: bool = False,
) -> list[Path]:
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for item in items:
        base = f"{stem}_{name_of(item)}"
        if text:
            target = directory / f"{base}.txt"
            target.write_text(as_text(item), encoding="utf-8")
            written.append(target)
        if pdf:
            written.append(write_one(item, directory / f"{base}.pdf"))
    return written


def merge(items: tuple[Renderable, ...] | list[Renderable], out_pdf: Path | str) -> Path:
    import fitz

    out = Path(out_pdf)
    out.parent.mkdir(parents=True, exist_ok=True)
    merged: Any = fitz.open()
    try:
        for item in items:
            piece = open_doc(item)
            try:
                merged.insert_pdf(piece)
            finally:
                piece.close()
        merged.save(out)
    finally:
        merged.close()
    return out
