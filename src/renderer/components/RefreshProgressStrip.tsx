import { useEffect, useState } from 'react';
import type { RefreshProgress, RefreshStage } from '@shared/ipc-types';
import { MarsLight } from './MarsLight';

const STEPS: { stage: RefreshStage; label: string }[] = [
  { stage: 'rescuenet', label: 'RescueNet' },
  { stage: 'dataset', label: 'Power BI' },
  { stage: 'loading', label: 'Download' },
  { stage: 'checking', label: 'Check' },
];

const ORDER: Record<RefreshStage, number> = {
  starting: 0,
  rescuenet: 0,
  dataset: 1,
  loading: 2,
  checking: 3,
  done: 4,
};

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function RefreshProgressStrip({ progress }: { progress: RefreshProgress | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState(() => ({ at: Date.now(), elapsed: 0 }));

  useEffect(() => {
    setAnchor({ at: Date.now(), elapsed: progress?.elapsedMs ?? 0 });
  }, [progress?.elapsedMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const percent = progress?.percent ?? 0;
  const current = ORDER[progress?.stage ?? 'starting'];
  const elapsed = anchor.elapsed + (now - anchor.at);

  return (
    <div
      role="progressbar"
      aria-label="Refreshing claims"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${progress?.text ?? 'Starting refresh'}, ${percent} percent`}
      data-testid="refresh-progress"
      data-stage={progress?.stage ?? 'starting'}
      className="flex shrink-0 items-center gap-fluid-md border-b border-glass-edge bg-surface-raised px-fluid-md py-2"
    >
      <MarsLight size={30} active />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-fluid-sm">
          <span className="min-w-0 flex-1 truncate text-fluid-body font-black text-content" data-testid="refresh-progress-text">
            {progress?.text ?? 'Starting refresh'}
          </span>
          <span className="shrink-0 font-mono text-fluid-label font-bold tabular-nums text-content-muted" data-testid="refresh-progress-elapsed">
            {clock(elapsed)}
          </span>
          <span className="w-[3.5ch] shrink-0 text-right font-mono text-fluid-label font-black tabular-nums text-content" data-testid="refresh-progress-percent">
            {percent}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
          <div
            data-testid="refresh-progress-bar"
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <ol className="flex gap-fluid-md text-fluid-nano font-black uppercase tracking-wider">
          {STEPS.map((step, i) => (
            <li
              key={step.stage}
              className={i < current ? 'text-status-success' : i === current ? 'text-accent' : 'text-content-subtle'}
              aria-current={i === current ? 'step' : undefined}
            >
              {i < current ? '✓ ' : `${i + 1}. `}
              {step.label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
