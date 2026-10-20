from __future__ import annotations

from pathlib import Path
from typing import Any

from .forms import CERT_TEMPLATE, USPS_3665_TEMPLATE, USPS_TEMPLATE
from .overlay import Template

TEMPLATES = {
    CERT_TEMPLATE.name: CERT_TEMPLATE,
    USPS_TEMPLATE.name: USPS_TEMPLATE,
    USPS_3665_TEMPLATE.name: USPS_3665_TEMPLATE,
}

GRID_STEP = 36.0
MINOR_STEP = 9.0
GRID_COLOR = (0.0, 0.6, 1.0)
MINOR_COLOR = (0.78, 0.88, 0.96)
SLOT_COLOR = (0.0, 0.62, 0.28)
SIGNER_COLOR = (0.86, 0.32, 0.0)
CHECK_COLOR = (0.62, 0.0, 0.62)


def _open(template: Template) -> Any:
    import fitz

    blank: Any = fitz.open(template.source)
    doc: Any = fitz.open()
    try:
        if template.place is None:
            doc.insert_pdf(blank, from_page=0, to_page=0)
        else:
            page = doc.new_page(width=template.page_width, height=template.page_height)
            page.show_pdf_page(fitz.Rect(*template.place), blank, 0)
    finally:
        blank.close()
    return doc


def render_grid(name: str, out_png: Path | str, dpi: int = 150) -> Path:
    import fitz

    template = TEMPLATES[name]
    doc = _open(template)
    page = doc[0]
    width, height = page.rect.width, page.rect.height
    x = 0.0
    while x <= width:
        page.draw_line(fitz.Point(x, 0), fitz.Point(x, height), color=MINOR_COLOR, width=0.15)
        x += MINOR_STEP
    y = 0.0
    while y <= height:
        page.draw_line(fitz.Point(0, y), fitz.Point(width, y), color=MINOR_COLOR, width=0.15)
        y += MINOR_STEP
    x = 0.0
    while x <= width:
        page.draw_line(fitz.Point(x, 0), fitz.Point(x, height), color=GRID_COLOR, width=0.3)
        page.insert_text(fitz.Point(x + 1, 8), str(int(x)), fontname="cour", fontsize=5, color=GRID_COLOR)
        x += GRID_STEP
    y = 0.0
    while y <= height:
        page.draw_line(fitz.Point(0, y), fitz.Point(width, y), color=GRID_COLOR, width=0.3)
        page.insert_text(fitz.Point(1, y - 1), str(int(y)), fontname="cour", fontsize=5, color=GRID_COLOR)
        y += GRID_STEP
    for slot in template.slots:
        color = SIGNER_COLOR if slot.signer else SLOT_COLOR
        page.draw_rect(
            fitz.Rect(slot.x, slot.baseline - slot.size, slot.x + slot.width, slot.baseline + 1.5),
            color=color,
            width=0.5,
        )
        page.insert_text(
            fitz.Point(slot.x, slot.baseline - slot.size - 0.8), slot.key, fontname="cour", fontsize=3.6, color=color
        )
    for box in template.checks:
        color = SIGNER_COLOR if box.signer else CHECK_COLOR
        page.draw_circle(fitz.Point(box.cx, box.cy), 3.4, color=color, width=0.5)
    out = Path(out_png)
    out.parent.mkdir(parents=True, exist_ok=True)
    page.get_pixmap(dpi=dpi).save(out)
    doc.close()
    return out


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="pcs-calibrate")
    parser.add_argument("--form", choices=sorted(TEMPLATES), required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args(argv)
    print(render_grid(args.form, args.out, args.dpi))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
