import { app } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import type { ForceUpdateState } from '../shared/types';

const GITHUB_REPO = 'BCABC4353/POMBUILDER';
const FORCE_POLICY_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/update-policy.json`;

const ROUTINE_CHECK_MS = 2 * 60 * 60 * 1000;
const FORCE_POLL_MS = 10 * 60 * 1000;
const FORCE_GRACE_S = 30;
const MAX_FORCE_ATTEMPTS = 3;

let forceImmediate = false;
let updateDownloaded = false;
let installing = false;
let forceAttempts = 0;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let downloadedVersion = '';
let holdPredicate: (() => boolean) | null = null;
let sendStateCallback: ((state: ForceUpdateState) => void) | null = null;
let forceState: ForceUpdateState = { active: false, secondsLeft: FORCE_GRACE_S, holding: false };

export function holdWhile(predicate: () => boolean): void {
  holdPredicate = predicate;
}

export function setSendState(fn: (state: ForceUpdateState) => void): void {
  sendStateCallback = fn;
}

function emitState(): void {
  if (sendStateCallback) sendStateCallback(forceState);
}

export function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string): number[] => {
    const core = v.replace(/^v/i, '').split('-')[0] ?? '';
    return core.split('.').map((n) => parseInt(n, 10) || 0);
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  const preA = a.replace(/^v/i, '').includes('-');
  const preB = b.replace(/^v/i, '').includes('-');
  return !preA && preB;
}

export async function isForcedBehind(): Promise<boolean> {
  try {
    const res = await fetch(FORCE_POLICY_URL, { headers: { 'User-Agent': 'POMBUILDER-updater' } });
    if (!res.ok) return false;
    const policy = (await res.json()) as { forceMinVersion?: string };
    const min = policy.forceMinVersion;
    return Boolean(min && !min.includes('-') && isNewerVersion(min, app.getVersion()));
  } catch {
    return false;
  }
}

function stepCountdown(): void {
  const holding = holdPredicate ? holdPredicate() : false;
  if (holding) {
    forceState = { ...forceState, holding: true, secondsLeft: FORCE_GRACE_S };
    emitState();
    return;
  }
  const next = Math.max(0, forceState.secondsLeft - 1);
  forceState = { ...forceState, holding: false, secondsLeft: next };
  emitState();
  if (next <= 0) install();
}

function beginForce(): void {
  if (countdownTimer || installing) return;
  if (forceAttempts >= MAX_FORCE_ATTEMPTS) {
    log.warn(
      `[updater] forced install abandoned after ${forceAttempts} failed attempts — staying on current version.`,
    );
    return;
  }
  forceState = { active: true, secondsLeft: FORCE_GRACE_S, holding: false, version: downloadedVersion };
  emitState();
  countdownTimer = setInterval(stepCountdown, 1000);
}

export function install(): void {
  if (installing) return;
  forceAttempts += 1;
  installing = true;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  log.info('[updater] forced update ready — restarting to apply.');
  try {
    autoUpdater.quitAndInstall();
  } catch (err) {
    log.warn('[updater] quitAndInstall failed — will retry on the next check:', err);
    installing = false;
  }
}

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  try {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('error', (err) =>
      log.warn('[updater] error (staying on current version):', err),
    );
    autoUpdater.on('update-downloaded', (info: { version?: string }) => {
      updateDownloaded = true;
      downloadedVersion = info.version ?? '';
      if (forceImmediate) beginForce();
    });

    let checkInFlight = false;
    const routineCheck = async () => {
      if (checkInFlight) return;
      checkInFlight = true;
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        log.warn('[updater] check failed:', err);
      } finally {
        checkInFlight = false;
      }
    };

    const forceCheck = async () => {
      if (forceImmediate) {
        if (updateDownloaded && !installing && !countdownTimer) beginForce();
        return;
      }
      if (await isForcedBehind()) {
        forceImmediate = true;
        if (updateDownloaded) beginForce();
        else void routineCheck();
      }
    };

    void routineCheck();
    void forceCheck();
    setInterval(() => void routineCheck(), ROUTINE_CHECK_MS);
    setInterval(() => void forceCheck(), FORCE_POLL_MS);
  } catch (err) {
    log.warn('[updater] setup failed (non-fatal):', err);
  }
}
