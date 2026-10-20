import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  session: { defaultSession: {}, fromPartition: vi.fn(() => ({})) },
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() },
}));

vi.mock('./services/runtime-config.generated', () => ({
  RUNTIME_CONFIG: { flowUrl: 'https://example.com/flow' },
}));

const mockLatestRefresh = vi.fn();

vi.mock('./pbi/client', () => ({
  latestRefresh: (...args: unknown[]) => mockLatestRefresh(...args),
  executeQuery: vi.fn(),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

import { trigger, waitForCompletion } from './refresh';

describe('trigger', () => {
  it('POSTs to the flow URL and returns requestedAt from the 202 response body', async () => {
    const serverTime = '2026-10-19T10:00:00.000Z';
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ requestedAt: serverTime }),
      { status: 202 },
    ));

    const result = await trigger();
    expect(result).toBe(serverTime);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/flow',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a local ISO timestamp when the 202 body has no requestedAt', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 202 }));
    const before = Date.now();
    const result = await trigger();
    const after = Date.now();
    expect(new Date(result).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(result).getTime()).toBeLessThanOrEqual(after);
  });

  it('throws when the response is not 202', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }));
    await expect(trigger()).rejects.toThrow('Flow trigger failed: 500');
  });
});

describe('waitForCompletion', () => {
  it('ignores a refresh whose startTime is before requestedAt (older-refresh-Completed is ignored)', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';

    mockLatestRefresh
      .mockResolvedValueOnce({ status: 'Completed', startTime: '2026-10-19T09:00:00.000Z' })
      .mockResolvedValueOnce({ status: 'Completed', startTime: '2026-10-19T10:01:00.000Z' });

    const result = await waitForCompletion(requestedAt, { intervalMs: 0, timeoutMs: 5000 });
    expect(result).toBe('Completed');
    expect(mockLatestRefresh).toHaveBeenCalledTimes(2);
  });

  it('resolves Completed when a newer refresh reaches Completed', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';

    mockLatestRefresh.mockResolvedValue({
      status: 'Completed',
      startTime: '2026-10-19T10:01:00.000Z',
    });

    const result = await waitForCompletion(requestedAt, { intervalMs: 0, timeoutMs: 5000 });
    expect(result).toBe('Completed');
  });

  it('resolves Failed when a newer refresh reaches Failed status', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';

    mockLatestRefresh.mockResolvedValue({
      status: 'Failed',
      startTime: '2026-10-19T10:01:00.000Z',
    });

    const result = await waitForCompletion(requestedAt, { intervalMs: 0, timeoutMs: 5000 });
    expect(result).toBe('Failed');
  });

  it('returns Timeout when the deadline passes with no matching refresh', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';

    mockLatestRefresh.mockResolvedValue({
      status: 'Unknown',
      startTime: '2026-10-19T09:00:00.000Z',
    });

    const result = await waitForCompletion(requestedAt, { intervalMs: 0, timeoutMs: 1 });
    expect(result).toBe('Timeout');
  });

  it('calls onTick with status messages including the final Completed', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';
    const ticks: string[] = [];

    mockLatestRefresh
      .mockResolvedValueOnce({ status: 'InProgress', startTime: '2026-10-19T10:01:00.000Z' })
      .mockResolvedValueOnce({ status: 'Completed', startTime: '2026-10-19T10:01:00.000Z' });

    await waitForCompletion(requestedAt, {
      intervalMs: 0,
      timeoutMs: 5000,
      onTick: (s) => ticks.push(s),
    });

    expect(ticks.some((t) => t.includes('InProgress'))).toBe(true);
    expect(ticks[ticks.length - 1]).toBe('Completed');
  });

  it('continues polling and does not throw when latestRefresh throws', async () => {
    const requestedAt = '2026-10-19T10:00:00.000Z';

    mockLatestRefresh
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ status: 'Completed', startTime: '2026-10-19T10:01:00.000Z' });

    const result = await waitForCompletion(requestedAt, { intervalMs: 0, timeoutMs: 5000 });
    expect(result).toBe('Completed');
  });
});
