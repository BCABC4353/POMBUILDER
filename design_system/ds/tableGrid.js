export const TABLE_SPACER_PX = 6;
export const TABLE_EDGE_PX = 4;
export const TABLE_TILE_PX = 100;
export const TABLE_COLUMN_GAP_PX = 0;
export const TABLE_FLEX_WEIGHT_DIVISOR = 100;

export function toCssLength(value) {
  return typeof value === 'number' ? `${value}px` : String(value);
}

export function fixedTrack(width) {
  return toCssLength(width);
}

export function flexTrack(width) {
  const basis =
    typeof width === 'number'
      ? width
      : parseInt(width, 10) || TABLE_FLEX_WEIGHT_DIVISOR;
  const weight = (basis / TABLE_FLEX_WEIGHT_DIVISOR).toFixed(2);
  return `minmax(${toCssLength(width)}, ${weight}fr)`;
}

export function collapsibleTrack(max = TABLE_SPACER_PX) {
  return `minmax(0px, ${toCssLength(max)})`;
}

export function columnTrack(meta = {}, width = 0) {
  if (typeof meta.track === 'string') return meta.track;
  if (meta.collapsible) return collapsibleTrack(meta.collapsibleMaxPx ?? TABLE_SPACER_PX);
  if (meta.fixed) return fixedTrack(width);
  return flexTrack(width);
}

export function buildGridTemplate(specs, options = {}) {
  const { edgePx = TABLE_EDGE_PX, columnGapPx = TABLE_COLUMN_GAP_PX } = options;
  const parts = [];
  let floor = 0;
  for (const spec of specs) {
    parts.push(typeof spec === 'string' ? spec : spec.track);
    floor += (typeof spec === 'string' ? 0 : spec.floor) || 0;
  }
  if (edgePx != null) {
    parts.push(toCssLength(edgePx));
    floor += typeof edgePx === 'number' ? edgePx : 0;
  }
  return {
    gridTemplateColumns: parts.join(' '),
    gridMinWidth: floor + columnGapPx * Math.max(0, parts.length - 1),
  };
}
