import { fetchWithTimeout } from './services/powerbi/http';
import { latestRefresh } from './pbi/client';
import { RUNTIME_CONFIG } from './services/runtime-config.generated';

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 1000;

export async function trigger(): Promise<string | null> {
  const baseline = await latestRefresh();
  const baselineStartTime = baseline?.startTime ?? null;

  const url = RUNTIME_CONFIG.flowUrl;
  if (!url) {
    throw new Error('POM_FLOW_URL is not configured');
  }

  const resp = await fetchWithTimeout(url, { method: 'POST' }, 30_000);
  if (!resp.ok) {
    throw new Error(`Flow trigger failed: ${resp.status}`);
  }

  return baselineStartTime;
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

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    let info: Awaited<ReturnType<typeof latestRefresh>>;
    try {
      info = await latestRefresh();
    } catch {
      if (onTick) onTick('polling error, retrying...');
      continue;
    }

    if (!info) {
      if (onTick) onTick('waiting for refresh...');
      continue;
    }

    if (baseline !== null && info.startTime <= baseline) {
      if (onTick) onTick('waiting for new refresh...');
      continue;
    }

    if (info.status === 'Completed') {
      if (onTick) onTick('Completed');
      return 'Completed';
    }
    if (info.status === 'Failed' || info.status === 'Disabled') {
      if (onTick) onTick(`Failed: ${info.status}`);
      return 'Failed';
    }
    if (onTick) onTick(`${info.status}...`);
  }

  if (onTick) onTick('Timeout');
  return 'Timeout';
}
