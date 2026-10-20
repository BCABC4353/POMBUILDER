import json
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

import pcs.rescuenet as rescuenet
from pcs.clock import PATH_NONREPETITIVE, PATH_REPETITIVE, build_clock
from pcs.emit import as_text
from pcs.letter import build_letter
from pcs.mapping import PacketData
from pcs.selector import PATH_NONREPETITIVE as _PATH_NR, STATUS_REQUIRED, Selection
import pcs.populate as populate

AS_OF = date(2026, 2, 10)
GENERATED_ON = date(2026, 2, 10)

EXTRACTOR_ROOT = Path(__file__).resolve().parents[3] / "EXTRACTOR"


@pytest.fixture
def rows():
    path = Path(__file__).parent / "fixtures" / "synthetic_rows.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_clean_row_no_gates(rows):
    gates = rescuenet.gate(rows["clean"], AS_OF)
    assert gates == []


def test_clean_row_two_docs_and_mailing(rows):
    build = rescuenet.to_build(rows["clean"], AS_OF, GENERATED_ON)
    assert len(build.documents) == 2
    assert build.mailing is not None


@pytest.mark.parametrize("gate_code,trigger_key", [
    ("no_patient_name", "no_patient_name"),
    ("no_date_of_service", "no_date_of_service"),
    ("no_company", "no_company"),
    ("no_ordering_physician", "no_ordering_physician"),
    ("no_addressee", "no_addressee"),
    ("standing_order", "standing_order"),
    ("dialysis_facility", "dialysis_facility"),
    ("no_policy_number", "no_member_id"),
    ("no_current_payor", "no_current_payor"),
    ("no_dob", "no_dob"),
    ("bill_as_emergency", "bill_as_emergency"),
    ("addressee_is_pickup", "addressee_is_pickup"),
    ("inside_21_days", "inside_21_days"),
])
def test_gate_fires_on_trigger(rows, gate_code, trigger_key):
    gates = rescuenet.gate(rows[trigger_key], AS_OF)
    codes = [g.code for g in gates]
    assert gate_code in codes


def test_gate_asdict(rows):
    gates = rescuenet.gate(rows["no_member_id"], AS_OF)
    matching = [g for g in gates if g.code == "no_policy_number"]
    assert matching
    d = matching[0].as_dict()
    assert d["code"] == "no_policy_number"
    assert d["blocking"] is False
    assert d["default_checked"] is True
    assert isinstance(d["message"], str)
    assert isinstance(d["fix_hint"], str)


def test_recipient_lines_order_and_blank_dropping(rows):
    rlines = rescuenet.recipient_lines(rows["clean"])
    assert rlines[0].startswith("Attn:")
    assert "Garcia" in rlines[0]
    assert any("Valley Medical Center" in l for l in rlines)
    assert any("Sacramento" in l for l in rlines)
    assert all(l.strip() for l in rlines)


def test_recipient_lines_no_doctor_uses_attending_physician(rows):
    row = dict(rows["clean"])
    row["OrderingDoctorName"] = ""
    rlines = rescuenet.recipient_lines(row)
    assert rlines[0] == "Attn: Attending Physician"


def test_recipient_lines_drops_blank_addr2(rows):
    rlines = rescuenet.recipient_lines(rows["clean"])
    assert all(l.strip() for l in rlines)
    assert "" not in rlines


def test_standing_order_clock_path_repetitive(rows):
    build = rescuenet.to_build(rows["standing_order"], AS_OF, GENERATED_ON)
    assert build.clock is not None
    assert build.clock.path == PATH_REPETITIVE


def test_nonrepetitive_clock_path(rows):
    build = rescuenet.to_build(rows["clean"], AS_OF, GENERATED_ON)
    assert build.clock is not None
    assert build.clock.path == PATH_NONREPETITIVE


def _minimal_data():
    data = PacketData()
    data.set("patient_name", "Patient, Test")
    data.set("patient_dob", "1950-01-01")
    data.set("service_date", "2026-01-15")
    data.set("supplier_name", "Metro Ambulance")
    data.set("supplier_address", "100 Main St, Sacramento, CA 95814")
    data.set("origin", "Valley Hospital")
    data.set("destination", "Regional Hospital")
    data.recipient_name = "Dr. Test"
    data.recipient_lines = ["Dr. Test", "Valley Hospital", "100 Main St, Sacramento, CA 95814"]
    return data


def _minimal_selection(repetitive="No"):
    path = PATH_REPETITIVE if repetitive == "Yes" else PATH_NONREPETITIVE
    return Selection(
        status=STATUS_REQUIRED,
        form="PCS",
        alternate="NPCS",
        repetitive=repetitive,
        path=path,
        direct_care="Yes",
    )


def _ops_text(doc) -> str:
    parts = []
    for page in doc.pages:
        for op in page.ops:
            if hasattr(op, "text"):
                parts.append(op.text)
    return " ".join(parts).lower()


def test_rescuenet_letter_no_epcr_phrases():
    data = _minimal_data()
    selection = _minimal_selection()
    clock = build_clock("2026-01-15", PATH_NONREPETITIVE, "No", as_of=AS_OF, generated_on=GENERATED_ON)
    letter = build_letter(data, selection, clock, {}, "PCS", GENERATED_ON, source="rescuenet")
    text = _ops_text(letter)
    assert "patient care report" not in text
    assert "observations" not in text
    assert "level of service" not in text
    assert "who the patient is, and where and when we transported" in text


def test_epcr_letter_retains_original_phrases():
    data = _minimal_data()
    selection = _minimal_selection()
    clock = build_clock("2026-01-15", PATH_NONREPETITIVE, "No", as_of=AS_OF, generated_on=GENERATED_ON)
    letter = build_letter(data, selection, clock, {}, "PCS", GENERATED_ON, source="epcr")
    text = _ops_text(letter)
    assert "patient care report" in text
    assert "level of service we billed" in text
    assert "observations" in text


def test_epcr_letter_byte_identical_default():
    data = _minimal_data()
    selection = _minimal_selection()
    clock = build_clock("2026-01-15", PATH_NONREPETITIVE, "No", as_of=AS_OF, generated_on=GENERATED_ON)
    explicit = build_letter(data, selection, clock, {}, "PCS", GENERATED_ON, source="epcr")
    default = build_letter(data, selection, clock, {}, "PCS", GENERATED_ON)
    assert as_text(explicit) == as_text(default)


def test_collate_three_rows_nine_pages_and_order(rows, tmp_path):
    import fitz

    row1 = dict(rows["clean"])
    row2 = dict(rows["clean"])
    row2["TripID"] = 2001
    row2["RunNumber"] = 2001
    row2["RunNumberText"] = "26-2001"
    row3 = dict(rows["clean"])
    row3["TripID"] = 3001
    row3["RunNumber"] = 3001
    row3["RunNumberText"] = "26-3001"
    test_rows = [row1, row2, row3]

    builds = [rescuenet.to_build(r, AS_OF, GENERATED_ON) for r in test_rows]
    out_pdf = tmp_path / "test_collate.pdf"
    manifest = rescuenet.collate(
        builds, test_rows, out_pdf, firm_sheets=False, batch_id="TEST001", generated_on=GENERATED_ON
    )

    doc = fitz.open(str(out_pdf))
    total_pages = doc.page_count
    doc.close()

    assert total_pages == 9
    assert len(manifest) == 3
    assert manifest[0]["RunNumberText"] == "26-1001"
    assert manifest[1]["RunNumberText"] == "26-2001"
    assert manifest[2]["RunNumberText"] == "26-3001"
    assert manifest[0]["page_start"] == 1
    assert manifest[0]["page_end"] == 3
    assert manifest[1]["page_start"] == 4
    assert manifest[1]["page_end"] == 6
    assert manifest[2]["page_start"] == 7
    assert manifest[2]["page_end"] == 9


def test_collate_sorted_by_run_number_regardless_of_input_order(rows, tmp_path):
    import fitz

    row_a = dict(rows["clean"])
    row_a["TripID"] = 300
    row_a["RunNumber"] = 300
    row_a["RunNumberText"] = "26-0300"

    row_b = dict(rows["clean"])
    row_b["TripID"] = 100
    row_b["RunNumber"] = 100
    row_b["RunNumberText"] = "26-0100"

    row_c = dict(rows["clean"])
    row_c["TripID"] = 200
    row_c["RunNumber"] = 200
    row_c["RunNumberText"] = "26-0200"

    test_rows = [row_a, row_b, row_c]
    builds = [rescuenet.to_build(r, AS_OF, GENERATED_ON) for r in test_rows]
    out_pdf = tmp_path / "test_sort.pdf"
    manifest = rescuenet.collate(
        builds, test_rows, out_pdf, firm_sheets=False, batch_id="SORT01", generated_on=GENERATED_ON
    )

    assert manifest[0]["RunNumberText"] == "26-0100"
    assert manifest[1]["RunNumberText"] == "26-0200"
    assert manifest[2]["RunNumberText"] == "26-0300"


@pytest.mark.skipif(not hasattr(populate, "build_firm_sheets"), reason="Task 3 not yet complete")
def test_collate_firm_sheets_prepends_pages(rows, tmp_path):
    import fitz

    test_rows = []
    for i in range(7):
        r = dict(rows["clean"])
        r["TripID"] = 7000 + i
        r["RunNumber"] = 7000 + i
        r["RunNumberText"] = f"26-{7000 + i}"
        test_rows.append(r)

    builds = [rescuenet.to_build(r, AS_OF, GENERATED_ON) for r in test_rows]
    out_pdf = tmp_path / "test_firm.pdf"
    manifest = rescuenet.collate(
        builds, test_rows, out_pdf, firm_sheets=True, batch_id="FS001", generated_on=GENERATED_ON
    )

    doc = fitz.open(str(out_pdf))
    total_pages = doc.page_count
    doc.close()

    assert total_pages == 23
    assert manifest[0]["firm_page"] == 1
    assert manifest[0]["firm_line"] == 1
    assert manifest[5]["firm_page"] == 1
    assert manifest[5]["firm_line"] == 6
    assert manifest[6]["firm_page"] == 2
    assert manifest[6]["firm_line"] == 1


def test_pena_jose_renders_without_error(rows):
    build = rescuenet.to_build(rows["pena_jose"], AS_OF, GENERATED_ON)
    assert build is not None
    assert len(build.documents) == 2


def test_long_facility_renders_without_slotoverflow(rows):
    row = rows["long_facility"]
    assert len(row["AddresseeFacility"]) >= 120
    build = rescuenet.to_build(row, AS_OF, GENERATED_ON)
    assert build is not None
    assert len(build.documents) == 2


@pytest.mark.parametrize("system_id,current_payor,expect_gate", [
    ("0", "Medicare", True),
    ("", "Medicare", True),
    (None, "Medicare", True),
    ("1", "", True),
    ("1", None, True),
    ("1", "Medicare", False),
    ("2", "Medicare", False),
    ("4", "Medicare", False),
    ("5", "Medicare", False),
])
def test_no_current_payor_conditions(rows, system_id, current_payor, expect_gate):
    row = dict(rows["clean"])
    row["PayorSystemID"] = system_id
    row["CurrentPayor"] = current_payor
    fired = any(g.code == "no_current_payor" for g in rescuenet.gate(row, AS_OF))
    assert fired == expect_gate


@pytest.mark.parametrize("value,expect_fire", [
    ("   ", False),
    ("Y", False),
    ("1.0", True),
    ("abc", False),
])
def test_bill_as_emergency_coercion(rows, value, expect_fire):
    row = dict(rows["clean"])
    row["BillAsEmergency"] = value
    fired = any(g.code == "bill_as_emergency" for g in rescuenet.gate(row, AS_OF))
    assert fired == expect_fire


@pytest.mark.parametrize("run_number", ["   ", "Y", "1.0", "abc"])
def test_run_number_non_integer_does_not_crash(rows, run_number, tmp_path):
    row = dict(rows["clean"])
    row["RunNumber"] = run_number
    build = rescuenet.to_build(row, AS_OF, GENERATED_ON)
    manifest = rescuenet.collate(
        [build], [row], tmp_path / "test.pdf", firm_sheets=False, batch_id="RN", generated_on=GENERATED_ON
    )
    assert len(manifest) == 1


_WHITESPACE_ROW = {k: "   " for k in (
    "TripID", "RunNumber", "RunNumberText", "TripDate", "Job", "StatusCode",
    "TripStatus", "Event", "SubSeq", "BillAsEmergency", "CompanyName", "CompanyAddr",
    "CompanyAddr2", "CompanyCity", "CompanyState", "CompanyZip", "CompanyPhone",
    "CompanyFax", "CompanyNPI", "CompanyContact", "CompanyContactTitle", "CustomerNumber",
    "PatientName", "PatientMiddleInitial", "PatientDOB", "MemberID", "CurrentPayor",
    "PayorSystemID", "PickupIsResidence", "PickupFacility", "PickupFacilityType",
    "PickupModifier", "PickupAddr", "PickupAddr2", "PickupCity", "PickupState", "PickupZip",
    "DropoffFacility", "DropoffFacilityType", "DropoffModifier", "DropoffAddr", "DropoffAddr2",
    "DropoffCity", "DropoffState", "DropoffZip", "OrderingFacilityCode", "OrderingFacility",
    "OrderingFacilityType", "OrderingModifier", "OrderingDoctorCode", "OrderingDoctorName",
    "OrderingDoctorNPI", "AddresseeSource", "AddresseeFacility", "AddresseeAddr",
    "AddresseeAddr2", "AddresseeCity", "AddresseeState", "AddresseeZip", "TransportReason",
)}


def test_all_whitespace_row_does_not_raise():
    assert len(_WHITESPACE_ROW) == 60
    gates = rescuenet.gate(_WHITESPACE_ROW, AS_OF)
    assert isinstance(gates, list)
    rlines = rescuenet.recipient_lines(_WHITESPACE_ROW)
    assert isinstance(rlines, list)
    consts = rescuenet.constants_for(_WHITESPACE_ROW)
    assert isinstance(consts, dict)
    build = rescuenet.to_build(_WHITESPACE_ROW, AS_OF, GENERATED_ON)
    assert build is not None


_NULL_ROW = {k: None for k in (
    "TripID", "RunNumber", "RunNumberText", "TripDate", "Job", "StatusCode",
    "TripStatus", "Event", "SubSeq", "BillAsEmergency", "CompanyName", "CompanyAddr",
    "CompanyAddr2", "CompanyCity", "CompanyState", "CompanyZip", "CompanyPhone",
    "CompanyFax", "CompanyNPI", "CompanyContact", "CompanyContactTitle", "CustomerNumber",
    "PatientName", "PatientMiddleInitial", "PatientDOB", "MemberID", "CurrentPayor",
    "PayorSystemID", "PickupIsResidence", "PickupFacility", "PickupFacilityType",
    "PickupModifier", "PickupAddr", "PickupAddr2", "PickupCity", "PickupState", "PickupZip",
    "DropoffFacility", "DropoffFacilityType", "DropoffModifier", "DropoffAddr", "DropoffAddr2",
    "DropoffCity", "DropoffState", "DropoffZip", "OrderingFacilityCode", "OrderingFacility",
    "OrderingFacilityType", "OrderingModifier", "OrderingDoctorCode", "OrderingDoctorName",
    "OrderingDoctorNPI", "AddresseeSource", "AddresseeFacility", "AddresseeAddr",
    "AddresseeAddr2", "AddresseeCity", "AddresseeState", "AddresseeZip", "TransportReason",
)}


def test_all_60_columns_none_does_not_raise():
    assert len(_NULL_ROW) == 60
    gates = rescuenet.gate(_NULL_ROW, AS_OF)
    assert isinstance(gates, list)
    rlines = rescuenet.recipient_lines(_NULL_ROW)
    assert isinstance(rlines, list)
    consts = rescuenet.constants_for(_NULL_ROW)
    assert isinstance(consts, dict)


def test_import_clean():
    extractor_path = str(EXTRACTOR_ROOT)
    script = (
        "import sys; "
        f"sys.path.insert(0, r'{extractor_path}'); "
        "import pcs.rescuenet; "
        "assert 'claim_record' not in sys.modules, 'claim_record imported at module level'; "
        "assert 'definitions' not in sys.modules, 'definitions imported at module level'; "
        "print('ok')"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Import check failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    assert "ok" in result.stdout
