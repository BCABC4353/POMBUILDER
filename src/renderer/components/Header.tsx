import { Moon, Sun } from 'lucide-react';
import { Button } from '@ds/index.js';
import { LOGO_SRC } from '../lib/logo';
import { useTheme } from '../lib/theme';

export function Header({
  version,
  upn,
}: {
  version?: string;
  upn?: string;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header className="z-40 shrink-0 border-b border-glass-edge bg-glass-header shadow-lg">
      <div className="flex h-[var(--chrome-header-floor)] items-center justify-between gap-fluid-sm px-fluid-md">
        <div className="flex min-w-0 items-center gap-fluid-sm">
          <div className="flex shrink-0 items-center gap-2 text-fluid-title font-black tracking-wider text-brand-wordmark">
            <img src={LOGO_SRC} alt="" className="h-[1em] w-auto" />
            <span>BCABC</span>
          </div>
          <div aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
          <span className="text-fluid-nano font-black uppercase tracking-widest text-content">POM Builder</span>
          {version && (
            <span className="text-fluid-nano font-mono text-content-muted tabular-nums">v{version}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-fluid-sm">
          {upn && (
            <span className="text-fluid-nano font-bold text-content-muted truncate max-w-[200px]">{upn}</span>
          )}
          <Button
            variant="secondary"
            size="chrome"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="shrink-0"
          >
            {theme === 'dark' ? <Moon /> : <Sun />}
          </Button>
        </div>
      </div>
    </header>
  );
}
