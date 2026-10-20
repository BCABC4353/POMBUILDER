from __future__ import annotations

from datetime import date
from pathlib import Path

from . import geometry as g
from .mapping import NEVER_PRINT, JudgmentLeak, PacketData

OBS_TITLE = "CREW-DOCUMENTED OBSERVATIONS FROM THE PATIENT CARE REPORT - CONTEXT ONLY, NOT A CERTIFICATION"
OBS_NOTE = (
    "Transcribed from what the ambulance crew wrote. No one has reviewed, adopted or attested to any of it, and it is "
    "not part of the certification. Do not sign in reliance on this block. Section II of the certification statement "
    "must be answered in your own words."
)
FORCED_STAMP = "BUILT WITHOUT A COMPLETE BENEFICIARY IDENTITY - GENERATED WITH --force"

_CONT_TOP = 116.0
_CONT_NOTE_ROWS: tuple[float, ...] = (88.0, 97.0, 106.0)


def _continuation_capacity() -> int:
    return int((g.CONTENT_BOTTOM - _CONT_TOP) / g.OBS_STEP) + 1


def _wrapped(text: str, x: float, rows: tuple[float, ...], size: float, width: float, font: str = g.FONT_VALUE):
    lines = g.wrap_chars(text, g.chars_across(width, size))
    if len(lines) > len(rows):
        raise g.LayoutOverflow(f"{len(lines)} lines do not fit {len(rows)} rows: {text[:60]!r}")
    return [g.Text(x, rows[i], line, font, size) for i, line in enumerate(lines)]


def observation_lines(data: PacketData) -> list[str]:
    width = g.observation_width()
    lines: list[str] = []
    for observation in data.observations:
        if observation.source in NEVER_PRINT:
            raise JudgmentLeak(f"{observation.source} is a pipeline judgment and may not print on a certification")
        head = f"{observation.label}: {observation.text}"
        wrapped = g.wrap_chars(head, width)
        lines.extend(wrapped[:1])
        lines.extend(f"  {part}" for part in wrapped[1:])
    return lines


def build_observations(
    data: PacketData,
    reference: str = "",
    generated_on: date | None = None,
) -> g.Document | None:
    all_lines = observation_lines(data)
    if not all_lines:
        return None
    stamp = (generated_on or date.today()).isoformat()
    label = reference or data.values.get("claim_ref") or data.values.get("patient_name", "")
    capacity = _continuation_capacity()
    chunks: list[list[str]] = []
    remaining = all_lines
    while remaining:
        chunks.append(remaining[:capacity])
        remaining = remaining[capacity:]
    pages = tuple(
        _observation_page(chunk, label, stamp, index, len(chunks), data.forced_incomplete)
        for index, chunk in enumerate(chunks, start=1)
    )
    document = g.Document(name="crew_observations", title=OBS_TITLE, pages=pages)
    g.assert_fits(document)
    return document


def _observation_page(
    lines: list[str],
    reference: str,
    stamp: str,
    page_number: int,
    total_pages: int,
    forced: bool = False,
) -> g.Page:
    ops: list[g.Op] = [
        g.Text(g.MARGIN_X, g.R_TITLE, OBS_TITLE, g.FONT_BOLD, g.SIZE_NOTE),
        g.Rule(g.MARGIN_X, g.R_HEAD_RULE - 18.0, g.CONTENT_RIGHT, 1.1),
    ]
    ops.extend(_wrapped(OBS_NOTE, g.MARGIN_X, _CONT_NOTE_ROWS, g.SIZE_NOTE, g.CONTENT_WIDTH))
    for index, line in enumerate(lines[: _continuation_capacity()]):
        ops.append(g.Text(g.MARGIN_X, _CONT_TOP + index * g.OBS_STEP, line, g.FONT_VALUE, g.SIZE_OBS))
    if forced:
        ops.append(g.Text(g.MARGIN_X, g.R_FORCED_STAMP, FORCED_STAMP, g.FONT_BOLD, g.SIZE_NOTE))
    ops.append(
        g.Text(
            g.MARGIN_X,
            g.FOOTER_BASELINE,
            f"crew observations  |  {reference}  |  prepared {stamp}  |  page {page_number} of {total_pages}",
            g.FONT_VALUE,
            g.SIZE_NOTE,
        )
    )
    return g.Page(tuple(ops))


def render_text(document: g.Document) -> str:
    sheets: list[str] = []
    for page in document.pages:
        grid = [[" "] * g.TEXT_COLS for _ in range(g.TEXT_ROWS)]

        def put(row: int, col: int, text: str, cells=grid) -> None:
            if row < 0 or row >= g.TEXT_ROWS:
                return
            for offset, char in enumerate(text):
                index = col + offset
                if 0 <= index < g.TEXT_COLS:
                    cells[row][index] = char

        for op in page.ops:
            if isinstance(op, g.Text):
                put(_row(op.baseline), _col(op.x), op.text)
            elif isinstance(op, g.Rule):
                put(_row(op.y), _col(op.x0), "-" * max(1, _col(op.x1) - _col(op.x0)))
            elif isinstance(op, g.Frame):
                width = max(2, _col(op.x1) - _col(op.x0))
                put(_row(op.y0), _col(op.x0), "+" + "-" * (width - 2) + "+")
                put(_row(op.y1), _col(op.x0), "+" + "-" * (width - 2) + "+")
                for row in range(_row(op.y0) + 1, _row(op.y1)):
                    put(row, _col(op.x0), "|")
                    put(row, _col(op.x0) + width - 1, "|")
            elif isinstance(op, g.Field):
                put(_row(op.baseline - g.LABEL_RISE), _col(op.x), f"{op.label}:")
                span = max(1, _col(op.x + op.width) - _col(op.x) - 1)
                put(_row(op.baseline), _col(op.x) + 1, op.value[:span] if op.value else "_" * span)
        sheets.append("\n".join("".join(row).rstrip() for row in grid).rstrip())
    return ("\n" + "=" * g.TEXT_COLS + "\n").join(sheets)


def _row(y: float) -> int:
    return int(y / (g.PAGE_HEIGHT / g.TEXT_ROWS))


def _col(x: float) -> int:
    return int(x / (g.PAGE_WIDTH / g.TEXT_COLS))


def build_doc(document: g.Document):
    from typing import Any

    import fitz

    from . import overlay

    doc: Any = fitz.Document()
    background = overlay.FORMS_DIR / document.background if document.background else None
    if background is not None and not background.exists():
        raise FileNotFoundError(f"letterhead missing: {background}")
    try:
        background_xref = 0
        for page_spec in document.pages:
            page = doc.new_page(width=g.PAGE_WIDTH, height=g.PAGE_HEIGHT)
            if background is not None:
                if background_xref:
                    page.insert_image(page.rect, xref=background_xref, overlay=False)
                else:
                    background_xref = page.insert_image(page.rect, filename=str(background), overlay=False)
            for op in page_spec.ops:
                if isinstance(op, g.Text):
                    page.insert_text(fitz.Point(op.x, op.baseline), op.text, fontname=op.font, fontsize=op.size)
                elif isinstance(op, g.Rule):
                    page.draw_line(fitz.Point(op.x0, op.y), fitz.Point(op.x1, op.y), width=op.width)
                elif isinstance(op, g.Frame):
                    page.draw_rect(fitz.Rect(op.x0, op.y0, op.x1, op.y1), width=op.width)
                elif isinstance(op, g.Field):
                    page.insert_text(
                        fitz.Point(op.x, op.baseline - g.LABEL_RISE),
                        op.label,
                        fontname=g.FONT_LABEL,
                        fontsize=g.SIZE_LABEL,
                    )
                    page.draw_line(
                        fitz.Point(op.x, op.baseline + g.UNDERLINE_DROP),
                        fitz.Point(op.x + op.width, op.baseline + g.UNDERLINE_DROP),
                        width=0.6,
                    )
                    if op.value:
                        page.insert_text(
                            fitz.Point(op.x + g.VALUE_INSET, op.baseline),
                            op.value,
                            fontname=g.FONT_VALUE,
                            fontsize=op.size,
                        )
    except Exception:
        doc.close()
        raise
    return doc


def render_pdf(document: g.Document, out_path: Path | str) -> Path:
    doc = build_doc(document)
    out = Path(out_path)
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        doc.save(out)
    finally:
        doc.close()
    return out
