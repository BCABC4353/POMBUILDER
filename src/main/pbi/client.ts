import { getAuthService } from '../auth/singleton';
import { fetchWithTimeout, throwForStatus, withRetry } from '../services/powerbi/http';
import { POWERBI_API_BASE, POM_WORKSPACE_ID, POM_DATASET_ID, POM_DATAFLOW_ID } from '../../shared/constants';
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

export async function dataRefreshedAt(): Promise<string | null> {
  try {
    const rows = await executeQuery<{ RefreshedAt: string | null }>(
      "EVALUATE ROW(\"RefreshedAt\", MAX('POM META'[RefreshedAt]))",
    );
    const val = rows[0]?.RefreshedAt;
    return val ?? null;
  } catch {
    return null;
  }
}

interface RunListResponse {
  value?: Array<{
    status?: string;
    startTime?: string;
    endTime?: string;
  }>;
}

async function runHistory(path: string): Promise<RefreshInfo[] | null> {
  const token = await getToken();
  const resp = await fetchWithTimeout(
    `${POWERBI_API_BASE}/groups/${POM_WORKSPACE_ID}/${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
    15_000,
  );
  if (resp.status === 401 || resp.status === 403 || resp.status === 404) return null;
  if (!resp.ok) await throwForStatus(resp, path);
  const body = (await resp.json()) as RunListResponse;
  const runs: RefreshInfo[] = [];
  for (const run of body.value ?? []) {
    if (!run.startTime) continue;
    runs.push({ status: run.status ?? '', startTime: run.startTime, endTime: run.endTime });
  }
  return runs;
}

export function dataflowRuns(): Promise<RefreshInfo[] | null> {
  return runHistory(`dataflows/${POM_DATAFLOW_ID}/transactions`);
}

export function datasetRuns(): Promise<RefreshInfo[] | null> {
  return runHistory(`datasets/${POM_DATASET_ID}/refreshes?$top=10`);
}
