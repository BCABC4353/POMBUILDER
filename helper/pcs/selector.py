from __future__ import annotations

import re
from dataclasses import dataclass

CONFLICT_MARKER = "<|>"

STATUS_REQUIRED = "packet_required"
STATUS_ON_FILE = "certification_on_file"
STATUS_NOT_REQUIRED = "not_required"
STATUS_INDETERMINATE = "indeterminate"
STATUS_PROSPECTIVE_ONLY = "prospective_only"

CITE_MEDI_CAL_PROSPECTIVE = (
    "APL 22-008 certification is valid for the dates of service stated on the form, not to exceed 12 months"
)
CITE_MEDI_CAL_POST_SERVICE = (
    "APL 22-008 telephone authorization for an urgent covered service where a PCS could not reasonably have been "
    "submitted beforehand - the PCS must still be submitted post-service"
)

PATH_NONREPETITIVE = "nonrepetitive_21_day"
PATH_REPETITIVE = "repetitive_prospective"
PATH_UNKNOWN = "unknown"

PHYSICIAN_TOKENS = ("MD", "M.D.", "DO", "D.O.", "PHYSICIAN", "DOCTOR", "ATTENDING")
NON_PHYSICIAN_TOKENS = (
    "PHYSICIAN ASSISTANT",
    "PA-C",
    "PA",
    "NURSE PRACTITIONER",
    "NP",
    "APRN",
    "CLINICAL NURSE SPECIALIST",
    "CNS",
    "REGISTERED NURSE",
    "RN",
    "LPN",
    "LVN",
    "SOCIAL WORKER",
    "LCSW",
    "MSW",
    "CASE MANAGER",
    "DISCHARGE PLANNER",
)


def _token_pattern(tokens: tuple[str, ...]) -> re.Pattern[str]:
    return re.compile(r"(?<![A-Z0-9])(?:" + "|".join(re.escape(t) for t in tokens) + r")(?![A-Z0-9])")


_NON_PHYSICIAN_RE = _token_pattern(NON_PHYSICIAN_TOKENS)
_PHYSICIAN_RE = _token_pattern(PHYSICIAN_TOKENS)

DIRECT_CARE_TOKENS = (
    "SKILLED NURSING",
    "NURSING FACILITY",
    "NURSING HOME",
    "SNF",
    "HOSPITAL",
    "MEDICAL CENTER",
    "EMERGENCY DEPARTMENT",
    "EMERGENCY ROOM",
    "REHABILITATION",
    "REHAB",
    "LONG TERM ACUTE",
    "LTAC",
)

CUSTODIAL_TOKENS = (
    "RESIDENCE",
    "PRIVATE HOME",
    "PATIENT HOME",
    "HOME",
    "APARTMENT",
    "ASSISTED LIVING",
    "GROUP HOME",
    "DOMICILIARY",
    "INDEPENDENT LIVING",
    "SCENE",
)


@dataclass(frozen=True)
class Selection:
    status: str
    form: str | None
    alternate: str | None
    repetitive: str
    path: str
    direct_care: str
    reasons: tuple[str, ...] = ()
    review: tuple[str, ...] = ()

    @property
    def needed(self) -> bool:
        return self.status == STATUS_REQUIRED

    def as_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "form": self.form,
            "alternate": self.alternate,
            "repetitive": self.repetitive,
            "path": self.path,
            "direct_care": self.direct_care,
            "needed": self.needed,
            "reasons": list(self.reasons),
            "review": list(self.review),
        }


def first_variant(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if CONFLICT_MARKER in text:
        text = text.split(CONFLICT_MARKER)[0].strip()
    return text


AGE_TIEBREAK_RULE = (
    "When two sources disagree on a date of birth, the variant whose age on the date of service equals the age "
    "printed on the record is chosen; where the test cannot decide, the first variant stands. Measured across "
    "every corpus it agrees with the Patient Care Report 66 times and with the attached hospital document 0 "
    "times. It is a tie-break, not a merge: the conflict stays recorded, because a facility record can be the "
    "correct one and the age itself can be conflicted."
)

DISPUTED_LABELS: dict[str, str] = {
    "date_of_birth": "the patient's date of birth",
    "age": "the patient's age",
    "policy_number": "the policy number",
    "mrn": "the medical record number",
    "ssn": "the social security number",
    "home_address": "the patient's address",
    "destination_facility_name": "the destination facility",
    "pickup_facility_name": "the pickup facility",
}

_DATE_PARTS_RE = re.compile(r"\A(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})")
_ISO_PARTS_RE = re.compile(r"\A(\d{4})-(\d{2})-(\d{2})")
_AGE_YEARS_RE = re.compile(r"(\d{1,3})\s*(?:y|yr|yrs|year|years)?\b", re.IGNORECASE)
_SUBYEAR_RE = re.compile(r"\b(day|days|month|months|mo|mos|week|weeks|wk|wks)\b", re.IGNORECASE)


def _date_parts(value) -> tuple[int, int, int] | None:
    text = str(value or "").strip()
    if not text:
        return None
    iso = _ISO_PARTS_RE.match(text)
    if iso:
        return (int(iso.group(2)), int(iso.group(3)), int(iso.group(1)))
    m = _DATE_PARTS_RE.match(text)
    if not m:
        return None
    month, day, raw_year = int(m.group(1)), int(m.group(2)), m.group(3)
    if len(raw_year) == 2:
        year = 1900 + int(raw_year) if int(raw_year) > 30 else 2000 + int(raw_year)
    else:
        year = int(raw_year)
    if not (1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100):
        return None
    return (month, day, year)


def _age_years(value) -> int | None:
    text = str(value or "").strip()
    if not text or CONFLICT_MARKER in text or _SUBYEAR_RE.search(text):
        return None
    m = _AGE_YEARS_RE.search(text)
    if not m:
        return None
    years = int(m.group(1))
    return years if 0 <= years <= 130 else None


def select_dob_value(dob_value, age_value, service_value) -> tuple[str, str | None]:
    text = str(dob_value or "").strip()
    if CONFLICT_MARKER not in text:
        return (text, None)
    parts = [p.strip() for p in text.split(CONFLICT_MARKER) if p.strip()]
    if not parts:
        return ("", None)
    first = parts[0]
    stated = _age_years(age_value)
    service = _date_parts(service_value)
    if stated is None or service is None or len(parts) < 2:
        return (first, None)
    smo, sdy, syr = service
    agreeing = []
    for candidate in parts:
        d = _date_parts(candidate)
        if d is None:
            continue
        bmo, bdy, byr = d
        if syr - byr - ((smo, sdy) < (bmo, bdy)) == stated:
            agreeing.append(candidate)
    if len(agreeing) != 1 or agreeing[0] == first:
        return (first, None)
    return (agreeing[0], f"age {stated} on {str(service_value).strip()} matches {agreeing[0]}, not {first}")


def tri(value) -> str:
    text = first_variant(value).lower()
    if text in {"yes", "true", "y", "1"}:
        return "Yes"
    if text in {"no", "false", "n", "0"}:
        return "No"
    return "Unknown"


def signer_is_physician(title, name) -> str:
    blob = f"{first_variant(title)} {first_variant(name)}".upper()
    if not blob.strip():
        return "Unknown"
    if _NON_PHYSICIAN_RE.search(blob):
        return "No"
    if _PHYSICIAN_RE.search(blob):
        return "Yes"
    return "Unknown"


def repetitive_state(summary: dict[str, object] | None) -> str:
    summary = summary or {}
    extracted = tri(summary.get("repetitive_transport"))
    if extracted != "Unknown":
        return extracted
    return tri(summary.get("mn_scheduled_repetitive"))


def direct_care_state(fields: dict[str, str] | None, summary: dict[str, object] | None) -> str:
    fields = fields or {}
    summary = summary or {}
    extracted = tri(summary.get("origin_under_physician_care"))
    if extracted != "Unknown":
        return extracted
    reviewed = tri(summary.get("mn_form_required"))
    if reviewed != "Unknown":
        return reviewed
    blob = " ".join(
        first_variant(part).upper()
        for part in (
            fields.get("pickup_location_type"),
            fields.get("pickup_facility_name"),
            fields.get("ordering_facility_name"),
            summary.get("validated_autopsy_origin"),
        )
        if part
    )
    if not blob.strip():
        return "Unknown"
    for token in DIRECT_CARE_TOKENS:
        if token in blob:
            return "Yes"
    for token in CUSTODIAL_TOKENS:
        if token in blob:
            return "No"
    return "Unknown"


def medi_cal_standing(fields: dict[str, str] | None) -> tuple[bool, str]:
    fields = fields or {}
    try:
        if fields.get("insurance_coverages"):
            from coverage_chain import chain_for
            from medi_cal.payers import standing_from_chain

            standing = standing_from_chain(chain_for(fields))
        else:
            from medi_cal.payers import medi_cal_standing as standing_of

            standing = standing_of(fields.get("insurance_list"))
    except ImportError:
        return (False, "")
    if not standing.billable_here:
        return (False, "")
    return (True, standing.payer)


def post_service_permitted(fields: dict[str, str] | None, summary: dict[str, object] | None) -> bool:
    fields = fields or {}
    summary = summary or {}
    blob = " ".join(
        first_variant(part).upper()
        for part in (
            fields.get("authorization_number"),
            fields.get("destination_reason"),
            fields.get("transport_reason"),
            summary.get("validated_emergency_status"),
        )
        if part
    )
    return bool(re.search(r"TELEPHON|VERBAL\s+AUTH|PHONE\s+AUTH|URGENT", blob))


def select_form(
    summary: dict[str, object] | None,
    fields: dict[str, str] | None = None,
    force: bool = False,
    prefer: str | None = None,
) -> Selection:
    summary = summary or {}
    fields = fields or {}

    repetitive = repetitive_state(summary)
    direct_care = direct_care_state(fields, summary)
    path = PATH_REPETITIVE if repetitive == "Yes" else PATH_NONREPETITIVE if repetitive == "No" else PATH_UNKNOWN
    form_present = tri(summary.get("mn_form_present"))
    timely = tri(summary.get("mn_pcs_timely"))
    skipped = tri(summary.get("mn_review_skipped"))
    emergency = first_variant(summary.get("validated_emergency_status")).lower()
    physician_signed = signer_is_physician(summary.get("mn_signer_title"), summary.get("mn_signed_by"))

    reasons: list[str] = []
    review: list[str] = []

    lane_ran = summary.get("medical_necessity_extraction_version") is not None or form_present != "Unknown"

    if repetitive == "Unknown":
        review.append(
            "The record does not establish whether this is a scheduled repetitive transport; the PCS/NPCS fork is "
            "unverified."
        )

    if not lane_ran or skipped == "Yes":
        reason = (
            first_variant(summary.get("mn_review_skipped_reason"))
            or "medical necessity lane has not produced a determination"
        )
        return Selection(
            status=STATUS_INDETERMINATE,
            form=None,
            alternate=None,
            repetitive=repetitive,
            path=path,
            direct_care=direct_care,
            reasons=(f"No certification state to read: {reason}.",),
            review=(
                *review,
                "Run the medical necessity lane before generating a packet, or generate with --force and review by hand.",
            ),
        )

    is_medi_cal, medi_cal_payer = medi_cal_standing(fields)
    if is_medi_cal and emergency != "emergency":
        if post_service_permitted(fields, summary):
            review.append(
                "This trip reads as a telephone-authorised urgent service, the one case in which APL 22-008 permits "
                f"the PCS to be submitted after the fact. Confirm the telephone authorisation with {medi_cal_payer} "
                f"before mailing. [{CITE_MEDI_CAL_POST_SERVICE}]"
            )
        elif not force:
            return Selection(
                status=STATUS_PROSPECTIVE_ONLY,
                form=None,
                alternate=None,
                repetitive=repetitive,
                path=path,
                direct_care=direct_care,
                reasons=(
                    f"{medi_cal_payer} is the primary payor, and a Medi-Cal PCS authorises transport for the dates "
                    "of service written on the form. It cannot be obtained now to cover a transport that has "
                    "already happened, so no packet was generated.",
                    "Medicare's 21-day documented-attempts path does not exist under Medi-Cal; there is no "
                    "proof-of-mailing safe harbour to fall back on.",
                ),
                review=(
                    *review,
                    "Report the missing certification as a finding on the claim rather than mailing for a signature. "
                    "If this was a telephone-authorised urgent service, the PCS is due post-service and --force will "
                    f"generate it. [{CITE_MEDI_CAL_PROSPECTIVE}]",
                ),
            )
        else:
            review.append(
                f"{medi_cal_payer} is the primary payor and this packet was generated with --force. A Medi-Cal PCS "
                "signed now cannot authorise a transport that has already occurred; do not back-date it. "
                f"[{CITE_MEDI_CAL_PROSPECTIVE}]"
            )

    if emergency == "emergency" and not force:
        return Selection(
            status=STATUS_NOT_REQUIRED,
            form=None,
            alternate=None,
            repetitive=repetitive,
            path=path,
            direct_care=direct_care,
            reasons=(
                "Validated as an emergency transport; the 410.40(e) certification requirement attaches to non-emergency transport.",
            ),
            review=tuple(review),
        )

    if emergency == "emergency":
        review.append(
            "This transport was validated as an emergency; 410.40(e) does not require a certification for emergency "
            "transports. A packet was generated at operator request via --force. Confirm the emergency validation is "
            "wrong before mailing."
        )

    primary = "PCS"
    alternate = None if repetitive == "Yes" else "NPCS"

    if repetitive == "Yes":
        reasons.append(
            "The record shows a scheduled repetitive transport, so 410.40(e)(2) applies and only the attending "
            "physician may sign."
        )
        review.append(
            "A certification obtained now cannot reach back to this date of service: under 410.40(e)(2) it covers scheduled "
            "transports for 60 days beginning on the date the physician signs. The 21-day documented-attempts path in "
            "410.40(e)(3)(iv) belongs to the non-repetitive rule and is not available here."
        )
    elif repetitive == "No":
        reasons.append(
            "The record shows this is not a scheduled repetitive transport, so 410.40(e)(3) applies and a PCS or an "
            "NPCS is acceptable."
        )
    else:
        reasons.append("Repetitive status is unknown; defaulting to a PCS, which is acceptable under either rule.")

    if repetitive != "Yes" and direct_care == "No" and not force:
        exempt_review = list(review)
        if tri(summary.get("origin_under_physician_care")) == "Unknown":
            exempt_review.append(
                "Direct-care status was inferred from the origin text alone. Confirm it before dropping the "
                "certification, and generate with --force if the beneficiary was in fact under a physician's "
                "direct care."
            )
        return Selection(
            status=STATUS_NOT_REQUIRED,
            form=None,
            alternate=None,
            repetitive=repetitive,
            path=path,
            direct_care=direct_care,
            reasons=(
                *reasons,
                "Origin reads as a residence or custodial setting, so under 410.40(e)(3)(ii) the beneficiary is generally not "
                "under the direct care of a physician and no certification is required.",
            ),
            review=tuple(exempt_review),
        )

    if repetitive != "Yes" and direct_care == "Unknown":
        review.append(
            "Origin type does not establish whether the beneficiary was under a physician's direct care; 410.40(e)(3)(ii) may exempt this transport."
        )

    if form_present == "Yes" and physician_signed == "No" and repetitive == "Yes":
        reasons.append(
            "The certification on file was signed by a non-physician, which 410.40(e)(2) does not accept for a repetitive patient."
        )
        status = STATUS_REQUIRED
    elif form_present == "Yes" and timely == "Yes":
        return Selection(
            status=STATUS_ON_FILE,
            form=None,
            alternate=None,
            repetitive=repetitive,
            path=path,
            direct_care=direct_care,
            reasons=(*reasons, "A certification is on file and D4 found it timely for this date of service."),
            review=tuple(review),
        )
    elif form_present == "Yes" and timely == "No":
        reasons.append("A certification is on file but D4 found it does not cover this date of service.")
        status = STATUS_REQUIRED
    elif form_present == "Yes":
        reasons.append("A certification is on file but its dating was not established.")
        status = STATUS_REQUIRED
        review.append("D4 returned no timeliness answer; confirm the form on file before mailing a replacement.")
    else:
        reasons.append("No certification was found in the document set.")
        status = STATUS_REQUIRED

    if prefer:
        chosen = prefer.upper()
        if chosen == "NPCS" and repetitive == "Yes" and not force:
            review.append(
                "An NPCS was requested for a repetitive transport and refused; 410.40(e)(2) requires the attending physician."
            )
        else:
            if chosen == "NPCS" and repetitive == "Yes":
                review.append(
                    "An NPCS is being generated for a repetitive transport at operator request; 410.40(e)(2) does not accept it."
                )
            alternate = primary if chosen != primary else alternate
            primary = chosen

    if primary == "NPCS":
        reasons.append(
            "An NPCS is the fallback under 410.40(e)(3)(iii) when the attending physician's signature cannot be obtained."
        )

    return Selection(
        status=status,
        form=primary,
        alternate=alternate,
        repetitive=repetitive,
        path=path,
        direct_care=direct_care,
        reasons=tuple(reasons),
        review=tuple(review),
    )
