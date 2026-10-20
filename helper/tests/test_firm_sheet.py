from __future__ import annotations

from datetime import date

import pytest


def _make_lines(n: int):
    from pcs.populate import FirmLine

    return [
        FirmLine(
            recipient_name=f"Facility {i + 1}",
            lines=("123 Main St", "Springfield, CA 90210"),
            identifier=f"26-{i + 1:04d}",
        )
        for i in range(n)
    ]


def _make_constants():
    return {
        "supplier_name": "BC Ambulance",
        "supplier_address": "456 Oak Ave, Anytown, CA 90001",
    }


def test_13_lines_produce_3_sheets():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(13)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert len(sheets) == 3


def test_sheet_totals_6_6_1():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(13)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert sheets[0].values["total_listed"] == "6"
    assert sheets[1].values["total_listed"] == "6"
    assert sheets[2].values["total_listed"] == "1"


def test_page_counters():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(13)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert sheets[0].values["page_n"] == "1"
    assert sheets[0].values["page_of"] == "3"
    assert sheets[1].values["page_n"] == "2"
    assert sheets[1].values["page_of"] == "3"
    assert sheets[2].values["page_n"] == "3"
    assert sheets[2].values["page_of"] == "3"


def test_identifier_is_run_number():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(2)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert sheets[0].values["line1_identifier"] == "26-0001"
    assert sheets[0].values["line2_identifier"] == "26-0002"


def test_address_text_populated():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(1)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    addr = sheets[0].values["line1_address"]
    assert "Facility 1" in addr
    assert "123 Main St" in addr


def test_postage_slots_absent():
    from pcs.forms import USPS_3665_TEMPLATE
    from pcs.populate import build_firm_sheets

    lines = _make_lines(1)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    slot_keys = {s.key for s in USPS_3665_TEMPLATE.slots}
    assert "postage" not in slot_keys
    assert "fee" not in slot_keys
    clerk_blank_owners = {b.owner for b in USPS_3665_TEMPLATE.blanks}
    assert "usps_clerk" in clerk_blank_owners
    assert "mailer" in clerk_blank_owners


def test_render_succeeds_with_correct_page_size():
    from pcs.overlay import render
    from pcs.populate import build_firm_sheets

    lines = _make_lines(6)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    doc = render(sheets[0])
    try:
        page = doc[0]
        assert abs(page.rect.width - 792.0) < 1.0
        assert abs(page.rect.height - 612.0) < 1.0
    finally:
        doc.close()


def test_single_line_sheet():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(1)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert len(sheets) == 1
    assert sheets[0].values["total_listed"] == "1"
    assert sheets[0].values["page_n"] == "1"
    assert sheets[0].values["page_of"] == "1"


def test_exactly_6_lines_one_sheet():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(6)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert len(sheets) == 1


def test_long_facility_name_no_overflow():
    from pcs.populate import FirmLine, build_firm_sheets
    from pcs.overlay import render

    long_name = "A" * 120
    lines = [
        FirmLine(
            recipient_name=long_name,
            lines=("123 Long Street Name That Is Also Quite Long, City, CA 90210",),
            identifier="26-0001",
        )
    ]
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    doc = render(sheets[0])
    try:
        assert doc.page_count == 1
    finally:
        doc.close()


def test_accented_name_no_overflow():
    from pcs.populate import FirmLine, build_firm_sheets
    from pcs.overlay import render

    lines = [
        FirmLine(
            recipient_name="Pena, Jose",
            lines=("789 Elm Dr", "Miramar, CA 92126"),
            identifier="26-0001",
        )
    ]
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    doc = render(sheets[0])
    try:
        assert doc.page_count == 1
    finally:
        doc.close()


def test_sender_lines_populated():
    from pcs.populate import build_firm_sheets

    lines = _make_lines(1)
    sheets = build_firm_sheets(lines, _make_constants(), batch_id="B001", generated_on=date(2026, 10, 19))
    assert sheets[0].values.get("sender_1") == "BC Ambulance"
