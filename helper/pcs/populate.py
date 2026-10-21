from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from . import forms as f
from . import geometry as g
from .clock import REPETITIVE_LOOKBACK_DAYS, Clock, parse_date
from .mapping import PacketData, split_address_lines
from .overlay import SIZE_FLOOR, Sheet, SheetBuilder, fit
from .selector import DISPUTED_LABELS, PATH_REPETITIVE, Selection, tri

VALIDITY_SINGLE = (
    "Valid for the round trip on the transport date printed above. Sign and date Section III on the day you sign."
)
VALIDITY_REPETITIVE = (
    "Scheduled repetitive transport: this form covers scheduled trips for 60 days from the date signed in Section III "
    "and is not valid for a transport performed before that date."
)
FORCED_STAMP = "BUILT WITHOUT A COMPLETE BENEFICIARY IDENTITY - GENERATED WITH --force"

TITLE_SIZE = 11.1
NOTE_SIZE = 6.4
FOOT_SIZE = 6.0

CERT_NOTE_BASELINE = 787.0
CERT_HEADER_BASELINE = 10.0
CERT_TITLE_BASELINE = 25.0
CERT_NOTE_LEFT = 54.0
CERT_NOTE_WIDTH = 504.0

ATTRIBUTION = "Sample form from Page, Wolfberg & Wirth (www.pwwemslaw.com)"

SECTION_I_KEYS: tuple[str, ...] = (
    "patient_name",
    "patient_dob",
    "member_id",
    "service_date",
)

PLACE_KEYS: tuple[tuple[str, str], ...] = (("origin", "Origin"), ("destination", "Destination"))

MEMBER_SOURCES = (
    "medical_necessity_medicare_id",
    "pcs_medicare_id",
    "medicare_number",
    "medicare_no",
    "wps_medicare_id",
)

PART_A_SOURCES = (
    "medical_necessity_medicare_part_a_pps_drg",
    "medical_necessity_medicare_part_a",
    "pcs_medicare_part_a_covered",
    "medicare_part_a_pps_drg",
    "medicare_part_a_covered",
)

HOSPICE_SOURCES = (
    "medical_necessity_hospice_transport_related_to_terminal_illness",
    "hospice_transport_related_to_terminal_illness",
    "medical_necessity_hospice_terminal_illness",
)


def _title(organization: str) -> str:
    name = " ".join(g.ascii_safe(organization).split())
    if not name:
        return "Certification of Medical Necessity for Non-Emergency Ambulance Services"
    return f"{name} Medical Necessity Certification Statement"


def _place_name(place: str) -> str:
    head = place.split(" - ")[0].strip()
    return head or place


def _clip(text: str, size: float, width: float = CERT_NOTE_WIDTH) -> str:
    body = " ".join(g.ascii_safe(text).split())
    while body and g.text_width(body, g.FONT_LABEL, size) > width:
        body = body[: body.rfind(" ")] if " " in body else body[:-1]
    return body


def _first(fields: dict[str, str], keys: tuple[str, ...]) -> str:
    from .selector import first_variant

    for key in keys:
        value = first_variant(fields.get(key))
        if value:
            return value
    return ""


def build_certification(
    data: PacketData,
    selection: Selection | None = None,
    clock: Clock | None = None,
    constants: dict[str, str] | None = None,
    fields: dict[str, str] | None = None,
    generated_on: date | None = None,
    source: str = "epcr",
) -> Sheet:
    constants = constants or {}
    fields = fields or {}
    stamp = generated_on or date.today()
    rescuenet = source == "rescuenet"
    builder = SheetBuilder(f.CERT_TEMPLATE, name="medical_necessity_certification")

    heading = _title(data.values.get("supplier_name") or constants.get("supplier_name", ""))
    builder.title = heading
    builder.cover(*f.CERT_TITLE_BOX)
    fitted = heading
    size = TITLE_SIZE
    while size > 7.0 and g.text_width(fitted, g.FONT_BOLD, size) > f.CERT_TITLE_BOX[2] - f.CERT_TITLE_BOX[0]:
        size = round(size - 0.2, 2)
    builder.stamp(g.Text(f.CERT_TITLE_BOX[0] + 1.0, CERT_TITLE_BASELINE, fitted, g.FONT_BOLD, size))

    for key in SECTION_I_KEYS:
        if key in data.blanks:
            continue
        builder.set(key, data.values.get(key, ""))

    for key, label in PLACE_KEYS:
        if rescuenet:
            if key not in data.blanks:
                builder.set(key, fields.get(f"{key}_form") or data.values.get(key, ""))
            continue
        place = data.values.get(key, "")
        if not place or key in data.blanks:
            continue
        slot = f.CERT_TEMPLATE.slot(key)
        if g.text_width(place, slot.font, slot.size) <= slot.width:
            builder.set(key, place)
            continue
        short = _place_name(place)
        builder.set(key, short)
        if short != place:
            builder.notes.append(
                f"The {label} line on this form is too short for the full place string, so it carries "
                f"'{short}'. The address and room detail are on the cover letter: {place}"
            )

    member = data.values.get("member_id", "")
    explicit = _first(fields, MEMBER_SOURCES)
    if rescuenet:
        if not member:
            builder.notes.append("No policy number on the current payor; the PCS 'Medicare #' line prints blank.")
    elif explicit:
        builder.set("member_id", explicit)
    elif member:
        builder.notes.append(
            "No Medicare number was extracted. The Medicare # line carries the member or record identifier that was "
            "found instead; confirm it before mailing."
        )

    disputed = sorted({DISPUTED_LABELS.get(name, name.replace("_", " ")) for name in data.conflicts})
    if disputed:
        builder.notes.append(
            "Our records disagree with each other on "
            + ", ".join(disputed)
            + ". The value printed is the one the record best supports; two sources named different values and we "
            "could not tell which is right. Correct it on the form if what we printed is wrong."
        )
    for note in data.selection_notes:
        builder.notes.append(f"Chosen from conflicting sources by the record's own age: {note}")

    part_a = tri(_first(fields, PART_A_SOURCES))
    builder.tri("part_a_yes", "part_a_no", part_a)
    if part_a == "Unknown":
        builder.notes.append(
            "Medicare Part A (PPS/DRG) status is not recorded in RescueNet; that pair of boxes is left blank."
            if rescuenet
            else "Medicare Part A (PPS/DRG) coverage was not extracted; that pair of boxes is left blank."
        )

    hospice = tri(_first(fields, HOSPICE_SOURCES))
    builder.tri("hospice_yes", "hospice_no", hospice)

    reason = _first(fields, ("destination_reason", "transfer_reason", "transport_reason"))
    if reason:
        builder.set("not_closest_reason", reason)
        if rescuenet:
            builder.notes.append(
                "The 'why was the patient transported to another facility' line carries the transport reason recorded "
                "on the trip in RescueNet. The closest-appropriate-facility Yes/No boxes are left blank: nothing on the "
                "trip answers that question."
            )
        else:
            builder.notes.append(
                "The 'why was the patient transported to another facility' line carries the destination reason "
                "recorded on the report. The closest-appropriate-facility Yes/No boxes are left blank: nothing in the "
                "record answers that question."
            )

    validity = VALIDITY_REPETITIVE if (selection and selection.path == PATH_REPETITIVE) else VALIDITY_SINGLE
    builder.stamp(g.Text(CERT_NOTE_LEFT, CERT_NOTE_BASELINE, _clip(validity, NOTE_SIZE), g.FONT_LABEL, NOTE_SIZE))

    if clock is not None and selection is not None and selection.path == PATH_REPETITIVE:
        earliest = clock.service_date - timedelta(days=REPETITIVE_LOOKBACK_DAYS)
        builder.notes.append(
            f"Repetitive series: a signature dated between {earliest.isoformat()} and "
            f"{clock.service_date.isoformat()} covers this date of service. A signature dated today covers scheduled "
            "transports for the following 60 days and cannot reach back to this trip."
        )

    reference = " | ".join(
        part
        for part in (
            FORCED_STAMP if data.forced_incomplete else "",
            data.values.get("claim_ref", ""),
            f"prepared {stamp.isoformat()}",
            ATTRIBUTION,
        )
        if part
    )
    builder.stamp(
        g.Text(
            CERT_NOTE_LEFT,
            CERT_HEADER_BASELINE,
            _clip(reference, FOOT_SIZE),
            g.FONT_BOLD if data.forced_incomplete else g.FONT_LABEL,
            FOOT_SIZE,
        )
    )

    sheet = builder.build()
    data.notes.extend(note for note in builder.notes if note not in data.notes)
    return sheet


COUNTY_REFERENCE_X = 36.0
COUNTY_REFERENCE_BASELINE = 10.0
COUNTY_REFERENCE_WIDTH = 540.0


def _county_reference(builder: SheetBuilder, data: PacketData, stamp: date) -> None:
    reference = " | ".join(part for part in (data.values.get("claim_ref", ""), f"prepared {stamp.isoformat()}") if part)
    builder.stamp(
        g.Text(
            COUNTY_REFERENCE_X,
            COUNTY_REFERENCE_BASELINE,
            _clip(reference, FOOT_SIZE, COUNTY_REFERENCE_WIDTH),
            g.FONT_LABEL,
            FOOT_SIZE,
        )
    )


def _labelled(label: str, value: str) -> str:
    return f"{label}: {value}" if value else ""


def _form_date(value: str) -> str:
    parsed = parse_date(value)
    return parsed.strftime("%m/%d/%Y") if parsed else value


def build_solano_certification(
    data: PacketData,
    fields: dict[str, str] | None = None,
    generated_on: date | None = None,
) -> Sheet:
    fields = fields or {}
    stamp = generated_on or date.today()
    builder = SheetBuilder(f.SOLANO_TEMPLATE)

    values = data.values
    dates = " | ".join(
        part
        for part in (
            _labelled("DOB", _form_date(values.get("patient_dob", ""))),
            _labelled("DATE OF SERVICE", _form_date(values.get("service_date", ""))),
        )
        if part
    )
    imprint = [
        values.get("patient_name", ""),
        dates,
        _labelled("POLICY #", values.get("member_id", "")),
        _labelled("RUN #", values.get("claim_ref", "")),
    ]
    for key, line in zip(f.SOLANO_IMPRINT_KEYS, [line for line in imprint if line]):
        builder.set(key, line)

    receiving = fields.get("destination_form") or values.get("destination", "")
    if receiving:
        builder.set("receiving_facility", receiving)

    _county_reference(builder, data, stamp)
    sheet = builder.build()
    data.notes.extend(note for note in builder.notes if note not in data.notes)
    return sheet


def _set_stacked(builder: SheetBuilder, upper_key: str, lower_key: str, value: str) -> None:
    text = " ".join(g.ascii_safe(value).split())
    if not text:
        return
    lower = builder.template.slot(lower_key)
    if g.text_width(text, lower.font, lower.size) <= lower.width:
        builder.set(lower_key, text)
        return
    upper = builder.template.slot(upper_key)
    size = upper.size
    while True:
        rows = _wrap_width(text, upper.font, size, upper.width)
        if len(rows) <= 2 or size <= SIZE_FLOOR:
            break
        size = max(SIZE_FLOOR, round(size - 0.25, 2))
    if len(rows) == 1:
        rows = ["", rows[0]]
    top, bottom = rows[0], " ".join(rows[1:])
    for key, row in ((upper_key, top), (lower_key, bottom)):
        if not row:
            continue
        slot = builder.template.slot(key)
        if g.text_width(row, slot.font, size) <= slot.width:
            builder.values[key] = row
            builder.sizes[key] = size
        else:
            builder.set(key, row)
            builder.sizes[key] = min(builder.sizes.get(key, size), size)


def build_norcal_certification(
    data: PacketData,
    fields: dict[str, str] | None = None,
    generated_on: date | None = None,
    service: date | None = None,
) -> Sheet:
    fields = fields or {}
    stamp = generated_on or date.today()
    builder = SheetBuilder(f.NORCAL_TEMPLATE)

    values = data.values
    builder.set("patient_name", values.get("patient_name", ""))
    builder.set("patient_dob", _form_date(values.get("patient_dob", "")))
    _set_stacked(builder, "pickup_facility_upper", "pickup_facility", fields.get("origin_form") or values.get("origin", ""))
    if service is not None:
        builder.set("requested_month", f"{service.month:02d}")
        builder.set("requested_day", f"{service.day:02d}")
        builder.set("requested_year", f"{service.year % 100:02d}")
    builder.set("destination", values.get("destination", ""))

    _county_reference(builder, data, stamp)
    sheet = builder.build()
    data.notes.extend(note for note in builder.notes if note not in data.notes)
    return sheet


def _address_rows(name: str, address: str, limit: int) -> list[str]:
    rows = [row for row in (name,) if row]
    rows.extend(split_address_lines(address))
    if len(rows) > limit:
        rows = [*rows[: limit - 1], ", ".join(rows[limit - 1 :])]
    return rows


def build_certificate_of_mailing(
    recipient_name: str,
    recipient_lines: tuple[str, ...] | list[str],
    constants: dict[str, str],
    reference: str = "",
    batch_id: str = "",
    generated_on: date | None = None,
    forced: bool = False,
) -> Sheet:
    stamp = generated_on or date.today()
    builder = SheetBuilder(f.USPS_TEMPLATE)

    sender = _address_rows(
        constants.get("supplier_name", ""),
        constants.get("supplier_address", ""),
        len(f.USPS_FROM_KEYS),
    )
    for key, row in zip(f.USPS_FROM_KEYS, sender):
        builder.set(key, row)

    tail = [line for line in list(recipient_lines)[1:] if line]
    addressee = _address_rows(recipient_name, ", ".join(tail), len(f.USPS_TO_KEYS))
    for key, row in zip(f.USPS_TO_KEYS, addressee):
        builder.set(key, row)

    trail = "  |  ".join(
        part
        for part in (
            f"claim {reference}" if reference else "",
            f"batch {batch_id}" if batch_id else "",
            f"prepared {stamp.isoformat()}",
        )
        if part
    )
    builder.stamp(g.Text(f.USPS_REFERENCE_X, f.USPS_REFERENCE_BASELINE, trail, g.FONT_LABEL, f.USPS_REFERENCE_SIZE))
    if forced:
        builder.stamp(
            g.Text(
                f.USPS_REFERENCE_X,
                f.USPS_REFERENCE_BASELINE + 11.0,
                FORCED_STAMP,
                g.FONT_BOLD,
                f.USPS_REFERENCE_SIZE,
            )
        )
    return builder.build()


_FIRM_LINES_PER_SHEET = 6
_FIRM_SINGLE_ROW_FLOOR = 6.5


@dataclass(frozen=True)
class FirmLine:
    attention: str
    facility: str
    street: str
    city_state_zip: str
    identifier: str


_SENDER_KEYS = ("sender_1", "sender_2", "sender_3", "sender_4")


def _clean(text: str) -> str:
    return " ".join(g.ascii_safe(text).split())


def _wrap_width(text: str, font: str, size: float, width: float) -> list[str]:
    rows: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}" if current else word
        if current and g.text_width(candidate, font, size) > width:
            rows.append(current)
            current = word
        else:
            current = candidate
    if current:
        rows.append(current)
    return rows


def _rows_for(text: str, slot, floor: float, wrap_size: float) -> list[str]:
    if not text:
        return []
    if g.text_width(text, slot.font, floor) <= slot.width:
        return [text]
    return _wrap_width(text, slot.font, wrap_size, slot.width)


def _cap(rows: list[str], n: int) -> list[str]:
    if n <= 0:
        return []
    if len(rows) <= n:
        return rows
    return [*rows[: n - 1], " ".join(rows[n - 1 :])]


def _facility_rows(text: str, slot, avail: int) -> list[str]:
    rows = _rows_for(text, slot, _FIRM_SINGLE_ROW_FLOOR, slot.size)
    if len(rows) > avail:
        rows = _rows_for(text, slot, SIZE_FLOOR, SIZE_FLOOR)
    return _cap(rows, avail)


def _firm_layout(line: FirmLine, slot) -> list[tuple[str, str]]:
    limit = f.USPS_3665_ADDRESS_ROWS
    facility = _clean(line.facility)
    street = _clean(line.street)
    city = _clean(line.city_state_zip)
    city_rows = [city] if city else []
    reserve = 1 if facility else 0

    street_rows = _rows_for(street, slot, _FIRM_SINGLE_ROW_FLOOR, slot.size)
    if len(street_rows) + len(city_rows) + reserve > limit:
        street_rows = _rows_for(street, slot, SIZE_FLOOR, SIZE_FLOOR)
    street_rows = _cap(street_rows, limit - len(city_rows) - reserve)

    avail = limit - len(street_rows) - len(city_rows)
    facility_rows = _facility_rows(facility, slot, avail)
    if facility and len(street_rows) > 1 and len(_facility_rows(facility, slot, limit)) > avail:
        compact = _cap(_rows_for(street, slot, SIZE_FLOOR, SIZE_FLOOR), 1)
        if g.text_width(compact[0], slot.font, SIZE_FLOOR) <= slot.width:
            street_rows = compact
            avail = limit - len(street_rows) - len(city_rows)
            facility_rows = _facility_rows(facility, slot, avail)

    layout = [("facility name", t) for t in facility_rows]
    layout += [("street", t) for t in street_rows]
    layout += [("city/state/ZIP", t) for t in city_rows]
    attention = _clean(line.attention)
    if attention and len(layout) < limit and g.text_width(attention, slot.font, _FIRM_SINGLE_ROW_FLOOR) <= slot.width:
        layout = [("attention", attention), *layout]
    return layout


def _shortened(slot, text: str) -> bool:
    return bool(fit(slot, text)[2])


def firm_line_notes(lines: list[FirmLine], constants: dict[str, str]) -> list[list[str]]:
    sender_slot = f.USPS_3665_TEMPLATE.slot("sender_1")
    sender = _address_rows(constants.get("supplier_name", ""), constants.get("supplier_address", ""), 4)
    sender_short = any(_shortened(sender_slot, row) for row in sender)
    slot = f.USPS_3665_TEMPLATE.slot("line1_address_1")
    ident_slot = f.USPS_3665_TEMPLATE.slot("line1_identifier")
    out: list[list[str]] = []
    for line in lines:
        fields: list[str] = []
        for field_name, text in _firm_layout(line, slot):
            if _shortened(slot, text) and field_name not in fields:
                fields.append(field_name)
        if _shortened(ident_slot, line.identifier):
            fields.append("identifier")
        if sender_short:
            fields.append("sender address")
        out.append([f"3665 line shortened: {name}" for name in fields])
    return out


def build_firm_sheets(
    lines: list[FirmLine],
    constants: dict[str, str],
    batch_id: str,
    generated_on: date,
) -> list[Sheet]:
    n_sheets = max(1, (len(lines) + _FIRM_LINES_PER_SHEET - 1) // _FIRM_LINES_PER_SHEET)
    sender = _address_rows(
        constants.get("supplier_name", ""),
        constants.get("supplier_address", ""),
        4,
    )
    sheets = []
    for sheet_idx in range(n_sheets):
        chunk = lines[sheet_idx * _FIRM_LINES_PER_SHEET : (sheet_idx + 1) * _FIRM_LINES_PER_SHEET]
        builder = SheetBuilder(f.USPS_3665_TEMPLATE)
        for key, row in zip(_SENDER_KEYS, sender):
            builder.set(key, row)
        builder.set("total_listed", str(len(chunk)))
        builder.set("page_n", str(sheet_idx + 1))
        builder.set("page_of", str(n_sheets))
        for n, line in enumerate(chunk, start=1):
            slot = f.USPS_3665_TEMPLATE.slot(f"line{n}_address_1")
            for k, (_, text) in enumerate(_firm_layout(line, slot), start=1):
                builder.set(f"line{n}_address_{k}", text)
            builder.set(f"line{n}_identifier", line.identifier)
        sheets.append(builder.build())
    return sheets
