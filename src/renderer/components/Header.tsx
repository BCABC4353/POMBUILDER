import { useRef } from 'react';
import { Moon, Sun, RefreshCw } from 'lucide-react';
import { Button } from '@ds/index.js';
import { LOGO_SRC } from '../lib/logo';
import { useTheme } from '../lib/theme';
import { useTitleBarOverlay } from '../lib/titlebar';

const NO_DRAG = '[-webkit-app-region:no-drag]';

export function Header({
  upn,
  refreshing,
  progressText,
  onRefresh,
}: {
  upn?: string;
  refreshing?: boolean;
  progressText?: string;
  onRefresh?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const band = useRef<HTMLDivElement>(null);
  useTitleBarOverlay(band, theme);
  return (
    <header
      className="z-40 shrink-0 select-none border-b border-glass-edge bg-glass-header shadow-lg [-webkit-app-region:drag]"
      style={{ paddingRight: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))' }}
    >
      <div
        ref={band}
        className="flex h-[var(--chrome-header-floor)] items-center justify-between gap-fluid-sm px-fluid-md"
      >
        <div className="flex min-w-0 items-center gap-fluid-sm">
          <div className="flex shrink-0 items-center gap-2 text-fluid-title font-black leading-none tracking-wider text-brand-wordmark">
            <img src={LOGO_SRC} alt="" className="h-[1em] w-auto" />
            <span>BCABC</span>
          </div>
          <div aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
          <span className="text-fluid-nano font-black uppercase leading-none tracking-widest text-content">POM Builder</span>
        </div>
        <div className="flex min-w-0 items-center gap-fluid-sm">
          {refreshing && progressText && (
            <span className="max-w-[240px] truncate text-fluid-nano leading-none text-content-muted">
              {progressText}
            </span>
          )}
          {upn && (
            <span
              title={upn}
              className="flex h-[var(--filter-ctl-h)] max-w-[240px] items-center truncate rounded border border-line bg-surface-raised px-fluid-ctl-3 text-fluid-nano font-bold leading-none text-content-muted"
            >
              <span className="truncate">{upn}</span>
            </span>
          )}
          {onRefresh && (
            <Button
              variant="refresh"
              size="chrome"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh claims"
              title="Refresh claims"
              className={`shrink-0 normal-case ${NO_DRAG}`}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="chrome"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className={`shrink-0 ${NO_DRAG}`}
          >
            {theme === 'dark' ? <Moon /> : <Sun />}
          </Button>
        </div>
      </div>
    </header>
  );
}
