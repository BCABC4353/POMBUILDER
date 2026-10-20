import { useEffect, useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { Button } from '@ds/index.js';
import type { ClaimRow } from '@shared/ipc-types';

export function BlockedBanner({ rows }: { rows: ClaimRow[] }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const blocked = rows.filter((r) => !r.checkable);
  if (blocked.length === 0) return null;

  const copyList = () => {
    const lines: string[] = [];
    for (const row of blocked) {
      for (const gate of row.gates) {
        if (gate.blocking) {
          lines.push(`${row.RunNumberText} - ${gate.message}`);
        }
      }
    }
    void navigator.clipboard.writeText(lines.join('\n')).then(() => setCopied(true));
  };

  return (
    <div className="flex shrink-0 items-center gap-fluid-sm border-b border-chip-red-bd bg-chip-red-bg px-fluid-md py-2 text-fluid-body text-chip-red-fg">
      <span className="flex-1 font-bold">
        {blocked.length} claim{blocked.length === 1 ? '' : 's'} cannot be mailed yet
      </span>
      <Button variant="secondary" size="sm" onClick={copyList} aria-live="polite">
        {copied ? <Check /> : <ClipboardCopy />}
        {copied ? 'Copied' : 'Copy List'}
      </Button>
    </div>
  );
}
