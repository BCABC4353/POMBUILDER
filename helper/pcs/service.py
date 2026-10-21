from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field, replace
from datetime import date
from pathlib import Path

from . import emit
from . import geometry as g
from .clock import (
    PATH_NONREPETITIVE,
    PATH_REPETITIVE,
    PATH_UNKNOWN,
    USPS_3817,
    Clock,
    build_clock,
    parse_date,
    record_packet,
)
from .letter import build_letter
from .mapping import (
    PacketData,
    build_packet,
    load_agency,
    load_fields,
    load_summary,
    merged_constants,
    resolve_version,
)
from .county import FORM_SOLANO, county_form, uses_county_forms, zip5
from .overlay import Sheet
from .populate import (
    FORCED_STAMP,
    build_certificate_of_mailing,
    build_certification,
    build_norcal_certification,
    build_solano_certification,
)
from .selector import Selection, first_variant, select_form
from .template import build_observations

PATHS = {"Yes": PATH_REPETITIVE, "No": PATH_NONREPETITIVE, "Unknown": PATH_UNKNOWN}

IDENTITY_KEYS: tuple[tuple[str, str], ...] = (
    ("patient_name", "beneficiary name"),
    ("service_date", "date of service"),
    ("clinician_name", "certifying clinician name"),
)

_HAS_LETTER = re.compile(r"[A-Za-z]")
_NAME_PLACEHOLDERS = frozenset({"n/a", "na", "unknown", "none", "null", "missing"})


def _identity_gap(key: str, value: str) -> bool:
    if not value:
        return True
    if key == "service_date":
        return parse_date(value) is None
    if not _HAS_LETTER.search(value):
        return True
    return value.strip().lower() in _NAME_PLACEHOLDERS


def _stamp_pages(document: g.Document) -> g.Document:
    stamped: list[g.Page] = []
    for page in document.pages:
        already = any(isinstance(op, g.Text) and op.text == FORCED_STAMP for op in page.ops)
        if already:
            stamped.append(page)
        else:
            stamped.append(
                g.Page(
                    (
                        *page.ops,
                        g.Text(g.MARGIN_X, g.R_FORCED_STAMP, FORCED_STAMP, g.FONT_BOLD, g.SIZE_NOTE),
                    )
                )
            )
    return g.Document(name=document.name, title=document.title, pages=tuple(stamped))


_FIELD_SENTINELS = frozenset({"<none>", "none", "null", "n/a"})


def _first_field(fields: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = first_variant(fields.get(key))
        if value and value.strip().lower() not in _FIELD_SENTINELS:
            return value.strip()
    return ""


def _street_place(fields: dict[str, str], prefix: str) -> str:
    return ", ".join(
        part for part in (_first_field(fields, f"{prefix}_address"), _first_field(fields, f"{prefix}_city")) if part
    )


def _clean_place(fields: dict[str, str], prefix: str) -> str:
    state_zip = " ".join(part for part in (_first_field(fields, f"{prefix}_state"), _first_field(fields, f"{prefix}_zip")) if part)
    locality = ", ".join(part for part in (_first_field(fields, f"{prefix}_city"), state_zip) if part)
    address = ", ".join(
        part
        for part in (_first_field(fields, f"{prefix}_address"), _first_field(fields, f"{prefix}_address_line_2"), locality)
        if part
    )
    room = " ".join(
        f"{label} {value}"
        for suffix, label in (("unit", "Unit"), ("floor", "Floor"), ("room", "Room"), ("bed", "Bed"))
        if (value := _first_field(fields, f"{prefix}_{suffix}"))
    )
    return " - ".join(part for part in (_first_field(fields, f"{prefix}_facility_name"), address, room) if part)


def clean_county_places(data: PacketData, fields: dict[str, str]) -> None:
    for key, prefix in (("origin", "pickup"), ("destination", "destination")):
        place = _clean_place(fields, prefix)
        if place:
            data.values[key] = place


def county_certification(data: PacketData, fields: dict[str, str], generated_on: date | None) -> Sheet:
    pickup = _first_field(fields, "pickup_zip")
    chosen = county_form(pickup)
    if not zip5(pickup):
        data.notes.append("No pickup ZIP code was extracted; the Northern California form was used.")
    form_fields = {
        "origin_form": _first_field(fields, "pickup_facility_name") or _street_place(fields, "pickup"),
        "destination_form": _first_field(fields, "destination_facility_name") or _street_place(fields, "destination"),
    }
    if chosen == FORM_SOLANO:
        return build_solano_certification(data, form_fields, generated_on)
    return build_norcal_certification(data, form_fields, generated_on, parse_date(data.values.get("service_date", "")))


@dataclass(frozen=True)
class MailPiece:
    run_id: int
    reference: str
    recipient_name: str
    recipient_lines: tuple[str, ...]
    form_kind: str
    forced: bool = False


def mail_piece(run_id: int, run_number: str, kind: str, data: PacketData) -> MailPiece:
    return MailPiece(
        run_id=run_id,
        reference=data.values.get("claim_ref", "") or run_number,
        recipient_name=data.recipient_name,
        recipient_lines=tuple(data.recipient_lines),
        form_kind=kind,
        forced=data.forced_incomplete,
    )


def certificate_for(piece: MailPiece, constants: dict[str, str], batch_id: str, generated_on: date | None) -> Sheet:
    return build_certificate_of_mailing(
        piece.recipient_name,
        piece.recipient_lines,
        constants,
        reference=piece.reference,
        batch_id=batch_id,
        generated_on=generated_on,
        forced=piece.forced,
    )


@dataclass(frozen=True)
class PacketBuild:
    run_id: int
    version_id: int
    agency: str | None
    run_number: str
    kind: str
    selection: Selection
    data: PacketData
    clock: Clock | None
    documents: tuple[emit.Renderable, ...] = ()
    mailing: Sheet | None = None

    @property
    def generated(self) -> bool:
        return bool(self.documents)

    @property
    def piece(self) -> MailPiece:
        return mail_piece(self.run_id, self.run_number, self.kind, self.data)

    @property
    def all_documents(self) -> tuple[emit.Renderable, ...]:
        if self.mailing is None:
            return self.documents
        return (*self.documents, self.mailing)


@dataclass
class BatchBuild:
    batch_id: str
    builds: list[PacketBuild] = field(default_factory=list)
    usps: tuple[Sheet, ...] = ()

    @property
    def mailable(self) -> list[PacketBuild]:
        return [build for build in self.builds if build.generated]

    @property
    def usps_form(self) -> str:
        return USPS_3817


def build_for_run(
    db_path: Path | str,
    run_id: int,
    version_id: int | None = None,
    prefer: str | None = None,
    force: bool = False,
    constants: dict[str, str] | None = None,
    as_of: date | None = None,
    generated_on: date | None = None,
) -> PacketBuild | None:
    resolved = version_id or resolve_version(db_path, run_id)
    if resolved is None:
        return None
    fields = load_fields(db_path, resolved)
    summary = load_summary(db_path, run_id)
    agency = load_agency(db_path, run_id)
    selection = select_form(summary, fields, force=force, prefer=prefer)
    data = build_packet(fields, summary, constants or merged_constants(agency), selection)
    clock = build_clock(
        data.service_value,
        path=PATHS.get(selection.repetitive, PATH_UNKNOWN),
        repetitive=selection.repetitive,
        as_of=as_of,
        generated_on=generated_on or date.today(),
    )
    kind = selection.form or (prefer.upper() if prefer else "PCS")
    run_number = str(summary.get("run_number") or "")
    documents: tuple[emit.Renderable, ...] = ()
    mailing: Sheet | None = None
    unidentified = [label for key, label in IDENTITY_KEYS if _identity_gap(key, data.values.get(key, ""))]
    if unidentified:
        gap = ", ".join(unidentified)
        if force:
            data.forced_incomplete = True
            data.notes.append(f"Built under --force with no {gap}; the certification cannot identify the beneficiary.")
        else:
            selection = replace(
                selection,
                review=(
                    *selection.review,
                    f"No {gap} on this run; a certification that cannot identify the beneficiary was not built. "
                    "Supply the missing values or generate with --force.",
                ),
            )
    if (selection.needed or force) and not (unidentified and not force):
        resolved_constants = constants or merged_constants(agency)
        county = uses_county_forms(agency)
        if county:
            clean_county_places(data, fields)
            form = county_certification(data, fields, generated_on)
        else:
            form = build_certification(data, selection, clock, resolved_constants, fields, generated_on)
        letter = build_letter(data, selection, clock, resolved_constants, kind, generated_on, county_form=county)
        if data.forced_incomplete:
            letter = _stamp_pages(letter)
        observations = build_observations(data, data.values.get("claim_ref", ""), generated_on)
        documents = (form, letter) if observations is None else (form, letter, observations)
        mailing = certificate_for(mail_piece(run_id, run_number, kind, data), resolved_constants, "", generated_on)
    return PacketBuild(
        run_id=run_id,
        version_id=resolved,
        agency=agency,
        run_number=run_number,
        kind=kind if documents else "",
        selection=selection,
        data=data,
        clock=clock,
        documents=documents,
        mailing=mailing,
    )


def build_batch(
    db_path: Path | str,
    run_ids: list[int],
    batch_id: str,
    prefer: str | None = None,
    force: bool = False,
    as_of: date | None = None,
    generated_on: date | None = None,
) -> BatchBuild:
    batch = BatchBuild(batch_id=batch_id)
    for run_id in run_ids:
        build = build_for_run(
            db_path,
            run_id,
            prefer=prefer,
            force=force,
            as_of=as_of,
            generated_on=generated_on,
        )
        if build is not None:
            batch.builds.append(build)
    mailable = batch.mailable
    if mailable:
        batch.usps = tuple(
            certificate_for(build.piece, merged_constants(build.agency), batch_id, generated_on) for build in mailable
        )
    return batch


def write_documents(
    documents: tuple[emit.Renderable, ...] | list[emit.Renderable],
    out_dir: Path | str,
    stem: str,
    pdf: bool = True,
    text: bool = False,
) -> list[Path]:
    return emit.write_all(documents, out_dir, stem, pdf=pdf, text=text)


def write_packet(build: PacketBuild, out_pdf: Path | str) -> Path | None:
    documents = build.all_documents
    if not documents:
        return None
    return emit.merge(documents, out_pdf)


def record_build(conn: sqlite3.Connection, build: PacketBuild, batch_id: str | None = None) -> int | None:
    if not build.generated or build.clock is None:
        return None
    return record_packet(
        conn,
        run_id=build.run_id,
        form_kind=build.kind,
        service_date=build.clock.service_date.isoformat(),
        service_datetime=(
            None if build.clock.service_datetime is None else build.clock.service_datetime.isoformat(sep=" ")
        ),
        run_number=build.run_number or None,
        agency=build.agency,
        repetitive=build.selection.repetitive,
        path=build.clock.path,
        recipient_name=build.data.recipient_name,
        recipient_address=" | ".join(build.data.recipient_lines[1:]),
        reason="; ".join(build.selection.reasons),
        batch_id=batch_id,
    )


def _sheet_coverage(build: PacketBuild) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for document in build.all_documents:
        if not isinstance(document, Sheet):
            continue
        template = document.template
        out.append(
            {
                "sheet": document.name,
                "blank_form": template.filename,
                "printed": dict(sorted(document.values.items())),
                "checked": sorted(key for key, on in document.checks.items() if on),
                "left_for": [
                    {"field": blank.label, "owner": blank.owner, "reason": blank.reason} for blank in template.blanks
                ],
                "terms": template.terms,
            }
        )
    return out


def coverage(build: PacketBuild) -> dict[str, object]:
    return {
        "run_id": build.run_id,
        "extraction_version_id": build.version_id,
        "agency": build.agency,
        "run_number": build.run_number,
        "form": build.kind,
        "generated": build.generated,
        "selection": build.selection.as_dict(),
        "clock": None if build.clock is None else build.clock.as_dict(),
        "prefilled": dict(sorted(build.data.values.items())),
        "left_blank": list(build.data.blanks),
        "observations": [{"source": o.source, "label": o.label, "text": o.text} for o in build.data.observations],
        "recipient": {"name": build.data.recipient_name, "lines": list(build.data.recipient_lines)},
        "missing": list(build.data.missing),
        "notes": list(build.data.notes),
        "documents": [emit.name_of(document) for document in build.all_documents],
        "mailing": None if build.mailing is None else build.mailing.name,
        "real_forms": _sheet_coverage(build),
    }
