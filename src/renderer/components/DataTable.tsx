import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type UIEvent } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState } from '@ds/index.js';

export type SortValue = string | number | null | undefined;

export interface Column<T> {
  id: string;
  label: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  wrap?: boolean;
  sort?: (row: T) => SortValue;
  cell: (row: T) => ReactNode;
}

type Direction = 'asc' | 'desc';
type Widths = Record<string, number>;

const MIN_COLUMN_PX = 48;
const ROW_BUFFER = 12;
const ROW_HEIGHT_GUESS = 36;

function compare(a: SortValue, b: SortValue): number {
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

function loadWidths(key: string): Widths {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const out: Widths = {};
    for (const [id, value] of Object.entries(parsed)) if (typeof value === 'number' && value >= MIN_COLUMN_PX) out[id] = value;
    return out;
  } catch {
    return {};
  }
}

function saveWidths(key: string, widths: Widths): void {
  try {
    if (Object.keys(widths).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(widths));
  } catch {
  }
}

function alignClass(align: Column<unknown>['align']): string {
  return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
}

function RowInner<T>({
  row,
  columns,
  selected,
  selectable,
  resized,
  extraClass,
  onSelect,
  onContextMenu,
}: {
  row: T;
  columns: Column<T>[];
  selected: boolean;
  selectable: boolean;
  resized: boolean;
  extraClass: string;
  onSelect: (row: T) => void;
  onContextMenu: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
}) {
  return (
    <tr
      aria-selected={selected || undefined}
      onClick={selectable ? () => onSelect(row) : undefined}
      onContextMenu={(e) => onContextMenu(row, e)}
      className={`ds-table-row transition-colors ${selectable ? 'cursor-pointer' : 'cursor-default'} ${selected ? 'bg-row-active' : 'hover:bg-row-hover'} ${extraClass}`}
    >
      {columns.map((c) => (
        <td
          key={c.id}
          className={`px-3 py-2 align-top text-fluid-body font-bold uppercase leading-snug tabular-nums ${c.mono ? 'font-mono normal-case' : ''} ${
            resized || c.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap'
          } ${alignClass(c.align)}`}
        >
          {c.cell(row)}
        </td>
      ))}
    </tr>
  );
}

const Row = memo(RowInner) as typeof RowInner;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClass,
  onContextMenu,
  onSelect,
  selectedKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowClass?: (row: T) => string;
  onContextMenu?: (row: T) => void;
  onSelect?: (row: T) => void;
  selectedKey?: string | null;
  empty: { title: string; description?: string };
}) {
  const storageKey = useMemo(() => `table-widths:${columns.map((c) => c.id).join(',')}`, [columns]);
  const [widths, setWidths] = useState<Widths>(() => loadWidths(storageKey));
  const [sort, setSort] = useState<{ id: string; dir: Direction } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT_GUESS);
  const drag = useRef<{ id: string; startX: number; startWidth: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const rowHeightRef = useRef(ROW_HEIGHT_GUESS);
  const handlers = useRef({ onSelect, onContextMenu });
  handlers.current = { onSelect, onContextMenu };
  const resized = columns.some((c) => widths[c.id] !== undefined);
  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.id] ?? 0), 0);

  useEffect(() => saveWidths(storageKey, widths), [storageKey, widths]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    setViewport(el.clientHeight);
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sort) return rows;
    const key = column.sort;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, value: key(row) }))
      .sort((x, y) => {
        const missingX = x.value === null || x.value === undefined || x.value === '';
        const missingY = y.value === null || y.value === undefined || y.value === '';
        if (missingX !== missingY) return missingX ? 1 : -1;
        return compare(x.value, y.value) * sign || x.index - y.index;
      })
      .map((entry) => entry.row);
  }, [rows, columns, sort]);

  const count = sorted.length;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - ROW_BUFFER);
  const end = Math.min(count, Math.floor(scrollTop / rowHeight) + Math.ceil(viewport / rowHeight) + ROW_BUFFER);
  const visible = useMemo(() => sorted.slice(start, end), [sorted, start, end]);
  const topPad = start * rowHeight;
  const bottomPad = Math.max(0, count - end) * rowHeight;

  useLayoutEffect(() => {
    const tbody = body.current;
    if (!tbody || visible.length === 0) return;
    let total = 0;
    let n = 0;
    for (const child of Array.from(tbody.children)) {
      if (!child.classList.contains('ds-table-row')) continue;
      total += child.getBoundingClientRect().height;
      n += 1;
    }
    if (n === 0) return;
    const measured = total / n;
    if (Math.abs(measured - rowHeightRef.current) > 0.5) {
      rowHeightRef.current = measured;
      setRowHeight(measured);
    }
  }, [visible, resized, widths]);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    setScrollTop((prev) => (Math.abs(prev - top) < rowHeightRef.current / 2 ? prev : top));
  }, []);

  const select = useCallback((row: T) => handlers.current.onSelect?.(row), []);
  const context = useCallback((row: T, e: MouseEvent<HTMLTableRowElement>) => {
    const fn = handlers.current.onContextMenu;
    if (!fn) return;
    e.preventDefault();
    fn(row);
  }, []);

  const toggle = (id: string) => {
    setSort((current) => {
      if (current?.id !== id) return { id, dir: 'asc' };
      if (current.dir === 'asc') return { id, dir: 'desc' };
      return null;
    });
  };

  const startResize = (id: string, e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const headerRow = e.currentTarget.parentElement?.parentElement;
    const snapshot: Widths = { ...widths };
    columns.forEach((c, i) => {
      if (snapshot[c.id] !== undefined) return;
      const cell = headerRow?.children[i] as HTMLElement | undefined;
      snapshot[c.id] = Math.max(MIN_COLUMN_PX, Math.round(cell?.getBoundingClientRect().width ?? MIN_COLUMN_PX));
    });
    setWidths(snapshot);
    drag.current = { id, startX: e.clientX, startWidth: snapshot[id] as number };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveResize = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(MIN_COLUMN_PX, Math.round(d.startWidth + e.clientX - d.startX));
    setWidths((prev) => (prev[d.id] === next ? prev : { ...prev, [d.id]: next }));
  };

  const endResize = (e: PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div ref={scroller} onScroll={onScroll} className="custom-scrollbar @container-[size] relative min-h-0 flex-1 overflow-auto rounded-md border border-line bg-surface-base">
      <table className="w-full border-separate border-spacing-0" style={resized ? { tableLayout: 'fixed', width: totalWidth, minWidth: '100%' } : undefined}>
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c) => {
              const active = sort?.id === c.id ? sort.dir : null;
              const justify = c.align === 'right' ? 'justify-end' : c.align === 'center' ? 'justify-center' : 'justify-start';
              return (
                <th
                  key={c.id}
                  style={{ width: widths[c.id] ?? c.width }}
                  aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`relative border-b border-line bg-surface-raised px-3 py-2 align-bottom text-fluid-label font-black uppercase leading-tight tracking-wider ${resized ? 'whitespace-normal break-words' : 'whitespace-nowrap'} ${active ? 'text-content' : 'text-content-muted'} ${alignClass(c.align)}`}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      title={active === 'asc' ? 'Sorted ascending; click for descending' : active === 'desc' ? 'Sorted descending; click to clear' : 'Click to sort'}
                      className={`group/head inline-flex w-full cursor-pointer items-center gap-0.5 ${justify} hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
                    >
                      <span className="min-w-0">{c.label}</span>
                      {active === 'asc' ? <ChevronUp size={12} className="shrink-0" /> : active === 'desc' ? <ChevronDown size={12} className="shrink-0" /> : <ChevronsUpDown size={12} className="hidden shrink-0 opacity-40 group-hover/head:inline" />}
                    </button>
                  ) : (
                    c.label
                  )}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize; double-click to reset every column"
                    onPointerDown={(e) => startResize(c.id, e)}
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setWidths({});
                    }}
                    className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none select-none hover:bg-line active:bg-content-muted"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={body}>
          {topPad > 0 && (
            <tr aria-hidden="true" style={{ height: topPad }}>
              <td colSpan={columns.length} className="p-0" />
            </tr>
          )}
          {visible.map((row) => {
            const key = rowKey(row);
            return (
              <Row
                key={key}
                row={row}
                columns={columns}
                selected={selectedKey !== undefined && selectedKey === key}
                selectable={Boolean(onSelect)}
                resized={resized}
                extraClass={rowClass ? rowClass(row) : ''}
                onSelect={select}
                onContextMenu={context}
              />
            );
          })}
          {bottomPad > 0 && (
            <tr aria-hidden="true" style={{ height: bottomPad }}>
              <td colSpan={columns.length} className="p-0" />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="px-4 py-10">
          <EmptyState size="sm" title={empty.title} description={empty.description} />
        </div>
      )}
    </div>
  );
}

export function BlankDash() {
  return (
    <span className="font-normal text-content-subtle" aria-label="no value">
      –
    </span>
  );
}
