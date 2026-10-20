from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from .clock import parse_date
from .selector import CONFLICT_MARKER, Selection, first_variant, select_dob_value

CONSTANTS_PATH = Path(__file__).resolve().parent.parent / "config" / "pcs.json"
FORM1500_CONSTANTS_PATH = Path(__file__).resolve().parent.parent / "config" / "form1500.json"

CONSTANT_KEYS = (
    "supplier_name",
    "supplier_address",
    "supplier_phone",
    "supplier_fax",
    "supplier_npi",
    "billing_contact",
    "return_instructions",
)

FILLED_KEYS = (
    "patient_name",
    "patient_dob",
    "member_id",
    "claim_ref",
    "service_date",
    "level_of_service",
    "origin",
    "destination",
    "supplier_name",
    "supplier_phone",
    "supplier_address",
    "supplier_npi",
    "clinician_name",
    "clinician_address",
)

BLANK_KEYS = (
    "certification_text",
    "signer_signature",
    "signer_date",
    "signer_printed_name",
    "signer_npi",
    "signer_credential",
    "signer_employer",
)

OBSERVATION_FIELDS: tuple[tuple[str, str], ...] = (
    ("chief_complaint", "Chief complaint"),
    ("current_history_of_present_illness", "History of present illness"),
    ("assessment_mental_status", "Mental status"),
    ("assessment_neurological", "Neurological"),
    ("assessment_respiratory", "Respiratory"),
    ("assessment_circulatory", "Circulatory"),
    ("assessment_extremities", "Extremities"),
    ("assessment_wound", "Wounds"),
    ("current_vitals_blood_pressure", "Blood pressure"),
    ("current_vitals_heart_rate", "Heart rate"),
    ("current_vitals_oxygen_saturation", "Oxygen saturation"),
    ("current_vitals_glasgow_coma_scale", "Glasgow coma scale"),
    ("vitals_cardiac_monitor", "Cardiac monitor"),
    ("vitals_cardiac_rhythm", "Cardiac rhythm"),
    ("treatment_positioning", "Positioning"),
    ("treatment_transfer_method", "Transfer method"),
    ("treatment_oxygen_therapy", "Oxygen therapy"),
    ("treatment_airway", "Airway management"),
    ("treatment_vascular_access", "Vascular access"),
    ("barriers_to_patient_care", "Barriers to care"),
    ("dnr_status", "Code status"),
    ("past_medical_history", "Past medical history"),
)

NEVER_PRINT: frozenset[str] = frozenset(
    {
        "mn_determination",
        "mn_determination_summary",
        "mn_form_justification",
        "mn_presumption_triggers",
        "mn_alignment",
        "mn_documentation_sufficient",
        "mn_documentation_summary",
        "mn_discrepancies",
        "mn_checked_indicators",
        "mn_scheduled_repetitive",
        "mn_bed_unable_to_get_up",
        "mn_bed_unable_to_ambulate",
        "mn_bed_unable_to_sit",
        "mn_stand_and_pivot",
        "mn_stand_and_pivot_direction",
        "mn_walk",
        "mn_walk_direction",
        "mn_wheelchair",
        "mn_wheelchair_direction",
        "validation_notes",
        "change_rationale",
        "medical_necessity_bed_confined",
        "medical_necessity_chair_confined",
        "medical_necessity_medically_necessary",
        "medical_necessity_moved_by_stretcher",
        "medical_necessity_services_available",
        "medical_necessity_stretcher_purpose",
        "medical_necessity_transport_to_for",
    }
)

CLINICIAN_SOURCES = (
    ("attending_physician", "attending physician named on the record"),
    ("ordering_provider", "ordering provider named on the record"),
    ("pcp", "primary care physician named on the record"),
    ("receiving_provider", "receiving provider named on the record"),
)

_OBSERVATION_KEYS = frozenset(name for name, _ in OBSERVATION_FIELDS)


class JudgmentLeak(RuntimeError):
    pass


if _OBSERVATION_KEYS & NEVER_PRINT:
    raise JudgmentLeak(f"observation sources overlap the judgment denylist: {sorted(_OBSERVATION_KEYS & NEVER_PRINT)}")


@dataclass(frozen=True)
class Observation:
    source: str
    label: str
    text: str


@dataclass
class PacketData:
    values: dict[str, str] = field(default_factory=dict)
    blanks: tuple[str, ...] = BLANK_KEYS
    observations: list[Observation] = field(default_factory=list)
    recipient_name: str = ""
    recipient_lines: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    forced_incomplete: bool = False
    conflicts: list[str] = field(default_factory=list)
    selection_notes: list[str] = field(default_factory=list)
    service_value: str = ""

    def set(self, key: str, value) -> None:
        if key in self.blanks:
            raise JudgmentLeak(f"{key} is a signer-completed field and may never be populated")
        text = "" if value is None else " ".join(str(value).split())
        if text:
            self.values[key] = text

    def require(self, key: str, value, label: str) -> None:
        self.set(key, value)
        if not self.values.get(key):
            self.missing.append(label)

    def assert_clean(self) -> None:
        for key in self.blanks:
            if self.values.get(key):
                raise JudgmentLeak(f"{key} carries a value; the certification must reach the signer blank")
        for observation in self.observations:
            if observation.source in NEVER_PRINT:
                raise JudgmentLeak(f"{observation.source} is a pipeline judgment and may not print on a certification")


def load_constants(path: Path | str | None = None) -> dict[str, str]:
    out: dict[str, str] = dict.fromkeys(CONSTANT_KEYS, "")
    legacy = _read_json(FORM1500_CONSTANTS_PATH)
    for source, target in (
        ("biller_name", "supplier_name"),
        ("biller_address", "supplier_address"),
        ("biller_phone", "supplier_phone"),
        ("biller_npi", "supplier_npi"),
    ):
        value = legacy.get(source)
        if value:
            out[target] = str(value)
    raw = _read_json(Path(path) if path else CONSTANTS_PATH)
    for key in CONSTANT_KEYS:
        value = raw.get(key)
        if value:
            out[key] = str(value)
    return out


def agency_constants(agency: str | None) -> dict[str, str]:
    if not agency:
        return {}
    from companies.registry import UnknownAgencyError, pack_for_agency

    try:
        identity = pack_for_agency(agency).billing_identity
    except UnknownAgencyError:
        return {}
    if identity is None:
        return {}
    return {
        "supplier_name": identity.billing_name,
        "supplier_address": identity.billing_address,
        "supplier_phone": identity.billing_phone,
        "supplier_npi": identity.npi,
        "billing_contact": ", ".join(
            part for part in (identity.authorized_official_name, identity.authorized_official_title) if part
        ),
    }


def merged_constants(agency: str | None, path: Path | str | None = None) -> dict[str, str]:
    out = load_constants(path)
    for key, value in agency_constants(agency).items():
        if value and not out.get(key):
            out[key] = value
    return out


def _read_json(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def load_fields(db_path: Path | str, extraction_version_id: int) -> dict[str, str]:
    import claim_record
    from storage_paths import open_readonly as _readonly
    conn = _readonly(db_path)
    try:
        catalog, dynamic = claim_record.field_map(conn, extraction_version_id)
    finally:
        conn.close()
    for name, value in dynamic.items():
        catalog.setdefault(name, value)
    return catalog


def load_summary(db_path: Path | str, run_id: int) -> dict[str, object]:
    from storage_paths import open_readonly as _readonly
    conn = _readonly(db_path)
    try:
        row = conn.execute("SELECT * FROM claim_summary WHERE run_id = ?", (run_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else {}


def load_agency(db_path: Path | str, run_id: int) -> str | None:
    from storage_paths import open_readonly as _readonly
    conn = _readonly(db_path)
    try:
        row = conn.execute("SELECT agency FROM runs WHERE id = ?", (run_id,)).fetchone()
    finally:
        conn.close()
    return row[0] if row and row[0] else None


def resolve_version(db_path: Path | str, run_id: int) -> int | None:
    from storage_paths import open_readonly as _readonly
    conn = _readonly(db_path)
    try:
        row = conn.execute(
            "SELECT medical_necessity_extraction_version, medicare_extraction_version FROM claim_summary "
            "WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if row:
            for value in (row[0], row[1]):
                if value:
                    return int(value)
        row = conn.execute(
            "SELECT id FROM extraction_versions WHERE run_id = ? AND kind = 'pcr' ORDER BY version DESC LIMIT 1",
            (run_id,),
        ).fetchone()
        return int(row[0]) if row else None
    finally:
        conn.close()


def candidate_runs(db_path: Path | str, agency: str | None = None, limit: int = 200) -> list[int]:
    from storage_paths import open_readonly as _readonly
    conn = _readonly(db_path)
    try:
        sql = (
            "SELECT run_id FROM claim_summary WHERE medical_necessity_extraction_version IS NOT NULL "
            "AND (mn_review_skipped IS NULL OR mn_review_skipped <> 'Yes') "
            "AND (mn_form_present IS NULL OR mn_form_present <> 'Yes' OR mn_pcs_timely IS NULL "
            "OR mn_pcs_timely <> 'Yes' OR (mn_scheduled_repetitive = 'Yes' AND COALESCE(mn_signer_title, '') <> ''))"
        )
        params: list[object] = []
        if agency:
            sql += " AND agency = ?"
            params.append(agency)
        sql += " ORDER BY COALESCE(pickup_date, pickup_date_time) ASC LIMIT ?"
        params.append(int(limit))
        return [int(row[0]) for row in conn.execute(sql, params)]
    finally:
        conn.close()


def _address(prefix: str, fields: dict[str, str]) -> str:
    street = first_variant(fields.get(f"{prefix}_address"))
    line2 = first_variant(fields.get(f"{prefix}_address_line_2"))
    city = first_variant(fields.get(f"{prefix}_city"))
    state = first_variant(fields.get(f"{prefix}_state"))
    zip_code = first_variant(fields.get(f"{prefix}_zip"))
    tail = " ".join(part for part in (state, zip_code) if part)
    locality = ", ".join(part for part in (city, tail) if part)
    return ", ".join(part for part in (street, line2, locality) if part)


_STATE_ZIP_RE = re.compile(r"^[A-Za-z]{2}\s+\d{5}(?:-\d{4})?$")


def split_address_lines(text: str) -> list[str]:
    parts = [part.strip() for part in (text or "").split(",") if part.strip()]
    if len(parts) >= 2 and _STATE_ZIP_RE.match(parts[-1]):
        parts = [*parts[:-2], ", ".join(parts[-2:])]
    return parts


def _address_lines(fields: dict[str, str]) -> list[str]:
    ordering = first_variant(fields.get("ordering_address"))
    if ordering:
        return split_address_lines(ordering)
    street = first_variant(fields.get("pickup_address"))
    line2 = first_variant(fields.get("pickup_address_line_2"))
    city = first_variant(fields.get("pickup_city"))
    state = first_variant(fields.get("pickup_state"))
    zip_code = first_variant(fields.get("pickup_zip"))
    tail = " ".join(part for part in (state, zip_code) if part)
    locality = ", ".join(part for part in (city, tail) if part)
    return [part for part in (street, line2, locality) if part]


def _room(prefix: str, fields: dict[str, str]) -> str:
    parts = []
    for suffix, label in (("unit", "Unit"), ("floor", "Floor"), ("room", "Room"), ("bed", "Bed")):
        value = first_variant(fields.get(f"{prefix}_{suffix}"))
        if value:
            parts.append(f"{label} {value}")
    return " ".join(parts)


def _place(prefix: str, fields: dict[str, str]) -> str:
    name = first_variant(fields.get(f"{prefix}_facility_name"))
    address = _address(prefix, fields)
    room = _room(prefix, fields)
    return " - ".join(part for part in (name, address, room) if part)


def _patient_name(fields: dict[str, str]) -> str:
    last = first_variant(fields.get("last_name"))
    given = " ".join(
        part
        for part in (
            first_variant(fields.get("first_name")),
            first_variant(fields.get("middle_name")),
        )
        if part
    )
    suffix = first_variant(fields.get("suffix"))
    head = ", ".join(part for part in (last, given) if part)
    return " ".join(part for part in (head, suffix) if part)


def _observations(fields: dict[str, str]) -> list[Observation]:
    out: list[Observation] = []
    for source, label in OBSERVATION_FIELDS:
        text = first_variant(fields.get(source))
        if text:
            out.append(Observation(source=source, label=label, text=text))
    return out


def build_packet(
    fields: dict[str, str],
    summary: dict[str, object] | None = None,
    constants: dict[str, str] | None = None,
    selection: Selection | None = None,
) -> PacketData:
    summary = summary or {}
    constants = constants or load_constants()
    data = PacketData()

    for name, value in fields.items():
        if value and CONFLICT_MARKER in str(value):
            data.conflicts.append(name)

    data.require("patient_name", _patient_name(fields), "patient name")
    dob_value, dob_basis = select_dob_value(
        fields.get("date_of_birth"), fields.get("age"), fields.get("service_date") or summary.get("pickup_date")
    )
    data.require("patient_dob", dob_value, "patient date of birth")
    if dob_basis:
        data.selection_notes.append(f"date of birth: {dob_basis}")
    if fields.get("insurance_coverages"):
        from coverage_chain import chain_for

        _chain = chain_for(fields)
        _primary = _chain[0] if _chain else None
        _member_id = _primary.member_id if _primary else None
        data.set("member_id", first_variant(_member_id) if _member_id else "")
    else:
        data.set("member_id", first_variant(fields.get("policy_number")))
    if not data.values.get("member_id"):
        data.missing.append("Medicare or member identifier")

    service_value = (
        first_variant(summary.get("pickup_date_time"))
        or first_variant(summary.get("pickup_date"))
        or first_variant(fields.get("pickup_date_time"))
        or first_variant(fields.get("service_date"))
    )
    data.service_value = service_value
    parsed = parse_date(service_value)
    data.require("service_date", parsed.isoformat() if parsed else service_value, "date of service")

    claim_ref = " / ".join(
        part
        for part in (
            first_variant(summary.get("run_number")) or first_variant(fields.get("incident_number")),
            first_variant(fields.get("account_number")),
        )
        if part
    )
    data.set("claim_ref", claim_ref)

    level = " ".join(
        part
        for part in (
            first_variant(summary.get("validated_service_level")) or first_variant(summary.get("dispatch_level")),
            first_variant(summary.get("validated_hcpcs_code")),
        )
        if part
    )
    data.set("level_of_service", level)

    data.require("origin", _place("pickup", fields), "origin")
    data.require("destination", _place("destination", fields), "destination")

    data.require("supplier_name", constants.get("supplier_name"), "supplier name (config/pcs.json)")
    data.set("supplier_phone", constants.get("supplier_phone"))
    data.require("supplier_address", constants.get("supplier_address"), "supplier address (config/pcs.json)")
    data.set("supplier_npi", constants.get("supplier_npi"))

    clinician = ""
    clinician_note = ""
    for source, description in CLINICIAN_SOURCES:
        value = first_variant(fields.get(source))
        if value:
            clinician = value
            clinician_note = description
            break
    if not clinician:
        clinician = first_variant(summary.get("mn_signed_by"))
        if clinician:
            clinician_note = "signer of the certification already in the document set"
    certification_owed = selection is None or selection.needed
    if certification_owed:
        data.require("clinician_name", clinician, "certifying clinician name")
    else:
        data.set("clinician_name", clinician)
        if not clinician:
            data.notes.append(
                "No certifying clinician is named, and none is owed: 42 CFR 410.40(e) attaches the certification "
                "requirement to non-emergency transport, and this transport does not fall under it."
            )
    if clinician_note:
        data.notes.append(f"Recipient taken from the {clinician_note}.")

    clinician_address = first_variant(fields.get("ordering_address")) or _address("pickup", fields)
    if certification_owed:
        data.require("clinician_address", clinician_address, "certifying clinician address")
    else:
        data.set("clinician_address", clinician_address)
    if clinician_address and not first_variant(fields.get("ordering_address")):
        data.notes.append(
            "No address was extracted for the clinician; the origin facility address is being used because that is "
            "where the beneficiary received treatment. Confirm the mailing address before this goes out."
        )

    data.recipient_name = data.values.get("clinician_name", "")
    facility = first_variant(fields.get("ordering_facility_name")) or first_variant(fields.get("pickup_facility_name"))
    lines = [data.recipient_name]
    if facility and facility.upper() not in data.recipient_name.upper():
        lines.append(facility)
    lines.extend(_address_lines(fields))
    data.recipient_lines = [line for line in lines if line]

    data.observations = _observations(fields)
    if not data.observations:
        data.notes.append("No crew-documented observations were extracted; the context panel prints empty by design.")

    if data.conflicts:
        data.notes.append(
            "Extraction recorded conflicting values for: "
            + ", ".join(sorted(set(data.conflicts)))
            + ". The first variant was used. Resolve these before mailing."
        )

    if selection is not None and selection.repetitive == "Yes":
        data.notes.append(
            "Repetitive transport: a certification signed after this date of service covers the next 60 days of the "
            "series and cannot cover this trip."
        )

    data.assert_clean()
    return data
