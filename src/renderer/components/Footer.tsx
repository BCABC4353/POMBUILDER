export function Footer({
  lastRefresh,
  version,
  statusText,
}: {
  lastRefresh?: string;
  version?: string;
  statusText?: string;
}) {
  return (
    <footer className="z-30 flex h-8 shrink-0 items-center justify-between border-t border-glass-edge bg-glass-header px-fluid-md font-mono text-fluid-micro text-content-muted">
      <span className="truncate">{statusText ?? 'ready'}</span>
      <span className="shrink-0 tabular-nums">
        {lastRefresh ? `refreshed ${lastRefresh} · ` : ''}
        {version ? `v${version}` : ''}
      </span>
    </footer>
  );
}
