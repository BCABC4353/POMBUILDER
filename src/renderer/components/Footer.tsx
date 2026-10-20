function formatLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function Footer({
  lastRefresh,
  version,
  total,
  mailable,
  blocked,
}: {
  lastRefresh?: string | null;
  version?: string;
  total?: number;
  mailable?: number;
  blocked?: number;
}) {
  const hasCounts = total !== undefined;
  return (
    <footer className="z-30 flex h-8 shrink-0 items-center justify-between border-t border-glass-edge bg-glass-header px-fluid-md font-mono text-fluid-micro text-content-muted">
      <span className="truncate">
        {hasCounts
          ? `${total ?? 0} total · ${mailable ?? 0} mailable · ${blocked ?? 0} blocked`
          : 'ready'}
      </span>
      <span className="shrink-0 tabular-nums">
        {lastRefresh ? `Data pulled ${formatLocalTime(lastRefresh)} · ` : ''}
        {version ? `v${version}` : ''}
      </span>
    </footer>
  );
}
