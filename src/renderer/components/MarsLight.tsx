import type { CSSProperties } from 'react';
import { useReducedMotion } from '@ds/utils/reducedMotion.js';
import {
  ColorPaletteBlue400,
  ColorPaletteBlue500,
  ColorPaletteBrandNavy600,
  ColorPaletteSafetyOrange500,
} from '@design/tokens.js';

const ORANGE = ColorPaletteSafetyOrange500;
const BLUE = ColorPaletteBlue500;
const BLUE_LIGHT = ColorPaletteBlue400;
const BLUE_REST = ColorPaletteBrandNavy600;

const CSS = `
.mars-light {
  --mars-period: 2600ms;
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--mars-size);
  height: var(--mars-size);
  vertical-align: middle;
}
.mars-halo {
  position: absolute;
  inset: -40%;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(closest-side circle at 50% 50%, ${ORANGE} 0%, transparent 70%);
  opacity: 0.22;
  will-change: opacity;
  animation: mars-halo-a var(--mars-period) ease-in-out infinite;
}
.mars-halo-blue {
  background: radial-gradient(closest-side circle at 50% 50%, ${BLUE} 0%, transparent 70%);
  opacity: 0;
  animation-name: mars-halo-b;
}
.mars-lens {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 50% 58%;
  will-change: transform;
  animation: mars-rock var(--mars-period) ease-in-out infinite;
}
.mars-lens .p-orange {
  fill: ${ORANGE};
  will-change: opacity;
  animation: mars-pulse-orange var(--mars-period) ease-in-out infinite;
}
.mars-lens .p-blue {
  fill: var(--mars-blue, ${BLUE_LIGHT});
  will-change: opacity;
  animation: mars-pulse-blue var(--mars-period) ease-in-out infinite;
}
@keyframes mars-rock {
  0% { transform: rotate(-14deg); }
  50% { transform: rotate(14deg); }
  100% { transform: rotate(-14deg); }
}
@keyframes mars-pulse-orange {
  0% { opacity: 1; }
  38% { opacity: 0.9; }
  50% { opacity: 0.45; }
  88% { opacity: 0.55; }
  100% { opacity: 1; }
}
@keyframes mars-pulse-blue {
  0% { opacity: 0.45; }
  38% { opacity: 0.55; }
  50% { opacity: 1; }
  88% { opacity: 0.9; }
  100% { opacity: 0.45; }
}
@keyframes mars-halo-a {
  0% { opacity: 0.3; }
  38% { opacity: 0.22; }
  50% { opacity: 0; }
  88% { opacity: 0; }
  100% { opacity: 0.3; }
}
@keyframes mars-halo-b {
  0% { opacity: 0; }
  38% { opacity: 0; }
  50% { opacity: 0.3; }
  88% { opacity: 0.22; }
  100% { opacity: 0; }
}
.mars-light[data-motion='still'] .mars-lens,
.mars-light[data-motion='still'] .mars-lens path,
.mars-light[data-motion='still'] .mars-halo {
  animation: none;
  will-change: auto;
}
.mars-light[data-motion='still'] .mars-lens {
  --mars-blue: ${BLUE_REST};
}
.mars-light[data-motion='still'] .mars-halo {
  opacity: 0.26;
}
.mars-light[data-motion='still'] .mars-halo-blue {
  opacity: 0;
}
`;

let styleInjected = false;

function ensureMarsStyle(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  if (document.querySelector('style[data-mars-light]')) return;
  const tag = document.createElement('style');
  tag.setAttribute('data-mars-light', '');
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

ensureMarsStyle();

const ORANGE_PATH = 'M0,7 C10,27 34,58 58,72 L0,72 Z';
const BLUE_PATH = 'M11,0 C21,20 45,51 74,63 L74,0 Z';

export function MarsLight({ size = 28, active = false, className = '' }: { size?: number | string; active?: boolean; className?: string }) {
  const reduced = useReducedMotion() as boolean;
  const still = reduced || !active;
  const style = {
    '--mars-size': typeof size === 'number' ? `${size}px` : size,
    '--mars-blue': BLUE_LIGHT,
  } as CSSProperties;
  return (
    <span aria-hidden="true" data-testid="mars-light" data-motion={still ? 'still' : 'sweep'} className={`mars-light ${className}`} style={style}>
      <span className="mars-halo" />
      <span className="mars-halo mars-halo-blue" />
      <svg className="mars-lens" viewBox="0 0 74 72" role="presentation" focusable="false">
        <path className="p-orange" d={ORANGE_PATH} />
        <path className="p-blue" d={BLUE_PATH} />
      </svg>
    </span>
  );
}
