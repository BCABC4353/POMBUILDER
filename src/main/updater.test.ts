import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let appVersion = '1.0.0';

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => appVersion,
  },
  dialog: {
    showMessageBox: vi.fn().mockReturnValue(new Promise(() => {})),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const updaterEvents = new Map<string, (...args: unknown[]) => void>();
const checkForUpdates = vi.fn();
const quitAndInstall = vi.fn();

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    allowPrerelease: false,
    on: (event: string, fn: (...args: unknown[]) => void) => {
      updaterEvents.set(event, fn);
    },
    checkForUpdates: (...args: unknown[]) => checkForUpdates(...args),
    quitAndInstall: (...args: unknown[]) => quitAndInstall(...args),
  },
}));

const FORCE_POLL_MS = 10 * 60 * 1000;
const FORCE_GRACE_S = 30;
const FORCE_GRACE_MS = FORCE_GRACE_S * 1000;

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function stubPolicyFetch(body: () => string | Error, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const value = body();
      if (value instanceof Error) throw value;
      return new Response(value, { status });
    }),
  );
}

async function loadUpdater(): Promise<typeof import('./updater')> {
  vi.resetModules();
  return await import('./updater');
}

beforeEach(() => {
  appVersion = '1.0.0';
  updaterEvents.clear();
  checkForUpdates.mockResolvedValue(undefined);
  quitAndInstall.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('isNewerVersion — fleet version comparator', () => {
  it('compares segments numerically, not lexicographically (2.2.14 > 2.2.9)', async () => {
    const { isNewerVersion } = await loadUpdater();
    expect(isNewerVersion('2.2.14', '2.2.9')).toBe(true);
    expect(isNewerVersion('2.2.9', '2.2.14')).toBe(false);
  });

  it('treats equal versions as not newer', async () => {
    const { isNewerVersion } = await loadUpdater();
    expect(isNewerVersion('2.2.9', '2.2.9')).toBe(false);
    expect(isNewerVersion('v2.2.9', '2.2.9')).toBe(false);
  });

  it('handles v prefixes and missing segments', async () => {
    const { isNewerVersion } = await loadUpdater();
    expect(isNewerVersion('v2.3.0', '2.2.9')).toBe(true);
    expect(isNewerVersion('2.3', '2.2.9')).toBe(true);
    expect(isNewerVersion('2.2', '2.2.0')).toBe(false);
  });

  it('ranks a stable release above its own prerelease, never below', async () => {
    const { isNewerVersion } = await loadUpdater();
    expect(isNewerVersion('2.3.0', '2.3.0-beta.1')).toBe(true);
    expect(isNewerVersion('2.3.0-beta.1', '2.3.0')).toBe(false);
    expect(isNewerVersion('2.3.0-beta.1', '2.3.0-rc.1')).toBe(false);
  });

  it('garbage input never reads as newer', async () => {
    const { isNewerVersion } = await loadUpdater();
    expect(isNewerVersion('garbage', '1.0.0')).toBe(false);
    expect(isNewerVersion('', '0.0.1')).toBe(false);
    expect(isNewerVersion('not.a.version', '1.0.0')).toBe(false);
  });
});

describe('isForcedBehind — update-policy.json parsing', () => {
  it('forces when forceMinVersion is above the running version', async () => {
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '9.9.9' }));
    const { isForcedBehind } = await loadUpdater();
    await expect(isForcedBehind()).resolves.toBe(true);
  });

  it('does not force when forceMinVersion equals or trails the running version', async () => {
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '1.0.0' }));
    let mod = await loadUpdater();
    await expect(mod.isForcedBehind()).resolves.toBe(false);

    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '0.9.0' }));
    mod = await loadUpdater();
    await expect(mod.isForcedBehind()).resolves.toBe(false);
  });

  it('does not force on a prerelease forceMinVersion', async () => {
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '9.9.9-beta.1' }));
    const { isForcedBehind } = await loadUpdater();
    await expect(isForcedBehind()).resolves.toBe(false);
  });

  it('does not force and does not throw on malformed JSON', async () => {
    stubPolicyFetch(() => 'not-json{{{');
    const { isForcedBehind } = await loadUpdater();
    await expect(isForcedBehind()).resolves.toBe(false);
  });

  it('does not force and does not throw when the policy is missing or the field is absent', async () => {
    stubPolicyFetch(() => JSON.stringify({ note: 'no forceMinVersion here' }));
    let mod = await loadUpdater();
    await expect(mod.isForcedBehind()).resolves.toBe(false);

    stubPolicyFetch(() => 'gone', 404);
    mod = await loadUpdater();
    await expect(mod.isForcedBehind()).resolves.toBe(false);
  });

  it('does not force and does not throw when the policy is unfetchable', async () => {
    stubPolicyFetch(() => new Error('ENOTFOUND raw.githubusercontent.com'));
    const { isForcedBehind } = await loadUpdater();
    await expect(isForcedBehind()).resolves.toBe(false);
  });
});

describe('setupAutoUpdater — forced-update arming and grace timer', () => {
  it('arms the force path when the policy demands a newer version, then restarts after the grace period', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '9.9.9' }));

    const mod = await loadUpdater();
    const states: unknown[] = [];
    mod.setSendState((s) => states.push(s));
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);

    expect(checkForUpdates).toHaveBeenCalled();
    updaterEvents.get('update-downloaded')!({ version: '9.9.9' });

    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS - 1000);
    expect(quitAndInstall).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('does not arm the force path when forceMinVersion is at or below the running version', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '1.0.0' }));

    const mod = await loadUpdater();
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);

    updaterEvents.get('update-downloaded')!({ version: '1.0.0' });
    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 1000);

    expect(quitAndInstall).not.toHaveBeenCalled();
  });

  it('survives an unfetchable policy without forcing or throwing', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    stubPolicyFetch(() => new Error('proxy refused the connection'));

    const mod = await loadUpdater();
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);

    updaterEvents.get('update-downloaded')!({ version: '9.9.9' });
    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 1000);

    expect(quitAndInstall).not.toHaveBeenCalled();
  });

  it('the 10-minute poller arms the force path when the policy later demands it', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    let minVersion = '0.9.0';
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: minVersion }));

    const mod = await loadUpdater();
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);

    updaterEvents.get('update-downloaded')!({ version: '9.9.9' });
    expect(quitAndInstall).not.toHaveBeenCalled();

    minVersion = '9.9.9';
    await vi.advanceTimersByTimeAsync(FORCE_POLL_MS);

    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 1000);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 3: holdWhile(() => true) prevents quitAndInstall until predicate flips', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '9.9.9' }));

    const mod = await loadUpdater();
    const states: Array<{ holding: boolean; secondsLeft: number }> = [];
    mod.setSendState((s) => {
      const typed = s as { holding: boolean; secondsLeft: number };
      states.push({ holding: typed.holding, secondsLeft: typed.secondsLeft });
    });

    let holding = true;
    mod.holdWhile(() => holding);
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);
    updaterEvents.get('update-downloaded')!({ version: '9.9.9' });

    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 5000);
    expect(quitAndInstall).not.toHaveBeenCalled();

    const holdingStates = states.filter((s) => s.holding);
    expect(holdingStates.length).toBeGreaterThan(0);

    holding = false;
    await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 1000);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('abandoned after MAX_FORCE_ATTEMPTS failed quitAndInstall calls', async () => {
    setPlatform('win32');
    vi.useFakeTimers();
    stubPolicyFetch(() => JSON.stringify({ forceMinVersion: '9.9.9' }));
    quitAndInstall.mockImplementation(() => {
      throw new Error('NSIS locked');
    });

    const mod = await loadUpdater();
    mod.setupAutoUpdater();
    await vi.advanceTimersByTimeAsync(0);
    updaterEvents.get('update-downloaded')!({ version: '9.9.9' });

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(FORCE_GRACE_MS + 1000);
      await vi.advanceTimersByTimeAsync(FORCE_POLL_MS);
    }

    expect(quitAndInstall).toHaveBeenCalledTimes(3);
  });
});
