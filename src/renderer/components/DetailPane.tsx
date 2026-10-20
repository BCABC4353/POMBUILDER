import { GlassPanel, PanelTitle, SectionHeader, Pill } from '@ds/index.js';
import type { ClaimRow } from '@shared/ipc-types';

function AddressBlock({ lines, label }: { lines: string[]; label: string }) {
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return null;
  return (
    <div>
      <SectionHeader>{label}</SectionHeader>
      <div className="mt-1 space-y-0.5 font-mono text-fluid-body text-content">
        {nonEmpty.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

export function DetailPane({ row }: { row: ClaimRow | null }) {
  if (!row) {
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-glass-edge bg-surface-raised p-fluid-md text-fluid-body text-content-muted">
        <p>Select a row to see details</p>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-fluid-sm overflow-y-auto border-l border-glass-edge bg-surface-raised p-fluid-md custom-scrollbar">
      <GlassPanel>
        <PanelTitle>{row.RunNumberText}</PanelTitle>
      </GlassPanel>

      {row.gates.length > 0 && (
        <div>
          <SectionHeader>Gates</SectionHeader>
          <div className="mt-1 space-y-2">
            {row.gates.map((g) => (
              <div key={g.code} className="rounded border border-line bg-surface-base p-2">
                <div className="flex items-center gap-1">
                  <Pill tone={g.blocking ? 'red' : 'amber'} size="sm">
                    {g.code.replace(/_/g, ' ')}
                  </Pill>
                </div>
                <p className="mt-1 text-fluid-body text-content">{g.message}</p>
                {g.fix_hint && (
                  <p className="mt-0.5 text-fluid-nano text-content-muted">{g.fix_hint}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AddressBlock lines={row.recipient_lines} label="Addressee (as printed)" />
      <AddressBlock lines={row.supplier_lines} label="Supplier block" />
    </aside>
  );
}
