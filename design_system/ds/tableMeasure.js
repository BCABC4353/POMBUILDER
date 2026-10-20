const WRAP_CELL_SHARED =
  'text-content-secondary font-bold uppercase leading-none min-w-0 [overflow-wrap:break-word] text-center line-clamp-2';

export const WRAP_CELL_TIERS = [
  `text-xs ${WRAP_CELL_SHARED}`,
  `text-data-xs ${WRAP_CELL_SHARED}`,
  `text-data-nano ${WRAP_CELL_SHARED}`,
  `text-fluid-micro ${WRAP_CELL_SHARED}`,
];

export const WRAP_CELL_FLOOR_TIER = WRAP_CELL_TIERS.length - 1;

export const TABLE_MIN_CELL_WIDTH = 48;
export const TABLE_MAX_CELL_WIDTH = 140;
export const TABLE_CELL_PADDING_X = 8;
export const TABLE_WRAP_RAGGED_ALLOWANCE = 1.18;
export const TABLE_WIDTH_PERCENTILE = 0.95;
export const TABLE_ROW_HEIGHT_CSS = 'var(--claims-table-row-height)';
export const TABLE_ROW_HEIGHT_FALLBACK_PX = 40;
export const TABLE_FIT_MIN_SCALE = 0.55;
export const TABLE_MAX_WRAP_LINES = 2;
export const TABLE_ROW_INSET_PX = 1;
export const TABLE_FIT_WIDTH_SLACK_PX = 1;

const PROBE_CSS =
  'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;display:inline-block;';

const hasMeasureFn = (col) => typeof col?.meta?.measure === 'function';

const isUsable = (value) => Boolean(value) && value !== '-';

function probeBatch(specs, host = null) {
  if (specs.length === 0) return [];
  const frag = document.createDocumentFragment();
  const nodes = [];
  for (const spec of specs) {
    const el = document.createElement('span');
    el.style.cssText = PROBE_CSS;
    el.className = spec.classes || '';
    if (spec.whiteSpace !== undefined) el.style.whiteSpace = spec.whiteSpace;
    if (spec.overflowWrap !== undefined) el.style.overflowWrap = spec.overflowWrap;
    if (spec.width !== undefined) el.style.width = spec.width;
    if (spec.fontSize !== undefined) el.style.fontSize = spec.fontSize;
    el.textContent = spec.text;
    frag.appendChild(el);
    nodes.push(el);
  }
  const parent = host || document.body;
  parent.appendChild(frag);
  const boxes = nodes.map((el) => el.getBoundingClientRect());
  for (const el of nodes) el.remove();
  return boxes;
}

const flatSpec = (text, classes) => ({
  text,
  classes,
  whiteSpace: 'nowrap',
  width: 'auto',
});

const wrappedSpec = (text, classes, widthPx) => ({
  text,
  classes,
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  width: `${widthPx}px`,
});

const tierSpec = (text, classes, width) => ({
  text,
  classes,
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  width,
});

const wordSpec = (text, classes) => ({
  text,
  classes,
  whiteSpace: 'nowrap',
  overflowWrap: 'normal',
  width: 'auto',
});

function longestWord(text) {
  let widest = '';
  for (const word of String(text).split(/\s+/)) {
    if (word.length > widest.length) widest = word;
  }
  return widest;
}

const FIT_SCALE_STEPS = [
  0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.73, 0.7, 0.67, 0.64, 0.61, 0.58, 0.55,
];

export function readRowHeightPx(host, options = {}) {
  const {
    rowHeightCss = TABLE_ROW_HEIGHT_CSS,
    rowHeightFallbackPx = TABLE_ROW_HEIGHT_FALLBACK_PX,
  } = options;
  if (typeof document === 'undefined') return rowHeightFallbackPx;
  const parent = host || document.body;
  const gauge = document.createElement('div');
  gauge.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;height:${rowHeightCss};`;
  parent.appendChild(gauge);
  const h = gauge.getBoundingClientRect().height;
  parent.removeChild(gauge);
  return h > 0 ? h : rowHeightFallbackPx;
}

export function measureColumnWidths(columns, rows, host, options = {}) {
  const {
    include = hasMeasureFn,
    minWidth = TABLE_MIN_CELL_WIDTH,
    maxWidth = TABLE_MAX_CELL_WIDTH,
    paddingX = TABLE_CELL_PADDING_X,
    raggedAllowance = TABLE_WRAP_RAGGED_ALLOWANCE,
    percentile = TABLE_WIDTH_PERCENTILE,
    rowHeightCss = TABLE_ROW_HEIGHT_CSS,
    rowHeightFallbackPx = TABLE_ROW_HEIGHT_FALLBACK_PX,
    maxWrapLines = TABLE_MAX_WRAP_LINES,
  } = options;

  const probe = (specs) => probeBatch(specs, host);
  const wordFloorCap = (meta) => meta.maxWidth ?? maxWidth;

  if (typeof document === 'undefined' || !rows?.length) return {};

  const rowHeightPx = readRowHeightPx(host, { rowHeightCss, rowHeightFallbackPx });

  const plans = [];
  const specs = [];
  const push = (spec) => {
    specs.push(spec);
    return specs.length - 1;
  };

  for (const col of columns) {
    if (!include(col)) continue;
    const meta = col.meta;
    const plan = { col, meta, headerIdx: push(flatSpec(meta.headerLabel, meta.headerClasses)) };

    if (meta.wraps) {
      const ceiling = meta.maxWidth ?? maxWidth;
      const values = new Set();
      for (const row of rows) {
        const v = meta.measure(row);
        if (isUsable(v)) values.add(v);
      }
      plan.wraps = true;
      plan.ceiling = ceiling;
      plan.values = [...values];
      plan.lineIdx = push(wrappedSpec('Xy', meta.cellClasses, ceiling));
      plan.valueIdx = plan.values.map((v) => push(flatSpec(v, meta.cellClasses)));
      plan.wordIdx = plan.values.map((v) => push(flatSpec(longestWord(v), meta.cellClasses)));
      plans.push(plan);
      continue;
    }

    const lengths = [];
    for (const row of rows) {
      const v = meta.measure(row);
      if (isUsable(v)) lengths.push(v.length);
    }
    let targetLen = 0;
    if (lengths.length > 0) {
      lengths.sort((a, b) => a - b);
      const idx = Math.min(lengths.length - 1, Math.floor(lengths.length * percentile));
      targetLen = lengths[idx];
    }
    const threshold = Math.max(0, targetLen - 1);
    const candidates = new Set();
    for (const row of rows) {
      const v = meta.measure(row);
      if (!isUsable(v)) continue;
      if (v.length >= threshold && v.length <= targetLen) candidates.add(v);
    }
    plan.wraps = false;
    plan.candidateIdx = [...candidates].map((v) => push(flatSpec(v, meta.cellClasses)));
    const affix = meta.affix;
    plan.affixIdx = affix && rows.some(affix.applies) ? push(flatSpec(affix.glyph, affix.classes)) : null;
    plan.slackIdx = meta.slackChars
      ? push(flatSpec('0'.repeat(meta.slackChars), meta.cellClasses))
      : null;
    plans.push(plan);
  }

  const flat = probe(specs);

  const widthById = {};
  const widening = [];
  for (const plan of plans) {
    const { col, meta } = plan;
    const headerW = flat[plan.headerIdx].width;

    if (plan.wraps) {
      const lineH = flat[plan.lineIdx].height || 1;
      const lines = Math.min(maxWrapLines, Math.max(1, Math.floor(rowHeightPx / lineH)));
      let need = headerW;
      for (const idx of plan.valueIdx) {
        need = Math.max(need, (flat[idx].width / lines) * raggedAllowance);
      }
      let widestWord = 0;
      for (const idx of plan.wordIdx) {
        widestWord = Math.max(widestWord, flat[idx].width);
      }
      need = Math.max(need, Math.min(widestWord, wordFloorCap(meta)));
      const width = Math.max(
        Math.min(plan.ceiling, Math.max(minWidth, Math.ceil(need + paddingX))),
        Math.ceil(headerW + paddingX),
      );
      widthById[col.id] = width;
      if (plan.values.length > 0) widening.push(plan);
      continue;
    }

    let maxCellW = 0;
    for (const idx of plan.candidateIdx) {
      const w = flat[idx].width;
      if (w > maxCellW) maxCellW = w;
    }
    const affixW = plan.affixIdx === null ? 0 : flat[plan.affixIdx].width + meta.affix.gapPx;
    const slackW = plan.slackIdx === null ? 0 : flat[plan.slackIdx].width;
    const measured = Math.ceil(Math.max(headerW, maxCellW + affixW + slackW) + paddingX);
    const ceiling = meta.unclamped ? Infinity : maxWidth;
    widthById[col.id] = Math.max(Math.min(ceiling, Math.max(minWidth, measured)), Math.ceil(headerW + paddingX));
  }

  let pending = widening;
  while (pending.length > 0) {
    const roundSpecs = [];
    const ranges = [];
    for (const plan of pending) {
      const inner = widthById[plan.col.id] - paddingX;
      const from = roundSpecs.length;
      for (const v of plan.values) {
        roundSpecs.push(wrappedSpec(v, plan.meta.cellClasses, inner));
      }
      ranges.push({ plan, from, to: roundSpecs.length });
    }
    const boxes = probe(roundSpecs);
    const next = [];
    for (const { plan, from, to } of ranges) {
      let overflows = false;
      for (let i = from; i < to; i += 1) {
        if (boxes[i].height > rowHeightPx + 0.5) {
          overflows = true;
          break;
        }
      }
      if (!overflows) continue;
      const width = widthById[plan.col.id];
      if (width >= plan.ceiling) continue;
      widthById[plan.col.id] = Math.min(plan.ceiling, width + 8);
      next.push(plan);
    }
    pending = next;
  }

  return widthById;
}

export function measureCellTiers(columns, rows, widthById, options = {}) {
  const {
    tiers: tierClasses = WRAP_CELL_TIERS,
    paddingX = TABLE_CELL_PADDING_X,
    host = null,
    rowHeightCss = TABLE_ROW_HEIGHT_CSS,
    rowHeightFallbackPx = TABLE_ROW_HEIGHT_FALLBACK_PX,
    fitMinScale = TABLE_FIT_MIN_SCALE,
    maxWrapLines = TABLE_MAX_WRAP_LINES,
    rowInsetPx = TABLE_ROW_INSET_PX,
    widthSlackPx = TABLE_FIT_WIDTH_SLACK_PX,
  } = options;

  if (typeof document === 'undefined' || !rows?.length) return {};

  const budgetPx =
    readRowHeightPx(host, { rowHeightCss, rowHeightFallbackPx }) - rowInsetPx;

  const probe = (specs) => probeBatch(specs, host);

  const floorTier = tierClasses.length - 1;

  const heightCap = (lineH) => {
    const lines = Math.min(maxWrapLines, Math.floor(budgetPx / lineH));
    return lines < 1 ? 0 : lines * lineH;
  };
  const fitsBox = (wrapped, word, inner, cap) =>
    cap > 0 && wrapped.height <= cap + 0.5 && word.width <= inner;

  const plans = [];
  for (const col of columns) {
    if (!col.meta?.wraps) continue;
    const width = widthById[col.id];
    if (!width) continue;
    const inner = Math.max(1, Math.floor(width) - paddingX - widthSlackPx);
    const values = [];
    const seen = new Set();
    for (const row of rows) {
      const v = col.meta.measure(row);
      if (!isUsable(v) || seen.has(v)) continue;
      seen.add(v);
      values.push(v);
    }
    plans.push({
      col,
      inner,
      values,
      tier: new Map(values.map((v) => [v, floorTier])),
      fit: new Map(),
    });
  }

  const openEntries = () => {
    const entries = [];
    for (const plan of plans) {
      for (const value of plan.values) {
        if (plan.tier.get(value) === floorTier) entries.push({ plan, value });
      }
    }
    return entries;
  };

  const pairSpecs = (entries, classes, fontSize) =>
    entries.flatMap(({ plan, value }) => [
      { ...tierSpec(value, classes, `${plan.inner}px`), fontSize },
      { ...wordSpec(longestWord(value), classes), fontSize },
    ]);

  const tierLineBoxes = probe(tierClasses.map((classes) => wordSpec('Xy', classes)));
  const tierCaps = tierLineBoxes.map((box) => heightCap(box.height || 1));

  for (let t = 0; t < floorTier; t += 1) {
    const entries = openEntries();
    if (entries.length === 0) break;
    if (tierCaps[t] <= 0) continue;
    const boxes = probe(pairSpecs(entries, tierClasses[t]));
    entries.forEach(({ plan, value }, i) => {
      if (fitsBox(boxes[i * 2], boxes[i * 2 + 1], plan.inner, tierCaps[t])) {
        plan.tier.set(value, t);
      }
    });
  }

  let unfit = openEntries();
  if (unfit.length > 0) {
    const boxes = probe(pairSpecs(unfit, tierClasses[floorTier]));
    unfit = unfit.filter(
      ({ plan, value }, i) =>
        !fitsBox(boxes[i * 2], boxes[i * 2 + 1], plan.inner, tierCaps[floorTier]),
    );
  }

  if (unfit.length > 0) {
    let minScale = 1;
    for (const scale of FIT_SCALE_STEPS) {
      if (unfit.length === 0 || scale < fitMinScale) break;
      minScale = scale;
      const fontSize = `${scale}em`;
      const [lineBox, ...boxes] = probe([
        { ...wordSpec('Xy', tierClasses[floorTier]), fontSize },
        ...pairSpecs(unfit, tierClasses[floorTier], fontSize),
      ]);
      const cap = heightCap(lineBox.height || 1);
      const still = [];
      unfit.forEach((entry, i) => {
        if (fitsBox(boxes[i * 2], boxes[i * 2 + 1], entry.plan.inner, cap)) {
          entry.plan.fit.set(entry.value, scale);
        } else {
          still.push(entry);
        }
      });
      unfit = still;
    }
    for (const entry of unfit) entry.plan.fit.set(entry.value, minScale);
  }

  const result = {};
  for (const plan of plans) {
    result[plan.col.id] = { base: floorTier, byValue: plan.tier, fitByValue: plan.fit };
  }

  return result;
}

export function cellTierClass(tiers, colId, value) {
  const entry = tiers?.[colId];
  if (!entry) return WRAP_CELL_TIERS[0];
  const tier = entry.byValue?.get(value);
  const resolved = tier ?? entry.base ?? 0;
  return WRAP_CELL_TIERS[Math.min(resolved, WRAP_CELL_FLOOR_TIER)];
}

export function cellFitScale(tiers, colId, value) {
  return tiers?.[colId]?.fitByValue?.get(value) ?? null;
}

export function resolveColumnWidths(columns, floors = {}, flexExtra = 0, options = {}) {
  const { isFlexible = (col) => !col?.meta?.fixed } = options;
  const flexIds = columns.filter((col) => isFlexible(col)).map((col) => col.id);
  const flexSet = new Set(flexIds);
  const sumFloors = flexIds.reduce((total, id) => total + (floors[id] || 0), 0);
  const resolved = {};
  for (const col of columns) {
    const floor = floors[col.id] || 0;
    resolved[col.id] =
      sumFloors > 0 && flexSet.has(col.id) ? floor + (flexExtra * floor) / sumFloors : floor;
  }
  return resolved;
}
