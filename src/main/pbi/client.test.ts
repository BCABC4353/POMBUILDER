import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetriableHttpError } from '../services/powerbi/http';

vi.mock('electron-store', () => ({
  default: class {
    get(): undefined { return undefined; }
    set(): void {}
    delete(): void {}
  },
}));

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false },
  session: {
    defaultSession: { clearStorageData: vi.fn() },
    fromPartition: vi.fn(() => ({ clearStorageData: vi.fn() })),
  },
  shell: { openExternal: vi.fn() },
  BrowserWindow: class {},
}));

const mockGetAccessToken = vi.fn();

vi.mock('../auth/singleton', () => ({
  getAuthService: () => ({ getAccessToken: mockGetAccessToken }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  mockGetAccessToken.mockResolvedValue({ success: true, data: { accessToken: 'test-token', expiresOn: null } });
});

import { executeQuery, latestRefresh } from './client';

describe('executeQuery — key stripping', () => {
  it('strips "Table[Col]" prefix from column keys', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({
        results: [{
          tables: [{
            rows: [{ 'POM REQUIRED[TripID]': 1, 'POM REQUIRED[PatientName]': 'John' }],
          }],
        }],
      }),
      { status: 200 },
    ));

    const rows = await executeQuery<{ TripID: number; PatientName: string }>('EVALUATE ...');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ TripID: 1, PatientName: 'John' });
    expect(Object.keys(rows[0] ?? {})).not.toContain('POM REQUIRED[TripID]');
  });

  it('preserves keys with no table prefix', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ results: [{ tables: [{ rows: [{ TripID: 5 }] }] }] }),
      { status: 200 },
    ));

    const rows = await executeQuery<{ TripID: number }>('EVALUATE ...');
    expect(rows[0]).toEqual({ TripID: 5 });
  });

  it('preserves null values in rows (includeNulls)', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ results: [{ tables: [{ rows: [{ '[Col]': null }] }] }] }),
      { status: 200 },
    ));

    const rows = await executeQuery<Record<string, unknown>>('EVALUATE ...');
    expect(rows[0]).toHaveProperty('Col', null);
  });

  it('returns empty array when results has no rows', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ results: [{ tables: [{ rows: [] }] }] }),
      { status: 200 },
    ));

    const rows = await executeQuery('EVALUATE ...');
    expect(rows).toEqual([]);
  });
});

describe('executeQuery — 401 retry with forceRefresh', () => {
  it('retries once with forceRefresh=true on 401 and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ results: [{ tables: [{ rows: [{ '[TripID]': 99 }] }] }] }),
        { status: 200 },
      ));

    mockGetAccessToken
      .mockResolvedValueOnce({ success: true, data: { accessToken: 'old-token', expiresOn: null } })
      .mockResolvedValueOnce({ success: true, data: { accessToken: 'new-token', expiresOn: null } });

    const rows = await executeQuery<{ TripID: number }>('EVALUATE ...');
    expect(rows[0]).toHaveProperty('TripID', 99);
    expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    const secondCall = mockGetAccessToken.mock.calls[1] as [boolean];
    expect(secondCall[0]).toBe(true);
  });
});

describe('latestRefresh', () => {
  it('returns the most recent refresh info when present', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({
        value: [{ status: 'Completed', startTime: '2026-10-19T10:00:00Z', endTime: '2026-10-19T10:05:00Z' }],
      }),
      { status: 200 },
    ));

    const result = await latestRefresh();
    expect(result).toEqual({
      status: 'Completed',
      startTime: '2026-10-19T10:00:00Z',
      endTime: '2026-10-19T10:05:00Z',
    });
  });

  it('returns null when no refresh history exists', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ value: [] }), { status: 200 }));
    const result = await latestRefresh();
    expect(result).toBeNull();
  });

  it('throws RetriableHttpError on 429 with Retry-After (honoured)', async () => {
    fetchMock.mockResolvedValue(
      new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } }),
    );
    await expect(latestRefresh()).rejects.toBeInstanceOf(RetriableHttpError);
  });
});
