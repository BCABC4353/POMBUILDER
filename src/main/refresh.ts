import { app } from 'electron';
import { fetchWithTimeout } from './services/powerbi/http';
import { dataRefreshedAt } from './pbi/client';
import { RUNTIME_CONFIG } from './services/runtime-config.generated';

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 1000;

export async function trigger(): Promise<string | null> {
  const baseline = await dataRefreshedAt();

  const url = RUNTIME_CONFIG.flowUrl || (app.isPackaged ? '' : (process.env.POM_FLOW_URL ?? '').trim());
  if (!url) {
    throw new Error('POM_FLOW_URL is not configured');
  }

  const resp = await fetchWithTimeout(url, { method: 'POST' }, 30_000);
  if (!resp.ok) {
    throw new Error(`Flow trigger failed: ${resp.status}`);
  }

  return baseline;
}

export async function waitForCompletion(
  baseline: string | null,
  opts?: {
    timeoutMs?: number;
    intervalMs?: number;
    onTick?: (s: string) => void;
  },
): Promise<'Completed' | 'Failed' | 'Timeout'> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const onTick = opts?.onTick;
  const deadline = Date.now() + timeoutMs;
  const baselineMs = baseline !== null ? Date.parse(baseline) : null;

  if (onTick) onTick('Dataflow refreshing...');

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    let refreshedAt: string | null;
    try {
      refreshedAt = await dataRefreshedAt();
    } catch {
      continue;
    }

    if (refreshedAt === null) {
      continue;
    }

    const refreshedMs = Date.parse(refreshedAt);
    if (baselineMs === null || refreshedMs > baselineMs) {
      if (onTick) onTick('Done');
      return 'Completed';
    }
  }

  if (onTick) onTick('Refresh did not finish in 20 minutes; try again or contact support');
  return 'Timeout';
}
