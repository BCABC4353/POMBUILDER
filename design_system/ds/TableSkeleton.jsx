import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from './utils/cn';
import {
  TABLE_EDGE_PX,
  TABLE_FLEX_WEIGHT_DIVISOR,
  TABLE_SPACER_PX,
  TABLE_TILE_PX,
  buildGridTemplate,
  fixedTrack,
  toCssLength,
} from './tableGrid.js';
import { TABLE_ROW_HEIGHT_CSS } from './tableMeasure.js';

export const SHIMMER_CLASS = 'bg-skeleton-shimmer bg-[length:200%_100%] animate-skeleton-shimmer';

const GHOST_WIDTH_RATIO = 0.8;
const FALLBACK_ROWS = 15;

const DEFAULT_MATRIX_COUNT = 8;
const DEFAULT_PREAMBLE_WIDTHS = ['87px', '66px', '140px', '72px', '96px', '140px'];
const CARD_ROW_PX = 64;
const GRID_MIN_PANE_PX = 700;
const GRID_PANE_HYSTERESIS_PX = 24;

function resolveCard(width, previous) {
  if (previous === null) return width < GRID_MIN_PANE_PX;
  if (previous) return width < GRID_MIN_PANE_PX + GRID_PANE_HYSTERESIS_PX;
  return width <= GRID_MIN_PANE_PX - GRID_PANE_HYSTERESIS_PX;
}

const PREAMBLE_FLOOR_RATIO = 0.5;

function preambleTrack(width) {
  const basis =
    typeof width === 'number' ? width : parseInt(width, 10) || TABLE_FLEX_WEIGHT_DIVISOR;
  const weight = (basis / TABLE_FLEX_WEIGHT_DIVISOR).toFixed(2);
  return `minmax(calc(${toCssLength(width)} * ${PREAMBLE_FLOOR_RATIO}), ${weight}fr)`;
}

function tileTrack() {
  return `minmax(0px, ${toCssLength(TABLE_TILE_PX)})`;
}

function skeletonGridTemplate(preambleWidths, matrixCount) {
  return buildGridTemplate(
    [
      ...preambleWidths.map((w) => preambleTrack(w)),
      fixedTrack(TABLE_SPACER_PX),
      ...Array.from({ length: matrixCount }, () => tileTrack()),
    ],
    { edgePx: TABLE_EDGE_PX },
  ).gridTemplateColumns;
}

function measureRowHeight(host) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:-99999px;top:0;width:1px;visibility:hidden;height:${TABLE_ROW_HEIGHT_CSS}`;
  host.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

export function TableSkeleton({
  rows,
  variant,
  matrixCount = DEFAULT_MATRIX_COUNT,
  preambleWidths = DEFAULT_PREAMBLE_WIDTHS,
  className,
  'aria-label': ariaLabel = 'Loading claims',
  ...rest
}) {
  const rootRef = useRef(null);
  const cardRef = useRef(null);
  const [fittedRows, setFittedRows] = useState(null);
  const [autoCard, setAutoCard] = useState(false);
  const auto = variant == null;
  const isCard = auto ? autoCard : variant === 'card';

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const applyWidth = (width) => {
      if (!auto || !(width > 0)) return;
      const next = resolveCard(width, cardRef.current);
      if (next === cardRef.current) return;
      cardRef.current = next;
      setAutoCard(next);
    };
    const apply = (height) => {
      if (height <= 0) {
        setFittedRows(null);
        return;
      }
      const rowPx = isCard ? CARD_ROW_PX : measureRowHeight(el);
      if (!(rowPx > 0)) {
        setFittedRows(null);
        return;
      }
      setFittedRows(Math.max(1, Math.floor(height / rowPx)));
    };
    const rect = el.getBoundingClientRect();
    applyWidth(rect.width);
    apply(rect.height);
    let rafId = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) applyWidth(entry.contentRect.width);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) apply(entry.contentRect.height);
        rafId = null;
      });
    });
    ro.observe(el);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [isCard, auto]);

  const rowCount = rows ?? fittedRows ?? FALLBACK_ROWS;
  const gridTemplateColumns = skeletonGridTemplate(preambleWidths, matrixCount);
  const rowIndices = Array.from({ length: rowCount }, (_, i) => i);
  const matrixIndices = Array.from({ length: matrixCount }, (_, i) => i);
  if (isCard) {
    return (
      <>
        <div
          ref={rootRef}
          role="status"
          aria-busy="true"
          aria-label={ariaLabel}
          data-skeleton-variant="card"
          data-skeleton-row-count={rowCount}
          data-skeleton-rows-source={rows != null ? 'prop' : fittedRows != null ? 'fitted' : 'fallback'}
          className={cn('flex flex-col w-full h-full overflow-hidden', className)}
          {...rest}
        >
          {rowIndices.map((i) => (
            <div
              key={i}
              data-skeleton-row-idx={i}
              className="box-border flex shrink-0 flex-col justify-between border-b border-line/60 bg-surface-base px-3 py-[0.4375rem]"
              style={{ height: CARD_ROW_PX }}
            >
              <div className="flex items-center gap-1.5">
                <div className={cn('h-3 w-28 rounded', SHIMMER_CLASS)} />
                <div className={cn('h-2.5 w-44 rounded', SHIMMER_CLASS)} />
              </div>
              <div className="flex w-full gap-1">
                {matrixIndices.map((mIdx) => (
                  <div key={mIdx} className={cn('h-7 min-w-0 flex-1 rounded', SHIMMER_CLASS)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div
        ref={rootRef}
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
        data-skeleton-row-count={rowCount}
        data-skeleton-rows-source={rows != null ? 'prop' : fittedRows != null ? 'fitted' : 'fallback'}
        className={cn(
          'flex flex-col w-full h-full overflow-hidden',
          className,
        )}
        {...rest}
      >
        {rowIndices.map((i) => (
          <div
            key={i}
            data-skeleton-row-idx={i}
            className={cn(
              'grid items-center shrink-0 border-b border-line/60',
              i % 2 === 0 ? 'bg-surface-base' : 'bg-surface-base/50',
            )}
            style={{ height: TABLE_ROW_HEIGHT_CSS, gridTemplateColumns }}
          >
            {preambleWidths.map((w, pIdx) => (
              <div
                key={`p-${pIdx}`}
                data-skeleton-cell-kind="preamble"
                className="flex min-w-0 items-center justify-center px-2 h-full"
              >
                <div
                  className={cn('h-3 min-w-0 max-w-full rounded', SHIMMER_CLASS)}
                  style={{ width: `calc(${toCssLength(w)} * ${GHOST_WIDTH_RATIO})` }}
                />
              </div>
            ))}
            <div data-skeleton-cell-kind="spacer" />
            {matrixIndices.map((mIdx) => (
              <div
                key={`m-${mIdx}`}
                data-skeleton-cell-kind="matrix"
                className="flex min-w-0 items-center justify-center px-2 h-full"
              >
                <div className={cn('w-5 h-5 rounded', SHIMMER_CLASS)} />
              </div>
            ))}
            <div data-skeleton-cell-kind="edge" />
          </div>
        ))}
      </div>
    </>
  );
}
