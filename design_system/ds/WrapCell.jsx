import { WRAP_CELL_TIERS } from './tableMeasure.js';

export function WrapCell({
  value,
  tierClass,
  fitScale = null,
  testid,
  fallback = null,
  children,
}) {
  return (
    <div className="flex items-center justify-center px-1 h-full min-w-0 overflow-hidden">
      {value ? (
        <span
          data-testid={testid}
          data-fit-scale={fitScale ?? undefined}
          className={tierClass || WRAP_CELL_TIERS[0]}
          style={fitScale ? { fontSize: `${fitScale}em` } : undefined}
        >
          {children}
        </span>
      ) : (
        fallback
      )}
    </div>
  );
}
