from __future__ import annotations

from .overlay import (
    OWNER_BILLING,
    OWNER_CLERK,
    OWNER_MAILER,
    OWNER_SIGNER,
    Blank,
    Check,
    Slot,
    Template,
)

CERT_FILENAME = "pww_medical_necessity_cert_statement_v20.pdf"
CERT_INSTRUCTIONS = "pww_medical_necessity_cert_statement_v20_instructions.pdf"
USPS_FILENAME = "ps3817.pdf"

CERT_TERMS = (
    "Sample form from Page, Wolfberg & Wirth (www.pwwemslaw.com), Sample Medical Necessity Certification Statement "
    "for Non-Emergency Ambulance Services, Version 2.0. Not legal advice, not an official form of any governmental "
    "agency, and licensed only for use by individual ambulance services. The user bears all responsibility for "
    "compliance with applicable laws and regulations."
)

USPS_TERMS = "PS Form 3817, April 2007, PSN 7530-02-000-9065 - official United States Postal Service form."

BASE = 8.1
LEAD = 9.36

CERT_TITLE_BOX = (36.0, 12.0, 576.0, 28.0)
CERT_TITLE_BASELINE = 25.0
CERT_TITLE_SIZE = 11.1


def _line(key: str, label: str, x: float, right: float, baseline: float, size: float = BASE) -> Slot:
    return Slot(key=key, label=label, x=x + 1.5, baseline=baseline, width=right - x - 3.0, size=size)


CERT_SLOTS: tuple[Slot, ...] = (
    _line("patient_name", "Patient's Name", 111.0, 270.0, 64.4),
    _line("patient_dob", "Date of Birth", 317.8, 372.7, 64.4),
    _line("member_id", "Medicare #", 421.7, 558.0, 64.4),
    _line("service_date", "Transport Date", 111.0, 187.1, 78.4),
    _line("origin", "Origin", 80.4, 189.0, 92.4),
    _line("destination", "Destination", 250.9, 558.0, 92.4),
    _line("not_closest_reason", "If not the closest appropriate facility, why", 432.6, 558.0, 120.9),
    _line("hospital_transfer_services", "Services needed at 2nd facility", 407.4, 558.0, 149.2),
    _line("hospice_describe", "Hospice terminal-illness description", 372.4, 558.0, 163.2),
    _line("other_condition", "Other condition (specify)", 123.1, 558.0, 500.2),
)

CERT_SIGNER_SLOTS: tuple[Slot, ...] = (
    Slot("condition_1", "Q1 medical condition line 1", 74.0, 272.7, 484.0, signer=True),
    Slot("condition_2", "Q1 medical condition line 2", 74.0, 286.9, 484.0, signer=True),
    Slot("condition_3", "Q1 medical condition line 3", 74.0, 301.0, 484.0, signer=True),
    Slot("incapable_reason", "Reason patient cannot sign", 54.0, 638.2, 502.0, signer=True),
    Slot("signature", "Signature of physician or authorized professional", 66.0, 659.3, 236.0, signer=True),
    Slot("date_signed", "Date signed", 340.0, 659.3, 214.0, signer=True),
    Slot("printed_name", "Printed name and credentials", 54.0, 696.9, 248.0, signer=True),
)

CERT_CHECKS: tuple[Check, ...] = (
    Check("part_a_yes", "Medicare Part A (PPS/DRG) - YES", 299.1, 104.5),
    Check("part_a_no", "Medicare Part A (PPS/DRG) - NO", 330.7, 104.5),
    Check("closest_yes", "Closest appropriate facility - YES", 167.5, 118.5),
    Check("closest_no", "Closest appropriate facility - NO", 199.1, 118.5),
    Check("hospice_yes", "Hospice terminal illness - YES", 281.9, 161.0),
    Check("hospice_no", "Hospice terminal illness - NO", 315.4, 161.0),
)

CERT_SIGNER_CHECKS: tuple[Check, ...] = (
    Check("bed_confined_yes", "Q2 bed confined - Yes", 270.7, 314.2, signer=True),
    Check("bed_confined_no", "Q2 bed confined - No", 307.2, 314.2, signer=True),
    Check("car_wheelchair_yes", "Q3 safe by car or wheelchair van - Yes", 503.6, 361.2, signer=True),
    Check("car_wheelchair_no", "Q3 safe by car or wheelchair van - No", 540.2, 361.2, signer=True),
    Check("contractures", "Contractures", 56.9, 399.9, signer=True),
    Check("non_healed_fractures", "Non-healed fractures", 149.5, 399.9, signer=True),
    Check("patient_confused", "Patient is confused", 248.5, 399.9, signer=True),
    Check("patient_comatose", "Patient is comatose", 340.8, 400.2, signer=True),
    Check("pain_on_movement", "Moderate/severe pain on movement", 432.6, 399.9, signer=True),
    Check("danger_to_self", "Danger to self/others", 56.9, 414.2, signer=True),
    Check("iv_meds", "IV meds/fluids required", 149.0, 414.2, signer=True),
    Check("combative", "Patient is combative", 248.9, 414.2, signer=True),
    Check("restraints", "Need, or possible need, for restraints", 340.7, 413.7, signer=True),
    Check("dvt_elevation", "DVT requires elevation of a lower extremity", 56.6, 428.2, signer=True),
    Check("attendant_required", "Medical attendant required", 249.1, 427.7, signer=True),
    Check("oxygen_required", "Requires oxygen - unable to self-administer", 366.8, 428.2, signer=True),
    Check("isolation", "Special handling/isolation/infection control", 56.9, 442.4, signer=True),
    Check("seated_intolerance", "Unable to tolerate seated position", 320.5, 442.1, signer=True),
    Check("hemodynamic_monitoring", "Hemodynamic monitoring required enroute", 56.9, 456.4, signer=True),
    Check("decubitus_ulcers", "Unable to sit due to decubitus ulcers or wounds", 249.3, 456.0, signer=True),
    Check("cardiac_monitoring", "Cardiac monitoring required enroute", 56.9, 470.6, signer=True),
    Check("morbid_obesity", "Morbid obesity requires additional personnel", 249.1, 470.1, signer=True),
    Check("orthopedic_device", "Orthopedic device requiring special handling", 57.0, 484.1, signer=True),
    Check("other_specify", "Other (specify)", 57.0, 497.9, signer=True),
    Check("incapable_of_signing", "Patient physically or mentally incapable of signing", 57.6, 599.3, signer=True),
    Check("signer_physician_assistant", "Signer credential - Physician Assistant", 57.7, 740.2, signer=True),
    Check(
        "signer_clinical_nurse_specialist", "Signer credential - Clinical Nurse Specialist", 219.6, 740.2, signer=True
    ),
    Check("signer_licensed_practical_nurse", "Signer credential - Licensed Practical Nurse", 345.6, 740.2, signer=True),
    Check("signer_case_manager", "Signer credential - Case Manager", 489.6, 740.2, signer=True),
    Check("signer_nurse_practitioner", "Signer credential - Nurse Practitioner", 57.7, 755.7, signer=True),
    Check("signer_registered_nurse", "Signer credential - Registered Nurse", 219.6, 755.7, signer=True),
    Check("signer_social_worker", "Signer credential - Social Worker", 345.6, 755.7, signer=True),
    Check("signer_discharge_planner", "Signer credential - Discharge Planner", 489.6, 755.7, signer=True),
)

CERT_BLANKS: tuple[Blank, ...] = (
    Blank(
        "condition",
        "Section II Q1 - description of the medical condition",
        OWNER_SIGNER,
        "the certification itself; nothing is written here for the signer",
    ),
    Blank(
        "bed_confined",
        "Section II Q2 - bed confined Yes/No",
        OWNER_SIGNER,
        "the instructions require the healthcare professional signing to answer Q1-Q3",
    ),
    Blank(
        "car_wheelchair",
        "Section II Q3 - safe by car or wheelchair van Yes/No",
        OWNER_SIGNER,
        "the instructions require the healthcare professional signing to answer Q1-Q3",
    ),
    Blank(
        "conditions",
        "Section II Q4 - condition checkboxes",
        OWNER_SIGNER,
        "supporting documentation for any box checked must be in the patient's medical records",
    ),
    Blank("signature", "Section III - signature", OWNER_SIGNER, "no signature may be produced by this program"),
    Blank(
        "date_signed",
        "Section III - date signed",
        OWNER_SIGNER,
        "must be the date the signer actually signs; it sets the 60-day window for repetitive transport",
    ),
    Blank(
        "printed_name",
        "Section III - printed name and credentials",
        OWNER_SIGNER,
        "the instructions require the signer to print their name",
    ),
    Blank(
        "incapable_reason",
        "Section III - reason the patient cannot sign the claim form",
        OWNER_SIGNER,
        "only the signer may attest that the patient is incapable of signing",
    ),
    Blank(
        "signer_credential",
        "Section III - signer credential boxes",
        OWNER_SIGNER,
        "the signer states their own credential",
    ),
)

CERT_TEMPLATE = Template(
    name="medical_necessity_certification",
    title="Medical Necessity Certification Statement for Non-Emergency Ambulance Services",
    filename=CERT_FILENAME,
    slots=CERT_SLOTS + CERT_SIGNER_SLOTS,
    checks=CERT_CHECKS + CERT_SIGNER_CHECKS,
    blanks=CERT_BLANKS,
    terms=CERT_TERMS,
)

SOLANO_FILENAME = "solano_interfacility_transfer_2024.pdf"
SOLANO_TERMS = "Solano EMS / Solano Public Health Interfacility Ambulance Transfer Request Form (2024)."

SOLANO_IMPRINT_X = 309.5
SOLANO_IMPRINT_WIDTH = 271.0
SOLANO_IMPRINT_BASELINES = (27.5, 37.5, 47.5, 57.5)
SOLANO_IMPRINT_KEYS = tuple(f"imprint_{n}" for n in range(1, len(SOLANO_IMPRINT_BASELINES) + 1))

SOLANO_SLOTS: tuple[Slot, ...] = (
    *(
        Slot(key, f"Patient imprint line {n}", SOLANO_IMPRINT_X, baseline, SOLANO_IMPRINT_WIDTH, 8.0)
        for n, (key, baseline) in enumerate(zip(SOLANO_IMPRINT_KEYS, SOLANO_IMPRINT_BASELINES), start=1)
    ),
    _line("receiving_facility", "Receiving Facility", 105.2, 311.9, 750.6),
)

SOLANO_BLANKS: tuple[Blank, ...] = (
    Blank("diagnosis", "Patient Diagnosis and Allergies", OWNER_SIGNER, "clinical facts the ordering clinician supplies"),
    Blank(
        "certification",
        "Physician Certification Statement - signature, date, printed name and credentials, NPI",
        OWNER_SIGNER,
        "no signature or signer identity may be produced by this program",
    ),
    Blank(
        "levels",
        "Patient condition, BLS / ALS / ALS-RN / CCT boxes, response level, additional orders",
        OWNER_SIGNER,
        "the level of care and its reasons are the certification itself",
    ),
    Blank(
        "ems_times",
        "EMS Time of Request, EMS Time of Arrival, Receiving Physician, Date and Time",
        OWNER_SIGNER,
        "not held on the trip record used to build this form",
    ),
)

SOLANO_TEMPLATE = Template(
    name="solano_interfacility_transfer",
    title="Solano County Interfacility Ambulance Transfer Request Form",
    filename=SOLANO_FILENAME,
    slots=SOLANO_SLOTS,
    blanks=SOLANO_BLANKS,
    terms=SOLANO_TERMS,
)

NORCAL_FILENAME = "medic_norcal_transport_justification.pdf"
NORCAL_TERMS = "Medic Ambulance Service Medical Transport Justification Form - Northern California Operations."

NORCAL_STACK_SIZE = 6.8

NORCAL_SLOTS: tuple[Slot, ...] = (
    _line("patient_name", "Name", 59.0, 210.0, 148.0),
    _line("patient_dob", "Date of Birth", 271.0, 354.0, 147.5),
    _line("pickup_facility_upper", "Pick up Facility - upper row", 95.5, 211.0, 211.6, NORCAL_STACK_SIZE),
    _line("pickup_facility", "Pick up Facility", 95.5, 211.0, 219.0),
    _line("requested_month", "Date Requested - month", 396.0, 427.0, 218.0),
    _line("requested_day", "Date Requested - day", 432.0, 462.0, 218.0),
    _line("requested_year", "Date Requested - year", 477.0, 499.0, 218.0),
    _line("destination", "Destination Facility Name and Address", 191.0, 572.0, 235.8),
)

NORCAL_BLANKS: tuple[Blank, ...] = (
    Blank("ssn_mrn", "SSN and MRN", OWNER_BILLING, "not printed on a mailed request"),
    Blank(
        "clinical",
        "Patient Diagnosis, Allergies, Mental and Physical Limitations, Purpose of Visit",
        OWNER_SIGNER,
        "clinical facts the ordering clinician supplies",
    ),
    Blank(
        "transport",
        "Room #, time requested, Receiving Physician, Wait and Return",
        OWNER_SIGNER,
        "not held on the trip record used to build this form",
    ),
    Blank(
        "levels",
        "Patient condition, response requested, wheelchair / gurney / BLS / ALS / CCT boxes",
        OWNER_SIGNER,
        "the level of care and its reasons are the certification itself",
    ),
    Blank(
        "certification",
        "Physician Certification Statement - printed name, signature, NPI, date",
        OWNER_SIGNER,
        "no signature or signer identity may be produced by this program",
    ),
    Blank(
        "non_covered",
        "Notification of Transportation Non-Covered - patient name, signature, date",
        OWNER_SIGNER,
        "signed by the patient, never by this program",
    ),
)

NORCAL_TEMPLATE = Template(
    name="norcal_transport_justification",
    title="Medic Ambulance Service Medical Transport Justification Form - Northern California Operations",
    filename=NORCAL_FILENAME,
    slots=NORCAL_SLOTS,
    blanks=NORCAL_BLANKS,
    terms=NORCAL_TERMS,
)

USPS_PLACE = (126.0, 72.0, 486.0, 288.0)
USPS_DX = 126.0
USPS_DY = 72.0


def _usps(key: str, label: str, x: float, right: float, baseline: float, size: float = 8.0) -> Slot:
    return Slot(
        key=key,
        label=label,
        x=USPS_DX + x,
        baseline=USPS_DY + baseline,
        width=right - x,
        size=size,
    )


USPS_SLOTS: tuple[Slot, ...] = (
    _usps("from_1", "From line 1", 27.0, 246.0, 57.0),
    _usps("from_2", "From line 2", 23.0, 246.0, 75.0),
    _usps("from_3", "From line 3", 23.0, 246.0, 93.0),
    _usps("from_4", "From line 4", 23.0, 246.0, 111.0),
    _usps("to_1", "To line 1", 23.0, 246.0, 137.0),
    _usps("to_2", "To line 2", 23.0, 246.0, 155.0),
    _usps("to_3", "To line 3", 23.0, 246.0, 173.0),
    _usps("to_4", "To line 4", 23.0, 246.0, 191.0),
)

USPS_REFERENCE_X = 126.0
USPS_REFERENCE_BASELINE = 306.0
USPS_REFERENCE_SIZE = 7.4

USPS_BLANKS: tuple[Blank, ...] = (
    Blank(
        "postmark",
        "Postmark Here - the round date stamp",
        OWNER_CLERK,
        "the clerk's round date stamp is what makes this form evidence of mailing",
    ),
    Blank(
        "postage",
        "To pay fee, affix stamps or meter postage here",
        OWNER_MAILER,
        "physical stamps or meter postage are applied by the person mailing the packet",
    ),
)

USPS_TEMPLATE = Template(
    name="usps_3817",
    title="PS Form 3817 Certificate of Mailing",
    filename=USPS_FILENAME,
    slots=USPS_SLOTS,
    blanks=USPS_BLANKS,
    place=USPS_PLACE,
    terms=USPS_TERMS,
)

USPS_FROM_KEYS = ("from_1", "from_2", "from_3", "from_4")
USPS_TO_KEYS = ("to_1", "to_2", "to_3", "to_4")

BILLING_OWNED: tuple[Blank, ...] = (
    Blank("reference", "Mailer reference line", OWNER_BILLING, "printed by this program below the form footer"),
)

USPS_3665_FILENAME = "ps3665.pdf"

USPS_3665_TERMS = "PS Form 3665, December 2024, PSN 7530-17-000-5549 - official United States Postal Service form."


def _3665(key: str, label: str, x: float, baseline: float, width: float, size: float = 8.0) -> Slot:
    return Slot(key=key, label=label, x=x, baseline=baseline, width=width, size=size)


_ROW_TOPS = (254.2, 308.9, 363.7, 418.4, 473.1, 527.8)
_IDENT_OFFSET = 47.0
_ADDR_ROW_HEIGHT = 13.675
_ADDR_BASELINE = 10.0
_ADDR_X = 235.0
_ADDR_WIDTH = 228.0
_IDENT_X = 37.0
_IDENT_WIDTH = 188.0

USPS_3665_ADDRESS_ROWS = 4


def _3665_line(n: int, top: float) -> tuple[Slot, ...]:
    rows = tuple(
        _3665(
            f"line{n}_address_{k}",
            f"Recipient address - line {n} row {k}",
            _ADDR_X,
            top + (k - 1) * _ADDR_ROW_HEIGHT + _ADDR_BASELINE,
            _ADDR_WIDTH,
        )
        for k in range(1, USPS_3665_ADDRESS_ROWS + 1)
    )
    return (*rows, _3665(f"line{n}_identifier", f"Firm identifier - line {n}", _IDENT_X, top + _IDENT_OFFSET, _IDENT_WIDTH))


USPS_3665_SLOTS: tuple[Slot, ...] = (
    _3665("sender_1", "Sender name or address line 1", 22.0, 78.0, 200.0),
    _3665("sender_2", "Sender address line 2", 22.0, 96.0, 200.0),
    _3665("sender_3", "Sender address line 3", 22.0, 114.0, 200.0),
    _3665("sender_4", "Sender address line 4", 22.0, 132.0, 200.0),
    _3665("total_listed", "Total pieces listed by sender", 245.0, 100.0, 90.0),
    *(slot for n, top in enumerate(_ROW_TOPS, start=1) for slot in _3665_line(n, top)),
    _3665("page_n", "Page number", 162.0, 594.0, 18.0, 7.0),
    _3665("page_of", "Total pages", 192.0, 594.0, 18.0, 7.0),
)

USPS_3665_BLANKS: tuple[Blank, ...] = (
    Blank(
        "clerk_section",
        "Received count, postmaster signature, postage and fees",
        OWNER_CLERK,
        "completed by the postal clerk at time of mailing",
    ),
    Blank(
        "postage_stamp",
        "Postage stamp or meter imprint area",
        OWNER_MAILER,
        "physical stamps or meter postage applied by the mailer before presenting to the post office",
    ),
)

USPS_3665_TEMPLATE = Template(
    name="usps_3665",
    title="PS Form 3665 Certificate of Mailing - Firm",
    filename=USPS_3665_FILENAME,
    slots=USPS_3665_SLOTS,
    blanks=USPS_3665_BLANKS,
    page_width=792.0,
    page_height=612.0,
    source_page=0,
    place=None,
    terms=USPS_3665_TERMS,
)
