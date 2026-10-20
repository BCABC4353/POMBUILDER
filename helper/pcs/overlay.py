from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import geometry as g

FORMS_DIR = Path(__file__).resolve().parent.parent / "pcs forms"

SIZE_STEP = 0.25
SIZE_FLOOR = 5.4
CHECK_GLYPH = "X"

OWNER_SIGNER = "signer"
OWNER_CLERK = "usps_clerk"
OWNER_MAILER = "mailer"
OWNER_BILLING = "billing_office"


class SlotOverflow(ValueError):
    pass


class SignerRegion(RuntimeError):
    pass


@dataclass(frozen=True)
class Slot:
    key: str
    label: str
    x: float
    baseline: float
    width: float
    size: float = 8.0
    font: str = g.FONT_LABEL
    signer: bool = False


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    cx: float
    cy: float
    size: float = 7.0
    signer: bool = False


@dataclass(frozen=True)
class Blank:
    key: str
    label: str
    owner: str
    reason: str = ""


@dataclass(frozen=True)
class Template:
    name: str
    title: str
    filename: str
    slots: tuple[Slot, ...] = ()
    checks: tuple[Check, ...] = ()
    blanks: tuple[Blank, ...] = ()
    page_width: float = g.PAGE_WIDTH
    page_height: float = g.PAGE_HEIGHT
    place: tuple[float, float, float, float] | None = None
    terms: str = ""
    source_page: int = 0

    @property
    def source(self) -> Path:
        return FORMS_DIR / self.filename

    def slot(self, key: str) -> Slot:
        for slot in self.slots:
            if slot.key == key:
                return slot
        raise KeyError(f"{self.name} has no slot {key!r}")

    def check(self, key: str) -> Check:
        for box in self.checks:
            if box.key == key:
                return box
        raise KeyError(f"{self.name} has no checkbox {key!r}")


@dataclass(frozen=True)
class Sheet:
    name: str
    title: str
    template: Template
    values: dict[str, str] = field(default_factory=dict)
    sizes: dict[str, float] = field(default_factory=dict)
    checks: dict[str, bool] = field(default_factory=dict)
    extras: tuple[g.Text, ...] = ()
    covers: tuple[tuple[float, float, float, float], ...] = ()

    @property
    def pages(self) -> int:
        return 1


def fit(slot: Slot, value) -> tuple[str, float, str]:
    text = " ".join(g.ascii_safe(value).split())
    if not text:
        return "", slot.size, ""
    size = slot.size
    while size > SIZE_FLOOR and g.text_width(text, slot.font, size) > slot.width:
        size = round(size - SIZE_STEP, 2)
    if g.text_width(text, slot.font, size) <= slot.width:
        return text, size, ""
    trimmed = text
    while trimmed and g.text_width(trimmed + "...", slot.font, size) > slot.width:
        trimmed = trimmed[:-1]
    return (
        f"{trimmed}...",
        size,
        f"{slot.label} was too long for its line on the {slot.key} field and is printed truncated: {text}",
    )


class SheetBuilder:
    def __init__(self, template: Template, name: str | None = None, title: str | None = None):
        self.template = template
        self.name = name or template.name
        self.title = title or template.title
        self.values: dict[str, str] = {}
        self.sizes: dict[str, float] = {}
        self.checks: dict[str, bool] = {}
        self.extras: list[g.Text] = []
        self.covers: list[tuple[float, float, float, float]] = []
        self.notes: list[str] = []

    def set(self, key: str, value) -> None:
        slot = self.template.slot(key)
        if slot.signer:
            raise SignerRegion(f"{key} belongs to the person signing {self.template.name} and may not be prefilled")
        text, size, note = fit(slot, value)
        if not text:
            return
        self.values[key] = text
        self.sizes[key] = size
        if note and note not in self.notes:
            self.notes.append(note)

    def mark(self, key: str, on: bool = True) -> None:
        box = self.template.check(key)
        if box.signer:
            raise SignerRegion(f"{key} belongs to the person signing {self.template.name} and may not be prefilled")
        if on:
            self.checks[key] = True

    def tri(self, yes_key: str, no_key: str, state: str) -> None:
        if state == "Yes":
            self.mark(yes_key)
        elif state == "No":
            self.mark(no_key)

    def stamp(self, op: g.Text) -> None:
        self.extras.append(op)

    def cover(self, x0: float, y0: float, x1: float, y1: float) -> None:
        self.covers.append((x0, y0, x1, y1))

    def build(self) -> Sheet:
        return Sheet(
            name=self.name,
            title=self.title,
            template=self.template,
            values=dict(self.values),
            sizes=dict(self.sizes),
            checks=dict(self.checks),
            extras=tuple(self.extras),
            covers=tuple(self.covers),
        )


def render(sheet: Sheet, color: tuple[float, float, float] = (0.0, 0.0, 0.0)) -> Any:
    import fitz

    template = sheet.template
    source = template.source
    if not source.exists():
        raise FileNotFoundError(f"blank form missing: {source}")
    blank: Any = fitz.open(source)
    doc: Any = fitz.open()
    try:
        if template.source_page >= blank.page_count:
            raise IndexError(
                f"{template.name} expects page {template.source_page} of {template.filename}, "
                f"which holds {blank.page_count} page(s)"
            )
        if template.place is None:
            doc.insert_pdf(blank, from_page=template.source_page, to_page=template.source_page)
        else:
            page = doc.new_page(width=template.page_width, height=template.page_height)
            page.show_pdf_page(fitz.Rect(*template.place), blank, template.source_page)
    finally:
        blank.close()
    page = doc[0]
    for box in sheet.covers:
        page.draw_rect(fitz.Rect(*box), color=None, fill=(1.0, 1.0, 1.0))
    for key, text in sheet.values.items():
        slot = template.slot(key)
        size = sheet.sizes.get(key, slot.size)
        if g.text_width(text, slot.font, size) > slot.width + 0.5:
            doc.close()
            raise SlotOverflow(f"{template.name} slot {key} is {slot.width:.1f}pt wide, {text!r} does not fit")
        page.insert_text(fitz.Point(slot.x, slot.baseline), text, fontname=slot.font, fontsize=size, color=color)
    for key, on in sheet.checks.items():
        if not on:
            continue
        box = template.check(key)
        width = g.text_width(CHECK_GLYPH, g.FONT_BOLD, box.size)
        page.insert_text(
            fitz.Point(box.cx - width / 2, box.cy + box.size * 0.36),
            CHECK_GLYPH,
            fontname=g.FONT_BOLD,
            fontsize=box.size,
            color=color,
        )
    for op in sheet.extras:
        page.insert_text(fitz.Point(op.x, op.baseline), op.text, fontname=op.font, fontsize=op.size, color=color)
    return doc


def render_text(sheet: Sheet) -> str:
    template = sheet.template
    lines = [f"{template.title}  [{template.filename}]"]
    if template.terms:
        lines.append(template.terms)
    lines.append("")
    for slot in template.slots:
        if slot.signer:
            continue
        value = sheet.values.get(slot.key, "")
        lines.append(f"  {slot.label:52s} {value or '-'}")
    printed = [template.check(key).label for key, on in sheet.checks.items() if on]
    if printed:
        lines.append("")
        lines.append("  checked: " + "; ".join(sorted(printed)))
    if template.blanks:
        lines.append("")
        lines.append("  left blank on purpose:")
        for blank in template.blanks:
            tail = f" - {blank.reason}" if blank.reason else ""
            lines.append(f"    [{blank.owner}] {blank.label}{tail}")
    for op in sheet.extras:
        if op.text.strip():
            lines.append(f"  {op.text}")
    return "\n".join(lines)
