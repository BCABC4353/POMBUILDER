import { getAuthService } from '../auth/singleton';
import { fetchWithTimeout, throwForStatus, RetriableHttpError, withRetry } from '../services/powerbi/http';
import { POWERBI_API_BASE, POM_WORKSPACE_ID, POM_DATASET_ID } from '../../shared/constants';
import type { IPCResponse, TokenResult } from '../../shared/types';

export interface RefreshInfo {
  status: string;
  startTime: string;
  endTime?: string;
}

async function getToken(forceRefresh = false): Promise<string> {
  const result: IPCResponse<TokenResult> = await getAuthService().getAccessToken(forceRefresh);
  if (!result.success) {
    throw new Error(`Auth failed: ${result.error.code} — ${result.error.message}`);
  }
  return result.data.accessToken;
}

function stripTablePrefix(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const idx = k.indexOf('[');
    const clean = idx >= 0 ? k.slice(idx + 1).replace(/\]$/, '') : k;
    out[clean] = v;
  }
  return out;
}

interface ExecuteQueriesResponse {
  results: Array<{
    tables: Array<{
      rows: Array<Record<string, unknown>>;
    }>;
  }>;
}

export async function executeQuery<T>(dax: string): Promise<T[]> {
  return withRetry(async () => {
    const token = await getToken();
    const url = `${POWERBI_API_BASE}/groups/${POM_WORKSPACE_ID}/datasets/${POM_DATASET_ID}/executeQueries`;
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        queries: [{ query: dax }],
        serializerSettings: { includeNulls: true },
      }),
    });

    if (resp.status === 401) {
      const refreshedToken = await getToken(true);
      const retry = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queries: [{ query: dax }],
          serializerSettings: { includeNulls: true },
        }),
      });
      if (!retry.ok) await throwForStatus(retry, 'executeQueries retry');
      const body = (await retry.json()) as ExecuteQueriesResponse;
      const rows = body.results?.[0]?.tables?.[0]?.rows ?? [];
      return rows.map(stripTablePrefix) as T[];
    }

    if (!resp.ok) await throwForStatus(resp, 'executeQueries');
    const body = (await resp.json()) as ExecuteQueriesResponse;
    const rows = body.results?.[0]?.tables?.[0]?.rows ?? [];
    return rows.map(stripTablePrefix) as T[];
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}

interface RefreshListResponse {
  value: Array<{
    status: string;
    startTime?: string;
    endTime?: string;
  }>;
}

export async function latestRefresh(): Promise<RefreshInfo | null> {
  return withRetry(async () => {
    const token = await getToken();
    const url = `${POWERBI_API_BASE}/groups/${POM_WORKSPACE_ID}/datasets/${POM_DATASET_ID}/refreshes?$top=1`;
    const resp = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 429) {
      const retryAfterMs = (() => {
        const h = resp.headers.get('Retry-After');
        if (!h) return undefined;
        const n = Number(h.trim());
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : undefined;
      })();
      throw new RetriableHttpError(429, 'latestRefresh: 429', retryAfterMs);
    }

    if (!resp.ok) await throwForStatus(resp, 'latestRefresh');
    const body = (await resp.json()) as RefreshListResponse;
    const first = body.value?.[0];
    if (!first || !first.startTime) return null;
    return {
      status: first.status,
      startTime: first.startTime,
      endTime: first.endTime,
    };
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}
