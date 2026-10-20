import { app } from 'electron';
import log from 'electron-log/main';
import { fetchWithTimeout } from './services/powerbi/http';
import { dataRefreshedAt, dataflowRuns, datasetRuns, type RefreshInfo } from './pbi/client';
import { getRefreshDurations } from './settings';
import { RUNTIME_CONFIG } from './services/runtime-config.generated';
import type { RefreshProgress, RefreshStage } from '../shared/ipc-types';

export const REFRESH_TIMEOUT_MS = 20 * 60 * 1000;
export const REFRESH_TIMEOUT_TEXT = 'Refresh did not finish in 20 minutes. Try again; if it keeps failing, contact support.';
const POLL_MS = 3_000;
const START_SKEW_MS = 15_000;
const DEFAULT_TOTAL_MS = 45_000;
const DEFAULT_DATAFLOW_MS = 20_000;
const DEFAULT_DATASET_MS = 15_000;
const STAGE_CAP = 0.95;

const BAND_TRIGGERED = 5;
const BAND_DATAFLOW_END = 55;
const BAND_DATASET_END = 88;
export const PERCENT_DATA_READY = 90;
export const PERCENT_LOADING = 92;
export const PERCENT_CHECKING = 96;

export type WaitResult =
  | { outcome: 'Completed' }
  | { outcome: 'Timeout' }
  | { outcome: 'Failed'; message: string };

export interface ProgressReporter {
  send: (stage: RefreshStage, percent: number, text: string) => void;
  startedAt: number;
}

export function createReporter(emit: (progress: RefreshProgress) => void, startedAt = Date.now()): ProgressReporter {
  let best = 0;
  return {
    startedAt,
    send(stage, percent, text) {
      const ceiling = stage === 'done' ? 100 : 99;
      best = Math.max(best, Math.min(ceiling, percent));
      emit({ stage, percent: Math.round(best), text, elapsedMs: Date.now() - startedAt });
    },
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function durations(runs: RefreshInfo[], ok: RegExp): number[] {
  const out: number[] = [];
  for (const run of runs) {
    if (!ok.test(run.status) || !run.endTime) continue;
    const ms = Date.parse(run.endTime) - Date.parse(run.startTime);
    if (Number.isFinite(ms) && ms > 0) out.push(ms);
  }
  return out;
}

function startedSince(runs: RefreshInfo[], since: number): RefreshInfo | undefined {
  return runs
    .filter((run) => Date.parse(run.startTime) >= since - START_SKEW_MS)
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))[0];
}

function fraction(elapsedMs: number, estimateMs: number): number {
  return Math.min(STAGE_CAP, Math.max(0, elapsedMs / estimateMs));
}

const FAILED = /fail|cancel/i;
const DATAFLOW_OK = /^success/i;
const DATASET_OK = /^completed$/i;

async function readHistory(): Promise<{ dataflow: RefreshInfo[]; dataset: RefreshInfo[] } | null | undefined> {
  try {
    const [dataflow, dataset] = await Promise.all([dataflowRuns(), datasetRuns()]);
    if (dataflow === null || dataset === null) return null;
    return { dataflow, dataset };
  } catch {
    return undefined;
  }
}

export async function trigger(reporter: ProgressReporter): Promise<string | null> {
  const url = RUNTIME_CONFIG.flowUrl || (app.isPackaged ? '' : (process.env.POM_FLOW_URL ?? '').trim());
  if (!url) {
    throw new Error('Refresh is not available in this build.');
  }

  reporter.send('starting', 1, 'Starting refresh');
  const baseline = await dataRefreshedAt();

  const resp = await fetchWithTimeout(url, { method: 'POST' }, 30_000);
  if (!resp.ok) {
    throw new Error(`Flow trigger failed: ${resp.status}`);
  }
  reporter.send('starting', BAND_TRIGGERED, 'Refresh requested');
  return baseline;
}

export async function waitForCompletion(
  baseline: string | null,
  reporter: ProgressReporter,
  timeoutMs = REFRESH_TIMEOUT_MS,
): Promise<WaitResult> {
  const t0 = reporter.startedAt;
  const deadline = Date.now() + timeoutMs;
  const baselineMs = baseline !== null ? Date.parse(baseline) : null;

  let history = await readHistory();
  let historyAccess = history !== null;
  const dataflowEstimate = (history && median(durations(history.dataflow, DATAFLOW_OK))) || DEFAULT_DATAFLOW_MS;
  const datasetEstimate = (history && median(durations(history.dataset, DATASET_OK))) || DEFAULT_DATASET_MS;
  const totalEstimate = median(getRefreshDurations()) ?? DEFAULT_TOTAL_MS;
  log.info(
    `[refresh] history access=${historyAccess} dataflowEst=${Math.round(dataflowEstimate)}ms datasetEst=${Math.round(datasetEstimate)}ms totalEst=${Math.round(totalEstimate)}ms`,
  );

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_MS));
    const now = Date.now();

    const refreshedAt = await dataRefreshedAt();
    if (refreshedAt !== null) {
      const refreshedMs = Date.parse(refreshedAt);
      if (baselineMs === null || refreshedMs > baselineMs) {
        reporter.send('dataset', PERCENT_DATA_READY, 'New data is in Power BI');
        return { outcome: 'Completed' };
      }
    }

    if (historyAccess) {
      history = await readHistory();
      if (history === null) {
        historyAccess = false;
        log.info('[refresh] history access lost; falling back to measured totals');
      }
    }

    if (historyAccess && history) {
      const run = startedSince(history.dataflow, t0);
      if (!run) {
        reporter.send('rescuenet', BAND_TRIGGERED, 'Waiting for RescueNet to start');
        continue;
      }
      if (FAILED.test(run.status)) {
        return { outcome: 'Failed', message: 'The RescueNet pull failed. Try again; if it keeps failing, contact support.' };
      }
      if (!DATAFLOW_OK.test(run.status)) {
        const done = fraction(now - Date.parse(run.startTime), dataflowEstimate);
        reporter.send('rescuenet', BAND_TRIGGERED + (BAND_DATAFLOW_END - BAND_TRIGGERED) * done, 'Pulling claims from RescueNet');
        continue;
      }
      const load = startedSince(history.dataset, Date.parse(run.endTime ?? run.startTime));
      if (!load) {
        reporter.send('dataset', BAND_DATAFLOW_END, 'Starting the Power BI load');
        continue;
      }
      if (FAILED.test(load.status)) {
        return { outcome: 'Failed', message: 'The Power BI load failed. Try again; if it keeps failing, contact support.' };
      }
      if (DATASET_OK.test(load.status)) {
        reporter.send('dataset', BAND_DATASET_END, 'Finishing the Power BI load');
        continue;
      }
      const done = fraction(now - Date.parse(load.startTime), datasetEstimate);
      reporter.send('dataset', BAND_DATAFLOW_END + (BAND_DATASET_END - BAND_DATAFLOW_END) * done, 'Loading into Power BI');
      continue;
    }

    const done = fraction(now - t0, totalEstimate);
    reporter.send('rescuenet', BAND_TRIGGERED + (BAND_DATASET_END - BAND_TRIGGERED) * done, 'Refreshing from RescueNet');
  }

  return { outcome: 'Timeout' };
}
