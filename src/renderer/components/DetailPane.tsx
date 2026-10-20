import { SectionHeader, Pill } from '@ds/index.js';
import type { ClaimRow } from '@shared/ipc-types';

const PANE_CLASS =
  'flex h-full min-h-0 w-[clamp(288px,22vw,420px)] shrink-0 flex-col border-l border-glass-edge bg-surface-raised';

function AddressBlock({ lines, label }: { lines: string[]; label: string }) {
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return null;
  return (
    <div>
      <SectionHeader>{label}</SectionHeader>
      <div className="mt-1 space-y-0.5 font-mono text-sm text-content">
        {nonEmpty.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function statusLine(row: ClaimRow): { text: string; tone: string } {
  if (!row.checkable) return { text: 'Blocked - cannot be mailed', tone: 'text-status-danger' };
  if (row.gates.length > 0) return { text: 'Ready, review warnings', tone: 'text-chip-amber-fg' };
  return { text: 'Ready to mail', tone: 'text-status-success' };
}

export function DetailPane({ row }: { row: ClaimRow | null }) {
  if (!row) {
    return (
      <aside className={`${PANE_CLASS} p-fluid-md text-sm text-content-muted`}>
        <p>Select a row to see details</p>
      </aside>
    );
  }

  const gates = [...row.gates].sort((a, b) => Number(b.blocking) - Number(a.blocking));
  const status = statusLine(row);
  const noAddressee = row.gates.some((g) => g.code === 'no_addressee');

  return (
    <aside className={`${PANE_CLASS} overflow-y-auto custom-scrollbar`} data-testid="detail-pane">
      <div className="flex flex-col gap-fluid-sm p-fluid-md">
        <div>
          <h2 className="font-mono text-lg font-black tabular-nums text-content">{row.RunNumberText}</h2>
          <p className={`mt-0.5 text-sm font-bold ${status.tone}`} data-testid="detail-status">
            {status.text}
          </p>
        </div>

        {gates.length > 0 && (
          <div>
            <SectionHeader>Gates</SectionHeader>
            <div className="mt-1 space-y-2">
              {gates.map((g) => (
                <div key={g.code} className="rounded border border-line bg-surface-base p-2">
                  <Pill tone={g.blocking ? 'red' : 'amber'} intensity={g.blocking ? 'solid' : 'subtle'} size="sm">
                    {g.code.replace(/_/g, ' ')}
                  </Pill>
                  <p className="mt-1 text-sm text-content">{g.message}</p>
                  {g.fix_hint && <p className="mt-0.5 text-xs text-content-muted">{g.fix_hint}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {noAddressee ? (
          <div>
            <SectionHeader>Addressee (as printed)</SectionHeader>
            <p className="mt-1 text-sm font-bold text-status-danger">No mailing address</p>
          </div>
        ) : (
          <AddressBlock lines={row.recipient_lines} label="Addressee (as printed)" />
        )}
        <AddressBlock lines={row.supplier_lines} label="Supplier block" />
      </div>
    </aside>
  );
}
