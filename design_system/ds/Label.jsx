import { cn } from './utils/cn';
import { scRuns } from './utils/scText.jsx';

export function Label({ tone = 'muted', keyBase = 'label', className, children, ...rest }) {
  return (
    <span
      className={cn(
        'ds-smallcaps text-fluid-nano font-black tracking-wider',
        tone === 'secondary' ? 'text-content-secondary' : 'text-content-muted',
        className,
      )}
      {...rest}
    >
      {typeof children === 'string' ? scRuns(children, keyBase) : children}
    </span>
  );
}