from __future__ import annotations

import contextlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

DEADLINE_DAYS = 21
FACILITY_HOURS = 48
REPETITIVE_LOOKBACK_DAYS = 60
AGING_DAY = 14
URGENT_DAY = 18

STATE_LIVE = "live"
STATE_AGING = "aging"
STATE_URGENT = "urgent"
STATE_PAST_21 = "past_21"
STATE_PROSPECTIVE = "prospective_only"
STATE_UNKNOWN = "unknown"

PATH_NONREPETITIVE = "nonrepetitive_21_day"
PATH_REPETITIVE = "repetitive_prospective"
PATH_UNKNOWN = "unknown"

OUTCOME_OPEN = "open"
OUTCOME_RECEIVED = "received"
OUTCOME_REFUSED = "refused"
OUTCOME_ABANDONED = "abandoned"
OUTCOMES = (OUTCOME_OPEN, OUTCOME_RECEIVED, OUTCOME_REFUSED, OUTCOME_ABANDONED)

USPS_3817 = "3817"

_SCHEMA = (
    """CREATE TABLE IF NOT EXISTS pcs_packets (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL,
    run_number TEXT,
    agency TEXT,
    form_kind TEXT NOT NULL,
    service_date TEXT NOT NULL,
    service_datetime TEXT,
    repetitive TEXT NOT NULL DEFAULT 'Unknown',
    path TEXT NOT NULL DEFAULT 'unknown',
    recipient_name TEXT,
    recipient_address TEXT,
    reason TEXT,
    batch_id TEXT,
    usps_form TEXT,
    tracking_number TEXT,
    generated_at TEXT NOT NULL,
    mailed_on TEXT,
    returned_on TEXT,
    outcome TEXT NOT NULL DEFAULT 'open',
    note TEXT,
    updated_at TEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS pcs_packet_events (
    id INTEGER PRIMARY KEY,
    packet_id INTEGER NOT NULL REFERENCES pcs_packets(id),
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT
)""",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_pcs_packets_identity ON pcs_packets(run_id, form_kind, generated_at)",
    "CREATE INDEX IF NOT EXISTS idx_pcs_packets_open ON pcs_packets(outcome, service_date)",
    "CREATE INDEX IF NOT EXISTS idx_pcs_packets_batch ON pcs_packets(batch_id)",
    "CREATE INDEX IF NOT EXISTS idx_pcs_packet_events_packet ON pcs_packet_events(packet_id, at)",
)

_DATE_RE = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})")
_US_DATE_RE = re.compile(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})")
_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})(?::(\d{2}))?")


class StoreUnavailable(Exception):
    pass


def store_path() -> Path:
    import findings_history

    return findings_history.store_path()


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


def parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    hit = _DATE_RE.search(text)
    if hit:
        year, month, day = (int(p) for p in hit.groups())
        with contextlib.suppress(ValueError):
            return date(year, month, day)
    hit = _US_DATE_RE.search(text)
    if hit:
        month, day, year = (int(p) for p in hit.groups())
        if year < 100:
            year += 2000
        with contextlib.suppress(ValueError):
            return date(year, month, day)
    return None


def parse_datetime(value) -> datetime | None:
    day = parse_date(value)
    if day is None:
        return None
    text = "" if value is None else str(value)
    tail = text[text.find(" ") :] if " " in text else text[10:] if len(text) > 10 else ""
    hit = _TIME_RE.search(tail)
    if not hit:
        return None
    hour, minute, second = int(hit.group(1)), int(hit.group(2)), int(hit.group(3) or 0)
    if hour > 23 or minute > 59 or second > 59:
        return None
    return datetime.combine(day, time(hour, minute, second))


@dataclass(frozen=True)
class Clock:
    service_date: date
    service_datetime: datetime | None
    as_of: date
    path: str
    repetitive: str
    generated_on: date | None
    mailed_on: date | None
    returned_on: date | None
    outcome: str

    @property
    def days_since_service(self) -> int:
        return (self.as_of - self.service_date).days

    @property
    def deadline_21(self) -> date:
        return self.service_date + timedelta(days=DEADLINE_DAYS)

    @property
    def days_to_deadline(self) -> int:
        return (self.deadline_21 - self.as_of).days

    @property
    def applies_21_day(self) -> bool:
        return self.path != PATH_REPETITIVE

    @property
    def deadline_48h(self) -> datetime | None:
        if self.path == PATH_REPETITIVE:
            return None
        if self.service_datetime is None:
            return datetime.combine(self.service_date, time(23, 59, 59)) + timedelta(hours=FACILITY_HOURS)
        return self.service_datetime + timedelta(hours=FACILITY_HOURS)

    @property
    def window_48h_state(self) -> str:
        deadline = self.deadline_48h
        if deadline is None:
            return "not_applicable"
        if self.returned_on is not None:
            return "closed_in_window" if self.returned_on <= deadline.date() else "closed_after_window"
        return "open" if self.as_of <= deadline.date() else "expired"

    @property
    def repetitive_window(self) -> tuple[date, date]:
        return (self.service_date - timedelta(days=REPETITIVE_LOOKBACK_DAYS), self.service_date)

    @property
    def days_since_mail(self) -> int | None:
        return None if self.mailed_on is None else (self.as_of - self.mailed_on).days

    @property
    def attempt_documented(self) -> bool:
        return self.mailed_on is not None

    @property
    def state(self) -> str:
        if self.outcome == OUTCOME_RECEIVED:
            return OUTCOME_RECEIVED
        if self.path == PATH_REPETITIVE:
            return STATE_PROSPECTIVE
        if self.path == PATH_UNKNOWN:
            return STATE_UNKNOWN
        elapsed = self.days_since_service
        if elapsed > DEADLINE_DAYS:
            return STATE_PAST_21
        if elapsed >= URGENT_DAY:
            return STATE_URGENT
        if elapsed >= AGING_DAY:
            return STATE_AGING
        return STATE_LIVE

    @property
    def claim_submittable_without_certification(self) -> bool:
        return self.applies_21_day and self.days_since_service > DEADLINE_DAYS and self.attempt_documented

    def as_dict(self) -> dict[str, object]:
        deadline_48 = self.deadline_48h
        window = self.repetitive_window
        return {
            "service_date": self.service_date.isoformat(),
            "service_datetime": None if self.service_datetime is None else self.service_datetime.isoformat(sep=" "),
            "as_of": self.as_of.isoformat(),
            "path": self.path,
            "repetitive": self.repetitive,
            "state": self.state,
            "days_since_service": self.days_since_service,
            "applies_21_day": self.applies_21_day,
            "deadline_21": self.deadline_21.isoformat(),
            "days_to_deadline": self.days_to_deadline,
            "deadline_48h": None if deadline_48 is None else deadline_48.isoformat(sep=" "),
            "window_48h_state": self.window_48h_state,
            "repetitive_window_start": window[0].isoformat(),
            "repetitive_window_end": window[1].isoformat(),
            "generated_on": None if self.generated_on is None else self.generated_on.isoformat(),
            "mailed_on": None if self.mailed_on is None else self.mailed_on.isoformat(),
            "days_since_mail": self.days_since_mail,
            "returned_on": None if self.returned_on is None else self.returned_on.isoformat(),
            "outcome": self.outcome,
            "attempt_documented": self.attempt_documented,
            "claim_submittable_without_certification": self.claim_submittable_without_certification,
        }


def build_clock(
    service_value,
    path: str,
    repetitive: str = "Unknown",
    as_of: date | None = None,
    generated_on: date | None = None,
    mailed_on: date | None = None,
    returned_on: date | None = None,
    outcome: str = OUTCOME_OPEN,
) -> Clock | None:
    service_date = parse_date(service_value)
    if service_date is None:
        return None
    return Clock(
        service_date=service_date,
        service_datetime=parse_datetime(service_value),
        as_of=as_of or date.today(),
        path=path,
        repetitive=repetitive,
        generated_on=generated_on,
        mailed_on=mailed_on,
        returned_on=returned_on,
        outcome=outcome,
    )


def connect(path: Path | str | None = None, create: bool = True) -> sqlite3.Connection:
    try:
        target = Path(path) if path else store_path()
    except Exception as exc:
        raise StoreUnavailable(f"{type(exc).__name__}: {exc}") from exc
    if not create and not target.exists():
        raise StoreUnavailable(f"no advisor store at {target}")
    try:
        from emsdb.schema import connect_sidecar

        conn = connect_sidecar(target, timeout=5.0)
        for statement in _SCHEMA:
            conn.execute(statement)
        conn.commit()
    except (sqlite3.Error, RuntimeError) as exc:
        raise StoreUnavailable(f"{type(exc).__name__}: {exc}") from exc
    return conn


def log_event(conn: sqlite3.Connection, packet_id: int, kind: str, detail: str = "") -> None:
    conn.execute(
        "INSERT INTO pcs_packet_events (packet_id, at, kind, detail) VALUES (?, ?, ?, ?)",
        (packet_id, _now(), kind, detail),
    )


def record_packet(
    conn: sqlite3.Connection,
    run_id: int,
    form_kind: str,
    service_date: str,
    service_datetime: str | None = None,
    run_number: str | None = None,
    agency: str | None = None,
    repetitive: str = "Unknown",
    path: str = PATH_UNKNOWN,
    recipient_name: str | None = None,
    recipient_address: str | None = None,
    reason: str | None = None,
    batch_id: str | None = None,
    generated_at: str | None = None,
) -> int:
    stamp = generated_at or _now()
    cursor = conn.execute(
        "INSERT INTO pcs_packets (run_id, run_number, agency, form_kind, service_date, service_datetime, repetitive, "
        "path, recipient_name, recipient_address, reason, batch_id, generated_at, outcome, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            run_id,
            run_number,
            agency,
            form_kind,
            service_date,
            service_datetime,
            repetitive,
            path,
            recipient_name,
            recipient_address,
            reason,
            batch_id,
            stamp,
            OUTCOME_OPEN,
            stamp,
        ),
    )
    packet_id = int(cursor.lastrowid or 0)
    log_event(conn, packet_id, "generated", reason or "")
    conn.commit()
    return packet_id


def mark_mailed(
    conn: sqlite3.Connection,
    packet_id: int,
    mailed_on: str,
    usps_form: str | None = None,
    tracking_number: str | None = None,
    note: str | None = None,
) -> None:
    day = parse_date(mailed_on)
    if day is None:
        raise ValueError(f"unreadable mail date {mailed_on!r}")
    conn.execute(
        "UPDATE pcs_packets SET mailed_on = ?, usps_form = COALESCE(?, usps_form), "
        "tracking_number = COALESCE(?, tracking_number), note = COALESCE(?, note), updated_at = ? WHERE id = ?",
        (day.isoformat(), usps_form, tracking_number, note, _now(), packet_id),
    )
    detail = " ".join(p for p in (f"mailed {day.isoformat()}", usps_form and f"PS {usps_form}", tracking_number) if p)
    log_event(conn, packet_id, "mailed", detail)
    conn.commit()


def close_packet(
    conn: sqlite3.Connection,
    packet_id: int,
    outcome: str,
    returned_on: str | None = None,
    note: str | None = None,
) -> None:
    if outcome not in OUTCOMES:
        raise ValueError(f"unknown outcome {outcome!r}")
    day = parse_date(returned_on) if returned_on else None
    conn.execute(
        "UPDATE pcs_packets SET outcome = ?, returned_on = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?",
        (outcome, day.isoformat() if day else None, note, _now(), packet_id),
    )
    log_event(conn, packet_id, outcome, note or "")
    conn.commit()


def packet_rows(
    conn: sqlite3.Connection,
    outcome: str | None = OUTCOME_OPEN,
    agency: str | None = None,
    batch_id: str | None = None,
) -> list[sqlite3.Row]:
    sql = "SELECT * FROM pcs_packets"
    where: list[str] = []
    params: list[object] = []
    if outcome:
        where.append("outcome = ?")
        params.append(outcome)
    if agency:
        where.append("agency = ?")
        params.append(agency)
    if batch_id:
        where.append("batch_id = ?")
        params.append(batch_id)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY service_date ASC, id ASC"
    return list(conn.execute(sql, params))


def clock_for_row(row, as_of: date | None = None) -> Clock | None:
    return build_clock(
        row["service_datetime"] or row["service_date"],
        path=row["path"] or PATH_UNKNOWN,
        repetitive=row["repetitive"] or "Unknown",
        as_of=as_of,
        generated_on=parse_date(row["generated_at"]),
        mailed_on=parse_date(row["mailed_on"]),
        returned_on=parse_date(row["returned_on"]),
        outcome=row["outcome"] or OUTCOME_OPEN,
    )


def clock_report(
    conn: sqlite3.Connection,
    as_of: date | None = None,
    outcome: str | None = OUTCOME_OPEN,
    agency: str | None = None,
    states: tuple[str, ...] = (),
) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for row in packet_rows(conn, outcome=outcome, agency=agency):
        clock = clock_for_row(row, as_of=as_of)
        if clock is None:
            continue
        if states and clock.state not in states:
            continue
        entry = {
            "packet_id": row["id"],
            "run_id": row["run_id"],
            "run_number": row["run_number"],
            "agency": row["agency"],
            "form_kind": row["form_kind"],
            "recipient_name": row["recipient_name"],
            "usps_form": row["usps_form"],
            "tracking_number": row["tracking_number"],
            "batch_id": row["batch_id"],
        }
        entry.update(clock.as_dict())
        out.append(entry)
    out.sort(key=lambda item: (-int(str(item["days_since_service"])), int(str(item["packet_id"]))))
    return out
