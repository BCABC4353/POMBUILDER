from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from . import emit
from . import geometry as g
from .clock import PATH_NONREPETITIVE, PATH_REPETITIVE, build_clock, parse_date
from .letter import build_letter
from .mapping import PacketData
from .populate import FirmLine, build_certification, build_firm_sheets, firm_line_notes
from .selector import STATUS_REQUIRED, Selection
from .service import PacketBuild


@dataclass(frozen=True)
class Gate:
    code: str
    blocking: bool
    default_checked: bool
    message: str
    fix_hint: str

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "blocking": self.blocking,
            "default_checked": self.default_checked,
            "message": self.message,
            "fix_hint": self.fix_hint,
        }


_G_NO_PATIENT = Gate(
    "no_patient_name", True, False,
    "No patient name on the trip",
    "Enter the patient name on the trip in RescueNet",
)
_G_NO_DOS = Gate(
    "no_date_of_service", True, False,
    "Date of service is missing or unreadable",
    "Confirm the trip date in RescueNet",
)
_G_NO_COMPANY = Gate(
    "no_company", True, False,
    "No company assigned to the trip",
    "Assign the trip to a company in RescueNet",
)
_G_NO_PHYSICIAN = Gate(
    "no_ordering_physician", True, False,
    "No ordering physician on the trip",
    "Enter the ordering physician on the trip in RescueNet",
)
_G_NO_ADDRESSEE = Gate(
    "no_addressee", True, False,
    "No valid mailing address for this trip",
    "Add the ordering facility on the trip; if there is none, the pickup facility needs a street address in Admin > Facilities",
)
_G_STANDING = Gate(
    "standing_order", True, False,
    "Standing order (repetitive patient): a mailed request cannot cure this claim. A PCS signed by the attending physician and dated before the transport is required.",
    "Obtain a PCS signed by the attending physician and dated before the transport",
)
_G_DIALYSIS = Gate(
    "dialysis_facility", False, False,
    "Dialysis facility detected",
    "Confirm this trip requires a PCS",
)
_G_NO_POLICY = Gate(
    "no_policy_number", False, False,
    "No policy number on the current payor; the PCS 'Medicare #' line will print blank.",
    "Add the policy number on the patient's current payor (Customer > Payors)",
)
_G_NO_PAYOR = Gate(
    "no_current_payor", True, False,
    "No current payor on the trip; save the patient's payor in the Current Payor field before mailing.",
    "Set Current Payor on the trip's billing tab in RescueNet",
)
_G_NO_DOB = Gate(
    "no_dob", True, False,
    "No date of birth on the patient; add it on the patient record before mailing.",
    "Customer record > Date of Birth",
)
_G_EMERGENCY = Gate(
    "bill_as_emergency", False, False,
    "Marked bill-as-emergency; a certification may not be required",
    "Confirm whether this trip is truly an emergency transport",
)
_G_ADDR_PICKUP = Gate(
    "addressee_is_pickup", False, False,
    "Using pickup facility as the mailing address (no ordering facility address on file)",
    "Add the ordering facility address in Admin > Facilities",
)
_G_NOT_DIRECT_CARE = Gate(
    "pickup_not_direct_care", False, False,
    "Pickup was not a SNF or hospital; the patient may not have been under a physician's direct care, so a certification may not be required",
    "Confirm the pickup location and whether the patient was under a physician's direct care",
)
_G_CANCELLED = Gate(
    "cancelled_trip", False, False,
    "Trip is cancelled",
    "Confirm the trip status in RescueNet before mailing",
)


_NONE_SENTINELS: frozenset[str] = frozenset({"<none>", "none"})


def _s(row: dict, key: str) -> str:
    text = str(row.get(key) or "").strip()
    if text.lower() in _NONE_SENTINELS:
        return ""
    return text


def _a(row: dict, key: str) -> str:
    return _s(row, key).upper()


def _code(row: dict, key: str) -> str:
    return str(row.get(key) or "").strip().upper()


def _i(row: dict, key: str) -> int:
    text = _code(row, key)
    if not text:
        return 0
    try:
        return int(text)
    except ValueError:
        try:
            return int(float(text))
        except ValueError:
            return 0


def _is_dialysis(row: dict) -> bool:
    for mod_key in ("OrderingModifier", "PickupModifier", "DropoffModifier"):
        if _code(row, mod_key) in ("G", "J"):
            return True
    for name_key in (
        "OrderingFacility", "OrderingFacilityType",
        "PickupFacility", "PickupFacilityType",
        "DropoffFacility", "DropoffFacilityType",
    ):
        if "DIALYSIS" in _s(row, name_key).upper():
            return True
    return False


def gate(row: dict, as_of: date) -> list[Gate]:
    gates: list[Gate] = []

    if not _s(row, "PatientName"):
        gates.append(_G_NO_PATIENT)

    parsed_date = parse_date(row.get("TripDate") or "")
    if parsed_date is None:
        gates.append(_G_NO_DOS)

    if not _s(row, "CompanyName"):
        gates.append(_G_NO_COMPANY)

    if not _s(row, "OrderingDoctorName"):
        gates.append(_G_NO_PHYSICIAN)

    addressee_source = _code(row, "AddresseeSource")

    if addressee_source not in ("ORDERING_FACILITY", "PICKUP_FACILITY"):
        gates.append(_G_NO_ADDRESSEE)

    if _code(row, "SubSeq"):
        gates.append(_G_STANDING)

    if _is_dialysis(row):
        gates.append(_G_DIALYSIS)

    if not _s(row, "MemberID"):
        gates.append(_G_NO_POLICY)

    payor_sys = _code(row, "PayorSystemID")
    if not _s(row, "CurrentPayor") or not payor_sys or payor_sys == "0":
        gates.append(_G_NO_PAYOR)

    if not _s(row, "PatientDOB"):
        gates.append(_G_NO_DOB)

    if _i(row, "BillAsEmergency") == 1:
        gates.append(_G_EMERGENCY)

    if addressee_source == "PICKUP_FACILITY":
        gates.append(_G_ADDR_PICKUP)

    if _code(row, "PickupModifier") not in ("H", "N"):
        gates.append(_G_NOT_DIRECT_CARE)

    if _i(row, "StatusCode") < 0 or _code(row, "TripStatus").startswith("CANCELLED"):
        gates.append(_G_CANCELLED)

    return gates


def constants_for(row: dict) -> dict[str, str]:
    addr = ", ".join(p for p in (_a(row, "CompanyAddr"), _a(row, "CompanyAddr2"), _city_state_zip(row, "Company")) if p)
    contact = ", ".join(p for p in (_s(row, "CompanyContact"), _s(row, "CompanyContactTitle")) if p)

    out: dict[str, str] = {
        "supplier_name": _s(row, "CompanyName"),
        "supplier_address": addr,
        "supplier_phone": _s(row, "CompanyPhone"),
        "supplier_fax": _s(row, "CompanyFax"),
        "supplier_npi": _s(row, "CompanyNPI"),
        "billing_contact": contact,
        "return_instructions": "",
    }

    pcs_path = Path(__file__).resolve().parent.parent / "config" / "pcs.json"
    if pcs_path.exists():
        try:
            raw = json.loads(pcs_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for key in tuple(out.keys()):
                    value = raw.get(key)
                    if value:
                        out[key] = str(value)
        except (OSError, json.JSONDecodeError):
            pass

    for key in ("supplier_phone", "supplier_fax"):
        out[key] = _clean_phone(out[key])

    return out


_EMPTY_EXTENSION = re.compile(r"[\s,;]*\b(?:ext\.?|x)\s*$", re.IGNORECASE)


def _clean_phone(value: str) -> str:
    text = value.strip()
    while True:
        trimmed = _EMPTY_EXTENSION.sub("", text).rstrip(" .,;:-#")
        if trimmed == text:
            return text
        text = trimmed


def recipient_lines(row: dict) -> list[str]:
    doctor = _s(row, "OrderingDoctorName") or "Attending Physician"
    candidates = [
        f"Attn: {doctor}",
        _a(row, "AddresseeFacility"),
        _a(row, "AddresseeAddr"),
        _a(row, "AddresseeAddr2"),
        _city_state_zip(row, "Addressee"),
    ]
    return [ln for ln in candidates if ln]


_RUN_YEAR = re.compile(r"^\s*(\d{2,4})-")


def print_order(row: dict) -> tuple[int, int]:
    hit = _RUN_YEAR.match(str(row.get("RunNumberText") or ""))
    year = int(hit.group(1)) if hit else 0
    if 0 < year < 100:
        year += 2000
    return year, _i(row, "RunNumber")


def firm_line(row: dict, identifier: str) -> FirmLine:
    doctor = _s(row, "OrderingDoctorName") or "Attending Physician"
    return FirmLine(
        attention=f"Attn: {doctor}",
        facility=_a(row, "AddresseeFacility"),
        street=", ".join(p for p in (_a(row, "AddresseeAddr"), _a(row, "AddresseeAddr2")) if p),
        city_state_zip=_city_state_zip(row, "Addressee"),
        identifier=identifier,
    )


def _city_state_zip(row: dict, prefix: str) -> str:
    state_zip = " ".join(p for p in (_a(row, f"{prefix}State"), _a(row, f"{prefix}Zip")) if p)
    return ", ".join(p for p in (_a(row, f"{prefix}City"), state_zip) if p)


def _rn_place(row: dict, prefix: str) -> str:
    address = ", ".join(
        p for p in (_a(row, f"{prefix}Addr"), _a(row, f"{prefix}Addr2"), _city_state_zip(row, prefix)) if p
    )
    return " - ".join(p for p in (_a(row, f"{prefix}Facility"), address) if p)


def _form_date(value: str) -> str:
    parsed = parse_date(value)
    return parsed.strftime("%m/%d/%Y") if parsed else value


def _form_place(row: dict, prefix: str) -> str:
    facility = _a(row, f"{prefix}Facility")
    if facility and _i(row, f"{prefix}IsResidence") != 1:
        return facility
    where = ", ".join(p for p in (_a(row, f"{prefix}Addr"), _a(row, f"{prefix}City")) if p)
    return " - ".join(p for p in ("RESIDENCE", where) if p)


def to_build(row: dict, as_of: date, generated_on: date) -> PacketBuild:
    subseq = _code(row, "SubSeq")
    repetitive = "Yes" if subseq else "No"
    path = PATH_REPETITIVE if subseq else PATH_NONREPETITIVE

    pickup_mod = _code(row, "PickupModifier")
    if pickup_mod in ("H", "N"):
        direct_care = "Yes"
    elif pickup_mod in ("R", "E"):
        direct_care = "No"
    else:
        direct_care = "Unknown"

    selection = Selection(
        status=STATUS_REQUIRED,
        form="PCS",
        alternate="NPCS",
        repetitive=repetitive,
        path=path,
        direct_care=direct_care,
    )

    consts = constants_for(row)

    data = PacketData()
    data.set("patient_name", _s(row, "PatientName"))
    data.set("patient_dob", _form_date(_s(row, "PatientDOB")))
    data.set("member_id", _s(row, "MemberID"))

    trip_date = _s(row, "TripDate")
    data.set("service_date", _form_date(trip_date))
    data.service_value = trip_date

    data.set("claim_ref", _s(row, "RunNumberText"))

    data.set("origin", _rn_place(row, "Pickup"))
    data.set("destination", _rn_place(row, "Dropoff"))

    data.set("supplier_name", consts.get("supplier_name", ""))
    data.set("supplier_address", consts.get("supplier_address", ""))
    data.set("supplier_phone", consts.get("supplier_phone", ""))
    data.set("supplier_fax", consts.get("supplier_fax", ""))
    data.set("supplier_npi", consts.get("supplier_npi", ""))
    data.set("clinician_name", _s(row, "OrderingDoctorName"))

    rlines = recipient_lines(row)
    char_limit = g.chars_across(g.CONTENT_WIDTH, g.SIZE_BODY)
    wrapped: list[str] = []
    for ln in rlines:
        parts = g.wrap_chars(ln, char_limit)
        wrapped.extend(parts if parts else [])
    filtered = [ln for ln in wrapped if ln.strip()]
    data.recipient_name = filtered[0] if filtered else ""
    data.recipient_lines = filtered

    data.assert_clean()

    clock = build_clock(
        trip_date,
        path=path,
        repetitive=repetitive,
        as_of=as_of,
        generated_on=generated_on,
    )

    fields: dict[str, str] = {
        "destination_reason": _s(row, "TransportReason"),
        "origin_form": _form_place(row, "Pickup"),
        "destination_form": _form_place(row, "Dropoff"),
    }

    cert_sheet = build_certification(data, selection, clock, consts, fields, generated_on, source="rescuenet")
    letter_doc = build_letter(data, selection, clock, consts, "PCS", generated_on, source="rescuenet")

    return PacketBuild(
        run_id=_i(row, "TripID"),
        version_id=0,
        agency=None,
        run_number=str(row.get("RunNumberText") or ""),
        kind="PCS",
        selection=selection,
        data=data,
        clock=clock,
        documents=(cert_sheet, letter_doc),
    )


def collate(
    builds: list[PacketBuild],
    rows: list[dict],
    out_pdf: Path,
    batch_id: str,
    generated_on: date,
) -> list[dict]:
    row_by_id: dict[int, dict] = {_i(r, "TripID"): r for r in rows}
    sorted_builds = sorted(builds, key=lambda b: print_order(row_by_id.get(b.run_id, {})))

    flines = [firm_line(row_by_id.get(build.run_id, {}), build.run_number or "") for build in sorted_builds]
    first_row = row_by_id.get(sorted_builds[0].run_id, {}) if sorted_builds else {}
    sender_consts = constants_for(first_row)
    firm_items = build_firm_sheets(flines, sender_consts, batch_id, generated_on)
    firm_notes = firm_line_notes(flines, sender_consts)

    all_items: list = list(firm_items)
    page_counter = 1 + sum(emit.page_count(item) for item in firm_items)

    hold_until = (generated_on + timedelta(days=21)).isoformat()

    manifest: list[dict] = []
    for idx, build in enumerate(sorted_builds):
        row = row_by_id.get(build.run_id, {})
        cert_doc, letter_doc = build.documents

        pcs_page = page_counter
        page_counter += emit.page_count(cert_doc)
        letter_page = page_counter
        page_counter += emit.page_count(letter_doc)

        all_items.extend((cert_doc, letter_doc))

        gates_list = gate(row, generated_on)

        manifest.append({
            "RunNumberText": build.run_number,
            "TripDate": str(row.get("TripDate") or ""),
            "AddresseeSource": str(row.get("AddresseeSource") or ""),
            "firm_sheet": idx // 6 + 1,
            "firm_line": idx % 6 + 1,
            "pcs_page": pcs_page,
            "letter_page": letter_page,
            "hold_until": hold_until,
            "gate_codes": [gobj.code for gobj in gates_list],
            "notes": [*build.data.notes, *firm_notes[idx]],
        })

    emit.merge(all_items, out_pdf)
    return manifest
