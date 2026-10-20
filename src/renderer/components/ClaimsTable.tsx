import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  EmptyState,
  Pill,
  WrapCell,
  TABLE_EDGE_PX,
  WRAP_CELL_TIERS,
  buildGridTemplate,
  cellFitScale,
  columnTrack,
  measureCellTiers,
  measureColumnWidths,
  resolveColumnWidths,
} from '@ds/index.js';
import type { ClaimRow } from '@shared/ipc-types';

type Direction = 'asc' | 'desc';
type SortEntry = { field: string; direction: Direction };
type SortValue = string | number;
type PillTone = 'red' | 'amber' | 'emerald';

interface ColumnMeta {
  kind: 'select' | 'preamble';
  fixed?: boolean;
  wraps?: boolean;
  maxWidth?: number;
  unclamped?: boolean;
  headerLabel?: string;
  headerClasses?: string;
  cellClasses?: string;
  measure?: (row: ClaimRow) => string;
}

interface Column {
  id: string;
  label: string;
  size?: number;
  meta: ColumnMeta;
  sortValue?: (row: ClaimRow) => SortValue;
  cell: (row: ClaimRow, ctx: CellContext) => ReactNode;
}

interface CellContext {
  tiers: Record<string, unknown>;
  checked: boolean;
  onToggleCheck: (tripId: number) => void;
}

const TABLE_HEADER_CAPS = 'text-fluid-nano font-black uppercase tracking-wider';
const HEADER_TEXT = `${TABLE_HEADER_CAPS} transition-colors cursor-pointer select-none whitespace-nowrap overflow-hidden`;
const HEADER_TONE_IDLE = 'text-content-muted hover:text-content';
const HEADER_FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';
const NUMERIC_CELL = 'text-xs font-bold tabular-nums';
const UPPER_NUMERIC_CELL = 'text-xs font-bold uppercase tabular-nums';
const WRAP_CELL = 'text-xs font-bold uppercase leading-[1.3]';
const TWO_LINE_ROW_CSS = '2.5rem';
const PILL_MEASURE = 'text-fluid-nano font-black uppercase tracking-wider leading-[2]';
const ROW_TIERS: string[] = (WRAP_CELL_TIERS as string[]).map((t) => t.replace('leading-none', 'leading-[1.3]'));
const MEASURE_OPTIONS = { percentile: 1, rowHeightCss: TWO_LINE_ROW_CSS, paddingX: 16 };
const SELECT_COL_WIDTH = 36;
const TIER_QUIET_MS = 140;
const EMPTY_FLOOR_PX = 96;
const NBSP = '\u00a0';
const DESC_FIRST_SORT_FIELDS = new Set(['date', 'days']);
const DEFAULT_SORTS: SortEntry[] = [{ field: 'days', direction: 'desc' }];

function daysSince(tripDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tripDate) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(tripDate);
  if (!m) return null;
  const [y, mo, d] = m[0].includes('/') ? [Number(m[3]), Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  const trip = new Date(y, mo - 1, d);
  if (isNaN(trip.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - trip.getTime()) / 86_400_000);
}

function addresseeSourceLabel(src: string): string {
  if (src === 'ORDERING_FACILITY') return 'Ordering';
  if (src === 'PICKUP_FACILITY') return 'Pickup';
  return 'None';
}

function addresseeSourceTone(src: string): PillTone {
  if (src === 'ORDERING_FACILITY') return 'emerald';
  if (src === 'PICKUP_FACILITY') return 'amber';
  return 'red';
}

function gateLabel(code: string): string {
  return code.replace(/_/g, NBSP).toUpperCase();
}

function orderedGates(row: ClaimRow) {
  return [...row.gates].sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

function tag(text: string): string {
  return `${NBSP}${NBSP}${NBSP}${text}${NBSP}${NBSP}${NBSP}`;
}

function addresseeText(row: ClaimRow): string {
  return `${row.AddresseeFacility || '—'} ${tag(addresseeSourceLabel(row.AddresseeSource).toUpperCase())}`;
}

function gatesText(row: ClaimRow): string {
  if (row.gates.length === 0) return tag('CLEAN');
  return orderedGates(row)
    .map((g) => tag(gateLabel(g.code)))
    .join(' ');
}

function tierClassFor(tiers: Record<string, unknown>, colId: string, value: string): string {
  const entry = tiers[colId] as { base?: number; byValue?: Map<string, number> } | undefined;
  const idx = entry?.byValue?.get(value) ?? entry?.base ?? 0;
  return ROW_TIERS[Math.min(idx, ROW_TIERS.length - 1)] ?? ROW_TIERS[0]!;
}

function BlankDash() {
  return (
    <span className="flex-1 text-center text-fluid-nano font-normal text-content-subtle" aria-label="no value">
      –
    </span>
  );
}

function Tag({ tone, solid, children }: { tone: PillTone; solid?: boolean; children: ReactNode }) {
  return (
    <Pill tone={tone} intensity={solid ? 'solid' : 'subtle'} size="sm" className="shrink-0 whitespace-nowrap leading-[1.3]">
      {children}
    </Pill>
  );
}

function SortArrow({ direction, order }: { direction: Direction; order: number }) {
  return (
    <span className="inline-flex items-baseline">
      <span
        aria-hidden="true"
        data-sort-arrow={direction}
        className={`inline-block transition-transform duration-motion-base ease-motion-ease-out ${direction === 'desc' ? 'rotate-180' : ''}`}
      >
        ↑
      </span>
      <span data-sort-order={order} className="text-[0.7em] font-black tabular-nums leading-none">
        {order}
      </span>
    </span>
  );
}

function wrapCell(colId: string, value: string, tiers: Record<string, unknown>, children: ReactNode) {
  return (
    <WrapCell
      value={value}
      tierClass={tierClassFor(tiers, colId, value)}
      fitScale={cellFitScale(tiers, colId, value)}
      fallback={<BlankDash />}
    >
      {children}
    </WrapCell>
  );
}

function fixedCell(text: string, classes: string) {
  return (
    <div className="flex h-full min-w-0 items-center justify-center px-1">
      {text ? <span className={`whitespace-nowrap text-content ${classes}`}>{text}</span> : <BlankDash />}
    </div>
  );
}

function makeColumns(): Column[] {
  const preamble = (label: string, meta: Partial<ColumnMeta>): ColumnMeta => ({
    kind: 'preamble',
    headerLabel: `${label.toUpperCase()} ↑9`,
    headerClasses: TABLE_HEADER_CAPS,
    ...meta,
  });
  return [
    {
      id: '__select__',
      label: 'Select',
      size: SELECT_COL_WIDTH,
      meta: { kind: 'select', fixed: true },
      cell: (row, ctx) => (
        <div className="flex h-full items-center justify-center">
          <input
            type="checkbox"
            checked={ctx.checked}
            disabled={!row.checkable}
            onChange={() => ctx.onToggleCheck(row.TripID)}
            onClick={(e) => e.stopPropagation()}
            className="size-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Select run ${row.RunNumberText}`}
          />
        </div>
      ),
    },
    {
      id: 'run',
      label: 'Run',
      meta: preamble('Run', { fixed: true, cellClasses: NUMERIC_CELL, measure: (r) => r.RunNumberText || '-' }),
      sortValue: (r) => r.RunNumberText,
      cell: (row) => fixedCell(row.RunNumberText, NUMERIC_CELL),
    },
    {
      id: 'date',
      label: 'Date',
      meta: preamble('Date', { fixed: true, cellClasses: UPPER_NUMERIC_CELL, measure: (r) => r.TripDate || '-' }),
      sortValue: (r) => r.TripDate,
      cell: (row) => fixedCell(row.TripDate, UPPER_NUMERIC_CELL),
    },
    {
      id: 'patient',
      label: 'Patient',
      meta: preamble('Patient', { cellClasses: WRAP_CELL, unclamped: true, measure: (r) => r.PatientName || '-' }),
      sortValue: (r) => r.PatientName,
      cell: (row, ctx) => wrapCell('patient', row.PatientName, ctx.tiers, row.PatientName),
    },
    {
      id: 'status',
      label: 'Status',
      meta: preamble('Status', { cellClasses: WRAP_CELL, unclamped: true, measure: (r) => r.TripStatus || '-' }),
      sortValue: (r) => r.TripStatus,
      cell: (row, ctx) => wrapCell('status', row.TripStatus, ctx.tiers, row.TripStatus),
    },
    {
      id: 'days',
      label: 'Days',
      meta: preamble('Days', {
        fixed: true,
        cellClasses: NUMERIC_CELL,
        measure: (r) => {
          const d = daysSince(r.TripDate);
          return d === null ? '-' : String(d);
        },
      }),
      sortValue: (r) => daysSince(r.TripDate) ?? -1,
      cell: (row) => {
        const d = daysSince(row.TripDate);
        return fixedCell(d === null ? '' : String(d), NUMERIC_CELL);
      },
    },
    {
      id: 'addressee',
      label: 'Addressee',
      meta: preamble('Addressee', { cellClasses: WRAP_CELL, wraps: true, maxWidth: 340, measure: addresseeText }),
      sortValue: (r) => r.AddresseeFacility,
      cell: (row, ctx) => {
        const value = addresseeText(row);
        const scale = cellFitScale(ctx.tiers, 'addressee', value);
        return (
          <div className="flex h-full min-w-0 items-center justify-center px-1" title={row.AddresseeFacility || undefined}>
            <span
              className={tierClassFor(ctx.tiers, 'addressee', value)}
              style={scale ? { fontSize: `${scale}em` } : undefined}
            >
              {row.AddresseeFacility || '—'}
              <Pill
                tone={addresseeSourceTone(row.AddresseeSource)}
                intensity={row.AddresseeSource === 'ORDERING_FACILITY' || row.AddresseeSource === 'PICKUP_FACILITY' ? 'subtle' : 'solid'}
                size="sm"
                className="ml-1.5 inline-block whitespace-nowrap align-middle leading-[1.3]"
              >
                {addresseeSourceLabel(row.AddresseeSource)}
              </Pill>
            </span>
          </div>
        );
      },
    },
    {
      id: 'gates',
      label: 'Gates',
      meta: preamble('Gates', { fixed: true, cellClasses: PILL_MEASURE, wraps: true, maxWidth: 300, measure: gatesText }),
      sortValue: (r) => r.gates.filter((g) => g.blocking).length * 100 + r.gates.length,
      cell: (row) => (
        <div className="flex h-full min-w-0 flex-wrap content-center items-center justify-center gap-1 px-1">
          {row.gates.length === 0 ? (
            <Tag tone="emerald">Clean</Tag>
          ) : (
            orderedGates(row).map((g) => (
              <Tag key={g.code} tone={g.blocking ? 'red' : 'amber'} solid={g.blocking}>
                {gateLabel(g.code)}
              </Tag>
            ))
          )}
        </div>
      ),
    },
  ];
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
}

function singleSort(sorts: SortEntry[], field: string): SortEntry[] {
  const firstDirection: Direction = DESC_FIRST_SORT_FIELDS.has(field) ? 'desc' : 'asc';
  const only = sorts.length === 1 && sorts[0]?.field === field ? sorts[0] : null;
  if (!only) return [{ field, direction: firstDirection }];
  if (only.direction === firstDirection) return [{ field, direction: firstDirection === 'asc' ? 'desc' : 'asc' }];
  return [];
}

function nextSorts(sorts: SortEntry[], field: string): SortEntry[] {
  const firstDirection: Direction = DESC_FIRST_SORT_FIELDS.has(field) ? 'desc' : 'asc';
  const idx = sorts.findIndex((entry) => entry.field === field);
  if (idx === -1) return [...sorts, { field, direction: firstDirection }];
  if (sorts[idx]?.direction === firstDirection) {
    const next = [...sorts];
    next[idx] = { field, direction: firstDirection === 'asc' ? 'desc' : 'asc' };
    return next;
  }
  return sorts.filter((entry) => entry.field !== field);
}

interface ClaimsTableProps {
  rows: ClaimRow[];
  checkedIds: Set<number>;
  selectedTripId: number | null;
  onToggleCheck: (tripId: number) => void;
  onSelectRow: (tripId: number | null) => void;
}

export function ClaimsTable({ rows, checkedIds, selectedTripId, onToggleCheck, onSelectRow }: ClaimsTableProps) {
  const columns = useMemo(makeColumns, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sorts, setSorts] = useState<SortEntry[]>(DEFAULT_SORTS);
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
  const [cellTiers, setCellTiers] = useState<Record<string, unknown>>({});

  const sorted = useMemo(() => {
    if (sorts.length === 0) return rows;
    const keyed = rows.map((row, index) => ({ row, index }));
    keyed.sort((x, y) => {
      for (const entry of sorts) {
        const col = columns.find((c) => c.id === entry.field);
        if (!col?.sortValue) continue;
        const diff = compareValues(col.sortValue(x.row), col.sortValue(y.row));
        if (diff !== 0) return entry.direction === 'asc' ? diff : -diff;
      }
      return x.index - y.index;
    });
    return keyed.map((k) => k.row);
  }, [rows, sorts, columns]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    void document.fonts?.ready.then(() => setFontsReady(true));
    return () => ro.disconnect();
  }, []);

  const preamble = useMemo(() => columns.filter((c) => c.meta.kind === 'preamble'), [columns]);

  useEffect(() => {
    if (!containerRef.current) return;
    const measured =
      rows.length > 0
        ? (measureColumnWidths(preamble, rows, containerRef.current, MEASURE_OPTIONS) as Record<string, number>)
        : {};
    const floors: Record<string, number> = {};
    for (const c of preamble) floors[c.id] = measured[c.id] ?? EMPTY_FLOOR_PX;
    setColumnSizing(floors);
  }, [preamble, rows, fontsReady]);

  const resolved = useMemo(() => {
    const gutter = scrollRef.current ? Math.max(0, scrollRef.current.offsetWidth - scrollRef.current.clientWidth) : 0;
    const floorsTotal = preamble.reduce((sum, c) => sum + (columnSizing[c.id] ?? 0), 0);
    const slack = Math.max(0, width - gutter - SELECT_COL_WIDTH - TABLE_EDGE_PX - floorsTotal);
    const flexExtra = Math.floor(slack / 8) * 8;
    return resolveColumnWidths(preamble, columnSizing, flexExtra) as Record<string, number>;
  }, [preamble, columnSizing, width]);

  useEffect(() => {
    if (Object.keys(columnSizing).length === 0) return undefined;
    const timer = window.setTimeout(() => {
      setCellTiers(measureCellTiers(columns, rows, resolved, {
          host: containerRef.current,
          tiers: ROW_TIERS,
          rowHeightCss: TWO_LINE_ROW_CSS,
          paddingX: MEASURE_OPTIONS.paddingX,
          rowInsetPx: 8,
        }) as Record<string, unknown>);
    }, TIER_QUIET_MS);
    return () => window.clearTimeout(timer);
  }, [columns, rows, resolved, columnSizing]);

  const { gridTemplateColumns, gridMinWidth } = useMemo(() => {
    const specs = columns.map((c) => {
      const size = c.size ?? columnSizing[c.id] ?? 0;
      return { track: columnTrack(c.meta, size), floor: size };
    });
    return buildGridTemplate(specs, { edgePx: TABLE_EDGE_PX }) as { gridTemplateColumns: string; gridMinWidth: number };
  }, [columns, columnSizing]);

  const toggleSort = useCallback(
    (field: string, additive: boolean) => setSorts((s) => (additive ? nextSorts(s, field) : singleSort(s, field))),
    [],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface-base"
    >
      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-auto">
        <div role="grid" aria-rowcount={sorted.length + 1} aria-label="Claims on hold">
          <div
            role="row"
            aria-rowindex={1}
            className="ds-pointer-fine sticky top-0 z-30 grid h-[var(--claims-table-header-h)] max-h-[var(--claims-table-header-h)] items-stretch border-b border-line bg-surface-raised"
            style={{ gridTemplateColumns, minWidth: gridMinWidth }}
          >
            {columns.map((c, i) => {
              if (!c.sortValue) {
                return (
                  <div key={c.id} role="columnheader" data-col-id={c.id} className="flex items-center justify-center">
                    <span className="sr-only">{c.label}</span>
                  </div>
                );
              }
              const idx = sorts.findIndex((s) => s.field === c.id);
              const entry = idx === -1 ? null : { direction: sorts[idx]!.direction, order: idx + 1 };
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  data-col-id={c.id}
                  aria-colindex={i + 1}
                  aria-sort={entry ? (entry.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <Button
                    variant="bare"
                    onClick={(e: { shiftKey: boolean }) => toggleSort(c.id, e.shiftKey)}
                    title="Click to sort; Shift+click to add a secondary sort"
                    className={`flex h-full w-full items-center justify-center px-1 ${HEADER_FOCUS_RING} ${HEADER_TEXT} ${HEADER_TONE_IDLE}`}
                  >
                    <span className="truncate">
                      {c.label}
                      {entry && (
                        <>
                          {' '}
                          <SortArrow direction={entry.direction} order={entry.order} />
                        </>
                      )}
                    </span>
                  </Button>
                </div>
              );
            })}
            <div aria-hidden="true" />
          </div>

          {sorted.length === 0 && (
            <div role="row" className="px-4 py-10">
              <EmptyState
                size="sm"
                title="No claims on hold"
                description={<span className="normal-case">No trips are on HOLD - POM REQUIRED</span>}
              />
            </div>
          )}

          {sorted.map((row, index) => {
            const selected = row.TripID === selectedTripId;
            const bg = !row.checkable
              ? 'bg-chip-red-bg hover:brightness-110'
              : selected
                ? 'bg-surface-overlay hover:bg-surface-overlay'
                : 'bg-surface-base hover:bg-surface-overlay';
            const ctx: CellContext = { tiers: cellTiers, checked: checkedIds.has(row.TripID), onToggleCheck };
            return (
              <div
                key={row.TripID}
                role="row"
                aria-rowindex={index + 2}
                aria-selected={selected || undefined}
                data-blocked={!row.checkable || undefined}
                onClick={() => onSelectRow(selected ? null : row.TripID)}
                className={`relative grid cursor-pointer items-stretch transition-colors ${bg} ${
                  selected ? 'z-10 outline outline-2 -outline-offset-2 outline-accent' : ''
                }`}
                style={{
                  gridTemplateColumns,
                  minWidth: gridMinWidth,
                  minHeight: 'var(--claims-table-row-height)',
                }}
              >
                {columns.map((c) => (
                  <div key={c.id} role="gridcell" data-col-id={c.id} className="claims-row-rule flex min-w-0 items-center justify-center py-1.5">
                    <div className="w-full min-w-0">{c.cell(row, ctx)}</div>
                  </div>
                ))}
                <div aria-hidden="true" className="claims-row-rule" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
