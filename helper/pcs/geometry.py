from __future__ import annotations

from dataclasses import dataclass

PAGE_WIDTH = 612.0
PAGE_HEIGHT = 792.0
MARGIN_X = 54.0
MARGIN_TOP = 54.0
MARGIN_BOTTOM = 54.0
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X
CONTENT_RIGHT = MARGIN_X + CONTENT_WIDTH

FONT_LABEL = "helv"
FONT_BOLD = "hebo"
FONT_VALUE = "cour"
FONT_VALUE_BOLD = "cobo"

SIZE_TITLE = 14.0
SIZE_SECTION = 9.0
SIZE_LABEL = 6.6
SIZE_VALUE = 9.0
SIZE_VALUE_MIN = 6.4
SIZE_VALUE_STEP = 0.4
SIZE_NOTE = 7.4
SIZE_OBS = 7.4
SIZE_CITE = 7.5
SIZE_BODY = 8.5

CHAR_FACTOR = 0.6

COL_LEFT = MARGIN_X
COL_RIGHT = MARGIN_X + 258.0
HALF_WIDTH = 246.0
FULL_WIDTH = CONTENT_WIDTH

LABEL_RISE = 9.5
VALUE_INSET = 1.5
UNDERLINE_DROP = 3.0

R_TITLE = 68.0
R_CITE1 = 80.0
R_CITE2 = 89.0
R_HEAD_RULE = 94.0

OBS_STEP = 9.6
OBS_INSET = 8.0

CONTENT_BOTTOM = 738.0
FOOTER_BASELINE = 772.0
R_FORCED_STAMP = 762.0

TEXT_COLS = 136
TEXT_ROWS = 88
TEXT_COL_WIDTH = PAGE_WIDTH / TEXT_COLS
TEXT_ROW_HEIGHT = PAGE_HEIGHT / TEXT_ROWS


def char_width(size: float) -> float:
    return CHAR_FACTOR * size


def chars_across(span: float, size: float) -> int:
    return max(1, int(span / char_width(size)))


_ASCII_MAP = {
    "\u2014": "-",
    "\u2013": "-",
    "\u2012": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u2022": "*",
    "\u00a0": " ",
    "\u00ad": "",
    "\u00b0": " deg",
    "\u00b5": "u",
    "\u2260": "!=",
    "\u2265": ">=",
    "\u2264": "<=",
}


def ascii_safe(value) -> str:
    text = "" if value is None else str(value)
    for source, target in _ASCII_MAP.items():
        text = text.replace(source, target)
    return "".join(char if 32 <= ord(char) < 127 or 160 <= ord(char) < 256 else "?" for char in text)


def wrap_chars(value, limit: int) -> list[str]:
    text = " ".join(ascii_safe(value).split())
    if not text:
        return []
    if limit <= 0:
        return [text]
    lines: list[str] = []
    current = ""
    for word in text.split(" "):
        piece = word
        while len(piece) > limit:
            if current:
                lines.append(current)
                current = ""
            lines.append(piece[:limit])
            piece = piece[limit:]
        if not current:
            current = piece
        elif len(current) + 1 + len(piece) <= limit:
            current = f"{current} {piece}"
        else:
            lines.append(current)
            current = piece
    if current:
        lines.append(current)
    return lines


@dataclass(frozen=True)
class Text:
    x: float
    baseline: float
    text: str
    font: str = FONT_LABEL
    size: float = SIZE_NOTE

    def __post_init__(self) -> None:
        object.__setattr__(self, "text", ascii_safe(self.text))


@dataclass(frozen=True)
class Rule:
    x0: float
    y: float
    x1: float
    width: float = 0.5


@dataclass(frozen=True)
class Frame:
    x0: float
    y0: float
    x1: float
    y1: float
    width: float = 0.9


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    x: float
    baseline: float
    width: float
    value: str = ""
    blank: bool = False
    size: float = SIZE_VALUE

    def __post_init__(self) -> None:
        object.__setattr__(self, "label", ascii_safe(self.label))
        object.__setattr__(self, "value", ascii_safe(self.value))

    @property
    def capacity(self) -> int:
        return chars_across(self.width - VALUE_INSET, self.size)


@dataclass(frozen=True)
class Picture:
    x0: float
    y0: float
    x1: float
    y1: float
    filename: str


Op = Text | Rule | Frame | Field | Picture


@dataclass(frozen=True)
class Page:
    ops: tuple[Op, ...]


@dataclass(frozen=True)
class Document:
    name: str
    title: str
    pages: tuple[Page, ...]
    background: str = ""


def observation_width() -> int:
    return chars_across(CONTENT_WIDTH - 2 * OBS_INSET, SIZE_OBS)


def op_bottom(op: Op) -> float:
    if isinstance(op, Text):
        return op.baseline
    if isinstance(op, Rule):
        return op.y
    if isinstance(op, (Frame, Picture)):
        return op.y1
    return op.baseline + UNDERLINE_DROP


def overflow(page: Page, limit: float = PAGE_HEIGHT - 14.0) -> list[Op]:
    return [op for op in page.ops if op_bottom(op) > limit]


class LayoutOverflow(ValueError):
    pass


def text_width(text: str, font: str, size: float) -> float:
    try:
        import fitz

        return float(fitz.get_text_length(text, fontname=font, fontsize=size))
    except Exception:
        return len(text) * char_width(size)


def op_right(op: Op) -> float:
    if isinstance(op, Text):
        return op.x + text_width(op.text, op.font, op.size)
    if isinstance(op, Rule):
        return op.x1
    if isinstance(op, (Frame, Picture)):
        return op.x1
    return op.x + op.width


def past_margin(page: Page, limit: float = CONTENT_RIGHT + 1.0) -> list[Op]:
    return [op for op in page.ops if op_right(op) > limit]


def assert_fits(document: Document) -> None:
    for index, page in enumerate(document.pages, start=1):
        spilled = overflow(page)
        if spilled:
            raise LayoutOverflow(f"{document.name} page {index}: {len(spilled)} element(s) fall off the sheet")
        wide = past_margin(page)
        if wide:
            widest = max(wide, key=op_right)
            raise LayoutOverflow(
                f"{document.name} page {index}: {len(wide)} element(s) run past the right margin, worst at "
                f"x={op_right(widest):.1f}"
            )
