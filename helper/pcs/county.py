from __future__ import annotations

import re

FORM_SOLANO = "SOLANO"
FORM_NORCAL = "NORCAL"

COUNTY_FORM_AGENCIES: frozenset[str] = frozenset({"medic"})

SOLANO_ZIPS: frozenset[str] = frozenset({
    "94510", "94512", "94533", "94534", "94535", "94571", "94585", "94589",
    "94590", "94591", "94592", "95620", "95625", "95687", "95688", "95696",
})

_ZIP5 = re.compile(r"\d{5}")


def zip5(text: object) -> str:
    hit = _ZIP5.match(str(text or "").strip())
    return hit.group(0) if hit else ""


def county_form(zip_text: object) -> str:
    return FORM_SOLANO if zip5(zip_text) in SOLANO_ZIPS else FORM_NORCAL


def uses_county_forms(agency: str | None) -> bool:
    return (agency or "").strip().lower() in COUNTY_FORM_AGENCIES
