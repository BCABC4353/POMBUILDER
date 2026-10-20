import { useEffect, type RefObject } from 'react';

let canvas: HTMLCanvasElement | null = null;

function context(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
  }
  return canvas.getContext('2d', { willReadFrequently: true });
}

function hex(ctx: CanvasRenderingContext2D): string {
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function paint(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
}

function compositeBackground(ctx: CanvasRenderingContext2D, el: Element): string {
  const layers: string[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    layers.push(getComputedStyle(node).backgroundColor);
  }
  ctx.clearRect(0, 0, 1, 1);
  paint(ctx, getComputedStyle(document.documentElement).getPropertyValue('--surface-deep').trim() || '#000000');
  for (const layer of layers.reverse()) paint(ctx, layer);
  return hex(ctx);
}

function solid(ctx: CanvasRenderingContext2D, color: string): string {
  ctx.clearRect(0, 0, 1, 1);
  paint(ctx, color);
  return hex(ctx);
}

function floorHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--chrome-header-floor');
  const n = Math.round(parseFloat(raw));
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export function syncTitleBarOverlay(band: HTMLElement | null): void {
  const ctx = context();
  if (!ctx) return;
  const target = band ?? document.elementFromPoint(window.innerWidth - 1, 1) ?? document.body;
  const height = band ? Math.round(band.getBoundingClientRect().height) : floorHeight();
  void window.electronAPI.window.setTitleBarOverlay({
    color: compositeBackground(ctx, target),
    symbolColor: solid(ctx, getComputedStyle(document.body).color),
    height: height > 0 ? height : floorHeight(),
  });
}

export function useTitleBarOverlay(band: RefObject<HTMLElement> | null, key: string | null): void {
  useEffect(() => {
    if (key === null) return undefined;
    const el = band?.current ?? null;
    let frame = requestAnimationFrame(() => syncTitleBarOverlay(el));
    const settle = window.setTimeout(() => syncTitleBarOverlay(el), 400);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => syncTitleBarOverlay(el));
    };
    const observer = el ? new ResizeObserver(schedule) : null;
    if (el) observer?.observe(el);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [band, key]);
}
