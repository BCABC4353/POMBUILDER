from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from . import geometry as g
from .clock import Clock, parse_date
from .mapping import PacketData, split_address_lines
from .selector import DISPUTED_LABELS, PATH_REPETITIVE, Selection

LEADING = 11.5
PARAGRAPH_GAP = 8.0
LETTER_TOP = 72.0


@dataclass
class Cursor:
    y: float = LETTER_TOP
    pages: list[list[g.Op]] = field(default_factory=lambda: [[]])

    @property
    def ops(self) -> list[g.Op]:
        return self.pages[-1]

    def space(self, amount: float) -> None:
        self.y += amount

    def to(self, y: float) -> None:
        self.y = max(self.y, y)

    def break_if_needed(self, needed: float) -> None:
        if self.y + needed > g.CONTENT_BOTTOM:
            self.pages.append([])
            self.y = LETTER_TOP

    def line(self, text: str, font: str = g.FONT_VALUE, size: float = g.SIZE_BODY, leading: float = LEADING) -> None:
        self.break_if_needed(leading)
        self.ops.append(g.Text(g.MARGIN_X, self.y, text, font, size))
        self.y += leading

    def paragraph(self, text: str, size: float = g.SIZE_BODY) -> None:
        lines = g.wrap_chars(text, g.chars_across(g.CONTENT_WIDTH, size))
        self.break_if_needed(LEADING * len(lines))
        for line in lines:
            self.ops.append(g.Text(g.MARGIN_X, self.y, line, g.FONT_VALUE, size))
            self.y += LEADING
        self.y += PARAGRAPH_GAP

    def rule(self, width: float = 0.8) -> None:
        self.ops.append(g.Rule(g.MARGIN_X, self.y, g.CONTENT_RIGHT, width))
        self.y += 6.0


def _long_date(value: date) -> str:
    return f"{value.strftime('%B')} {value.day}, {value.year}"


def _prose_date(value: str) -> str:
    parsed = parse_date(value)
    return _long_date(parsed) if parsed else value


def build_letter(
    data: PacketData,
    selection: Selection,
    clock: Clock | None,
    constants: dict[str, str],
    kind: str,
    generated_on: date | None = None,
    source: str = "epcr",
) -> g.Document:
    stamp = generated_on or date.today()
    cursor = Cursor()

    supplier = data.values.get("supplier_name") or constants.get("supplier_name", "")
    cursor.line(supplier, g.FONT_BOLD, 11.0, 13.0)
    for part in split_address_lines(data.values.get("supplier_address", "")):
        cursor.line(part, g.FONT_VALUE, 8.0, 10.0)
    phone = data.values.get("supplier_phone", "")
    if phone:
        cursor.line(phone, g.FONT_VALUE, 8.0, 10.0)
    cursor.space(6.0)
    cursor.rule(1.1)
    cursor.space(18.0)

    rescuenet = source == "rescuenet"
    cursor.line(_long_date(stamp) if rescuenet else stamp.strftime("%B %d, %Y"))
    cursor.space(12.0)
    for line in data.recipient_lines:
        cursor.line(line)
    cursor.space(14.0)

    patient = data.values.get("patient_name", "")
    dob = data.values.get("patient_dob", "")
    service = data.values.get("service_date", "")
    if rescuenet:
        dob = _prose_date(dob)
        service = _prose_date(service)
    cursor.line(f"Re:  Ambulance certification statement - {patient}", g.FONT_VALUE_BOLD)
    cursor.line(f"     Date of birth {dob}    Date of service {service}", g.FONT_VALUE_BOLD)
    cursor.space(14.0)

    origin = data.values.get("origin", "the origin recorded on our report")
    destination = data.values.get("destination", "the destination recorded on our report")
    contact_line = data.values.get("supplier_phone", "our billing office")

    cursor.paragraph("Dear Clinician,")
    cursor.paragraph(f"We transported this patient by ambulance on {service}, from {origin} to {destination}.")
    cursor.paragraph(
        "Medicare pays for a non-emergency ambulance transport only where the patient's condition was such that other "
        "means of transportation were contraindicated, and 42 CFR 410.40(e) requires us to obtain a certification "
        "statement saying so. The enclosed form is that certification."
    )
    if rescuenet:
        cursor.paragraph(
            "Sections II and III of the form are blank, and they are blank on purpose. We have filled in the facts we "
            "already hold - who the patient is, and where and when we transported. The certification itself is yours to write. "
            "Please do not sign a statement you cannot support from your own knowledge of this patient, "
            "and please do not treat anything we have printed as the certification."
        )
    else:
        cursor.paragraph(
            "Section 5 of the form is blank, and it is blank on purpose. We have filled in the facts we already hold - who "
            "the patient is, where and when we transported, what level of service we billed. The certification itself is "
            "yours to write. Please do not sign a statement you cannot support from your own knowledge of this patient, "
            "and please do not treat anything we have printed as the certification."
        )
        cursor.paragraph(
            "The form also carries a boxed block of observations transcribed from our crew's patient care report. It is "
            "printed so that you are not writing against a blank page. It is not a certification, we have not adopted it, "
            "and it may well contain entries that do not support ambulance transport. Read it as the record, not as a "
            "recommendation."
        )

    if kind == "NPCS":
        cursor.paragraph(
            "This is a non-physician certification statement. You may sign it only if you are an employee of the "
            "patient's attending physician or of the facility where the patient received treatment, and only where a "
            "signature could not be obtained from the attending physician. The form carries that attestation above "
            "the signature line."
        )

    if rescuenet:
        hold_until = _long_date(stamp + timedelta(days=21))
        cursor.paragraph(
            "Please sign and return the enclosed form as soon as you can. Under 42 CFR 410.40(e)(3)(iv), when a signed "
            "certification cannot be obtained, we must document our attempts to obtain one; this letter and its mailing "
            f"record are that documentation. Under our billing policy we will hold this claim until {hold_until}, 21 "
            "calendar days from the date of this letter. A late signature is still worth returning - it is better "
            "evidence than our attempt alone."
        )
    elif clock is not None and selection.path == PATH_REPETITIVE:
        cursor.paragraph(
            "This transport is part of a scheduled repetitive series. Under 42 CFR 410.40(e)(2) a certification for "
            f"such a series must be signed before the transport and dated no earlier than 60 days before it, which for "
            f"the date of service above means a signature dated between {clock.repetitive_window[0].isoformat()} and "
            f"{clock.repetitive_window[1].isoformat()}. A certification you sign today will cover scheduled transports "
            "for 60 days beginning on the date you sign it. Please return the signed form so that the remainder of "
            "this series is certified."
        )
    elif clock is not None:
        cursor.paragraph(
            f"Please return the signed form by {clock.deadline_21.isoformat()}, which is 21 calendar days after the "
            "date of service. If we do not have a certification by then, 42 CFR 410.40(e)(3)(iv) requires us to "
            "document our attempts to obtain one, after which we may submit the claim without it. This letter and its "
            "mailing record are that documentation. A late signature is still worth returning - it is better evidence "
            "than our attempt alone."
        )
    else:
        cursor.paragraph(
            "Please return the signed form promptly. We were unable to read a date of service from the record, so the "
            "return deadline is not printed here; our billing office can confirm it."
        )

    instructions = constants.get("return_instructions", "")
    if instructions:
        cursor.paragraph(instructions)

    disputed = sorted({DISPUTED_LABELS.get(name, name.replace("_", " ")) for name in data.conflicts})
    if disputed:
        cursor.paragraph(
            "Our records disagree with each other on "
            + ", ".join(disputed)
            + ". The value printed on the form is the one our record best supports, but two sources named different "
            "values and we could not tell which is right. Please correct it on the form if what we printed is wrong."
        )

    cursor.paragraph(
        "If any detail we have printed is wrong, please correct it on the form rather than working around it. A "
        f"corrected fact is useful to us. Questions may go to {contact_line}."
    )

    cursor.space(10.0)
    cursor.line("Sincerely,")
    cursor.space(26.0)
    contact = constants.get("billing_contact", "")
    if contact:
        cursor.line(contact)
    cursor.line(supplier)
    cursor.space(16.0)
    enclosures = f"Enclosures: certification form ({kind})"
    if not rescuenet:
        enclosures += "; return envelope"
    cursor.line(enclosures, g.FONT_VALUE, g.SIZE_NOTE, 10.0)

    pages = tuple(g.Page(tuple(ops)) for ops in cursor.pages)
    document = g.Document(name="cover_letter", title="Cover letter", pages=pages)
    g.assert_fits(document)
    return document
