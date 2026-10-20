from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

_here = Path(__file__).resolve().parent

if getattr(sys, "frozen", False):
    import pcs.overlay as _ov
    _ov.FORMS_DIR = Path(sys._MEIPASS) / "pcs forms"
else:
    sys.path.insert(0, str(_here))

from pcs.mapping import split_address_lines
from pcs.rescuenet import collate, constants_for, gate, recipient_lines, to_build


def _fail(msg: str) -> None:
    sys.stdout.write(json.dumps({"error": msg}) + "\n")
    sys.stdout.flush()
    sys.exit(2)


def _parse_as_of(s: str):
    from datetime import date
    try:
        return date.fromisoformat(s)
    except ValueError:
        _fail(f"invalid --as-of date: {s!r}")


def _load_rows(path: str) -> list:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as exc:
        _fail(f"cannot read rows file: {exc}")
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return list(raw.values())
    _fail("rows file must be a JSON array or object")


def _supplier_lines(consts: dict) -> list:
    lines = []
    name = consts.get("supplier_name", "")
    if name:
        lines.append(name)
    for part in split_address_lines(consts.get("supplier_address", "")):
        lines.append(part)
    phone = consts.get("supplier_phone", "")
    if phone:
        lines.append(phone)
    return lines


def cmd_gate(args: argparse.Namespace) -> None:
    rows = _load_rows(args.rows)
    as_of = _parse_as_of(args.as_of)
    result = []
    for row in rows:
        trip_id = int(row.get("TripID") or 0)
        gates = gate(row, as_of)
        checkable = not any(gt.blocking for gt in gates)
        checked = checkable and all(gt.default_checked for gt in gates)
        rlines = recipient_lines(row)
        consts = constants_for(row)
        slines = _supplier_lines(consts)
        result.append({
            "TripID": trip_id,
            "gates": [gt.as_dict() for gt in gates],
            "checkable": checkable,
            "checked": checked,
            "recipient_lines": rlines,
            "supplier_lines": slines,
        })
    sys.stdout.write(json.dumps({"rows": result}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def cmd_build(args: argparse.Namespace) -> None:
    rows = _load_rows(args.rows)
    as_of = _parse_as_of(args.as_of)
    select_ids = set(int(x.strip()) for x in args.select.split(",") if x.strip())
    if not select_ids:
        _fail("No claims selected")
    out_dir = Path(args.out_dir)

    if not out_dir.exists() or not out_dir.is_dir():
        _fail(f"Output folder not available: {args.out_dir}")
    try:
        probe = out_dir / ".pom_probe"
        probe.write_text("x")
        probe.unlink()
    except Exception:
        _fail(f"Output folder not available: {args.out_dir}")

    rows_by_id = {int(r.get("TripID") or 0): r for r in rows}

    for tid in select_ids:
        row = rows_by_id.get(tid)
        if row is None:
            _fail(f"TripID {tid} not found in rows file")
        blocking = [gt for gt in gate(row, as_of) if gt.blocking]
        if blocking:
            codes = ", ".join(gt.code for gt in blocking)
            _fail(f"TripID {tid} has blocking gates: {codes}")

    selected_rows = [rows_by_id[tid] for tid in sorted(select_ids)]
    builds = []
    for row in selected_rows:
        try:
            b = to_build(row, as_of=as_of, generated_on=as_of)
        except Exception as exc:
            tid = int(row.get("TripID") or 0)
            _fail(f"TripID {tid} build failed: {exc}")
        builds.append(b)

    batch_id = args.batch_id
    print_pdf = out_dir / f"{batch_id}_print.pdf"
    manifest_csv_path = out_dir / f"{batch_id}_manifest.csv"
    gates_csv_path = out_dir / f"{batch_id}_gates.csv"

    try:
        manifest_rows = collate(
            builds,
            selected_rows,
            print_pdf,
            batch_id=batch_id,
            generated_on=as_of,
        )
    except Exception as exc:
        _fail(f"collate failed: {exc}")

    import fitz
    doc = fitz.open(str(print_pdf))
    page_count = doc.page_count
    doc.close()

    fieldnames = ["RunNumberText", "TripDate", "AddresseeSource", "firm_sheet", "firm_line",
                  "pcs_page", "letter_page", "hold_until", "gate_codes", "notes"]
    with open(manifest_csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for mr in manifest_rows:
            flat = dict(mr)
            if isinstance(flat.get("gate_codes"), list):
                flat["gate_codes"] = "|".join(flat["gate_codes"])
            if isinstance(flat.get("notes"), list):
                flat["notes"] = "|".join(flat["notes"])
            writer.writerow({k: flat.get(k, "") for k in fieldnames})

    with open(gates_csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["RunNumberText", "TripDate", "code", "blocking", "message"])
        writer.writeheader()
        for row in rows:
            run_text = str(row.get("RunNumberText") or "")
            trip_date = str(row.get("TripDate") or "")
            gates_list = gate(row, as_of)
            if gates_list:
                for gt in gates_list:
                    writer.writerow({
                        "RunNumberText": run_text,
                        "TripDate": trip_date,
                        "code": gt.code,
                        "blocking": gt.blocking,
                        "message": gt.message,
                    })
            else:
                writer.writerow({
                    "RunNumberText": run_text,
                    "TripDate": trip_date,
                    "code": "",
                    "blocking": "",
                    "message": "",
                })

    sys.stdout.write(json.dumps({
        "print_pdf": str(print_pdf),
        "manifest_csv": str(manifest_csv_path),
        "gates_csv": str(gates_csv_path),
        "pages": page_count,
        "claims": len(manifest_rows),
    }, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command")

    gp = sub.add_parser("gate")
    gp.add_argument("--rows", required=True)
    gp.add_argument("--as-of", dest="as_of", required=True)

    bp = sub.add_parser("build")
    bp.add_argument("--rows", required=True)
    bp.add_argument("--select", required=True)
    bp.add_argument("--out-dir", dest="out_dir", required=True)
    bp.add_argument("--batch-id", dest="batch_id", required=True)
    bp.add_argument("--as-of", dest="as_of", required=True)

    args = parser.parse_args()

    try:
        if args.command == "gate":
            cmd_gate(args)
        elif args.command == "build":
            cmd_build(args)
        else:
            _fail("unknown command; use gate or build")
    except SystemExit:
        raise
    except Exception as exc:
        _fail(str(exc))


if __name__ == "__main__":
    main()
