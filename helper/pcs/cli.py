from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pcs.clock import (
    OUTCOMES,
    USPS_3817,
    StoreUnavailable,
    clock_report,
    close_packet,
    connect,
    mark_mailed,
    parse_date,
)
from pcs.emit import as_text, name_of
from pcs.mapping import candidate_runs
from pcs.selector import select_form
from pcs.service import build_batch, build_for_run, coverage, record_build, write_documents, write_packet
from storage_paths import get_database_path

STATES = ("live", "aging", "urgent", "past_21", "prospective_only", "unknown", "received")


def _db(args) -> Path:
    return Path(args.db) if args.db else get_database_path()


def _as_of(value: str | None) -> date | None:
    if not value:
        return None
    parsed = parse_date(value)
    if parsed is None:
        raise SystemExit(f"unreadable date {value!r}")
    return parsed


def _store(args) -> sqlite3.Connection:
    try:
        return connect(args.store)
    except StoreUnavailable as exc:
        raise SystemExit(f"advisor store unavailable: {exc}") from exc


def _report_build(build, verbose: bool) -> None:
    selection = build.selection
    print(f"run {build.run_id} version {build.version_id} status {selection.status} form {selection.form or '-'}")
    print(f"  repetitive {selection.repetitive}  path {selection.path}  direct care {selection.direct_care}")
    if build.clock is not None:
        clock = build.clock
        print(
            f"  service {clock.service_date.isoformat()}  day {clock.days_since_service}  state {clock.state}  "
            f"21-day deadline {clock.deadline_21.isoformat()} ({clock.days_to_deadline} left, applies="
            f"{clock.applies_21_day})"
        )
        if clock.deadline_48h is not None:
            print(
                f"  410.40(e)(3)(i) 48-hour window closes {clock.deadline_48h.isoformat(sep=' ')} [{clock.window_48h_state}]"
            )
    for reason in selection.reasons:
        print(f"  reason: {reason}")
    for note in selection.review:
        print(f"  REVIEW: {note}")
    for note in build.data.notes:
        print(f"  note: {note}")
    for item in build.data.missing:
        print(f"  missing: {item}")
    if verbose:
        for key in sorted(build.data.values):
            print(f"  filled {key:24s} {build.data.values[key]}")
        for key in build.data.blanks:
            print(f"  blank  {key}")
        for observation in build.data.observations:
            print(f"  context {observation.label}: {observation.text}")


def cmd_select(args) -> int:
    from pcs.mapping import load_fields, load_summary

    db = _db(args)
    from pcs.mapping import resolve_version

    version = args.version_id or resolve_version(db, args.run_id)
    if version is None:
        print(f"no extraction version for run {args.run_id}", file=sys.stderr)
        return 2
    selection = select_form(load_summary(db, args.run_id), load_fields(db, version), force=args.force, prefer=args.form)
    if args.json:
        print(json.dumps(selection.as_dict(), indent=2))
        return 0
    print(
        f"run {args.run_id} status {selection.status} form {selection.form or '-'} alternate {selection.alternate or '-'}"
    )
    for reason in selection.reasons:
        print(f"  reason: {reason}")
    for note in selection.review:
        print(f"  REVIEW: {note}")
    return 0


def cmd_generate(args) -> int:
    db = _db(args)
    build = build_for_run(
        db,
        args.run_id,
        version_id=args.version_id,
        prefer=args.form,
        force=args.force,
        as_of=_as_of(args.as_of),
    )
    if build is None:
        print(f"no extraction version for run {args.run_id}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(coverage(build), indent=2))
        return 0
    _report_build(build, args.dump_values)
    if not build.generated:
        print("  no packet generated; pass --force to generate anyway")
        return 1 if build.selection.needed else 0
    if args.out_dir:
        written = write_documents(
            build.all_documents,
            args.out_dir,
            f"run{build.run_id}",
            pdf=not args.no_pdf,
            text=args.text,
        )
        for path in written:
            print(f"  wrote {path}")
        if args.packet and not args.no_pdf:
            merged = write_packet(build, Path(args.out_dir) / f"run{build.run_id}_packet.pdf")
            if merged is not None:
                print(f"  wrote {merged}")
    elif args.text:
        for document in build.all_documents:
            print(f"----- {name_of(document)} -----")
            print(as_text(document))
    if args.record:
        conn = _store(args)
        try:
            packet_id = record_build(conn, build, args.batch_id)
        finally:
            conn.close()
        print(f"  recorded packet {packet_id}")
    return 0


def cmd_batch(args) -> int:
    db = _db(args)
    if args.run_ids:
        run_ids = [int(part) for part in args.run_ids.replace(",", " ").split()]
    else:
        run_ids = candidate_runs(db, agency=args.agency, limit=args.limit)
    if not run_ids:
        print("no candidate runs")
        return 0
    batch_id = args.batch_id or f"batch-{date.today().isoformat()}"
    batch = build_batch(db, run_ids, batch_id, prefer=args.form, force=args.force, as_of=_as_of(args.as_of))
    for build in batch.builds:
        _report_build(build, args.dump_values)
    print(
        f"batch {batch_id}: {len(batch.mailable)} of {len(batch.builds)} runs need a packet; USPS PS {batch.usps_form}"
    )
    if args.out_dir:
        for build, certificate in zip(batch.mailable, batch.usps):
            for path in write_documents(
                [*build.documents, certificate],
                args.out_dir,
                f"run{build.run_id}",
                pdf=not args.no_pdf,
                text=args.text,
            ):
                print(f"  wrote {path}")
    elif args.text:
        for certificate in batch.usps:
            print(f"----- {certificate.name} -----")
            print(as_text(certificate))
    if args.record:
        conn = _store(args)
        try:
            for build in batch.mailable:
                packet_id = record_build(conn, build, batch_id)
                print(f"  recorded packet {packet_id} for run {build.run_id}")
        finally:
            conn.close()
    return 0


def cmd_clock(args) -> int:
    conn = _store(args)
    try:
        rows = clock_report(
            conn,
            as_of=_as_of(args.as_of),
            outcome=None if args.outcome == "all" else args.outcome,
            agency=args.agency,
            states=tuple(args.state) if args.state else (),
        )
    finally:
        conn.close()
    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("no packets match")
        return 0
    print(
        f"{'id':>4} {'run':>6} {'form':<5} {'service':<10} {'day':>4} {'state':<16} {'deadline':<10} {'left':>5} mailed"
    )
    for row in rows:
        print(
            f"{row['packet_id']:>4} {row['run_id']:>6} {row['form_kind']:<5} {row['service_date']:<10} "
            f"{row['days_since_service']:>4} {row['state']:<16} {row['deadline_21']:<10} "
            f"{row['days_to_deadline']:>5} {row['mailed_on'] or '-'}"
        )
    past = [row for row in rows if row["state"] == "past_21"]
    undocumented = [row for row in past if not row["attempt_documented"]]
    if past:
        print(f"{len(past)} past day 21; {len(undocumented)} of those have no mail date recorded")
    return 0


def cmd_mail(args) -> int:
    conn = _store(args)
    try:
        mark_mailed(conn, args.packet_id, args.mailed_on, args.usps_form, args.tracking, args.note)
    finally:
        conn.close()
    print(f"packet {args.packet_id} mailed {args.mailed_on}")
    return 0


def cmd_close(args) -> int:
    conn = _store(args)
    try:
        close_packet(conn, args.packet_id, args.outcome, args.returned_on, args.note)
    finally:
        conn.close()
    print(f"packet {args.packet_id} closed {args.outcome}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pcs")
    parser.add_argument("--db", default=None)
    parser.add_argument("--store", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    select = sub.add_parser("select")
    select.add_argument("--run-id", type=int, required=True)
    select.add_argument("--version-id", type=int, default=None)
    select.add_argument("--form", choices=["pcs", "npcs", "PCS", "NPCS"], default=None)
    select.add_argument("--force", action="store_true")
    select.add_argument("--json", action="store_true")
    select.set_defaults(func=cmd_select)

    generate = sub.add_parser("generate")
    generate.add_argument("--run-id", type=int, required=True)
    generate.add_argument("--version-id", type=int, default=None)
    generate.add_argument("--form", choices=["pcs", "npcs", "PCS", "NPCS"], default=None)
    generate.add_argument("--out-dir", default=None)
    generate.add_argument("--batch-id", default=None)
    generate.add_argument("--as-of", default=None)
    generate.add_argument("--force", action="store_true")
    generate.add_argument("--record", action="store_true")
    generate.add_argument("--text", action="store_true")
    generate.add_argument("--no-pdf", action="store_true")
    generate.add_argument("--dump-values", action="store_true")
    generate.add_argument("--packet", action="store_true")
    generate.add_argument("--json", action="store_true")
    generate.set_defaults(func=cmd_generate)

    batch = sub.add_parser("batch")
    batch.add_argument("--run-ids", default=None)
    batch.add_argument("--agency", default=None)
    batch.add_argument("--limit", type=int, default=50)
    batch.add_argument("--batch-id", default=None)
    batch.add_argument("--out-dir", default=None)
    batch.add_argument("--form", choices=["pcs", "npcs", "PCS", "NPCS"], default=None)
    batch.add_argument("--as-of", default=None)
    batch.add_argument("--force", action="store_true")
    batch.add_argument("--record", action="store_true")
    batch.add_argument("--text", action="store_true")
    batch.add_argument("--no-pdf", action="store_true")
    batch.add_argument("--dump-values", action="store_true")
    batch.set_defaults(func=cmd_batch)

    clock = sub.add_parser("clock")
    clock.add_argument("--as-of", default=None)
    clock.add_argument("--agency", default=None)
    clock.add_argument("--outcome", default="open")
    clock.add_argument("--state", action="append", choices=list(STATES), default=None)
    clock.add_argument("--json", action="store_true")
    clock.set_defaults(func=cmd_clock)

    mail = sub.add_parser("mail")
    mail.add_argument("--packet-id", type=int, required=True)
    mail.add_argument("--mailed-on", required=True)
    mail.add_argument("--usps-form", choices=[USPS_3817], default=USPS_3817)
    mail.add_argument("--tracking", default=None)
    mail.add_argument("--note", default=None)
    mail.set_defaults(func=cmd_mail)

    close = sub.add_parser("close")
    close.add_argument("--packet-id", type=int, required=True)
    close.add_argument("--outcome", choices=list(OUTCOMES), required=True)
    close.add_argument("--returned-on", default=None)
    close.add_argument("--note", default=None)
    close.set_defaults(func=cmd_close)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
