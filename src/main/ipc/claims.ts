import { ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { executeQuery, dataRefreshedAt } from '../pbi/client';
import { trigger, waitForCompletion } from '../refresh';
import { runHelper } from '../helper';
import { getOutputDir, setOutputDir } from '../settings';
import { getMainWindow } from '../window';
import { holdWhile } from '../updater';
import type {
  ClaimRow,
  GateInfo,
  ClockInfo,
  LoadResult,
  GenerateResult,
  SettingsData,
  IPCResponse,
} from '../../shared/ipc-types';

interface PbiRawRow {
  TripID: number;
  RunNumber: number;
  RunNumberText: string;
  TripDate: string;
  PatientName: string;
  TripStatus: string;
  StatusCode: number;
  SubSeq: string;
  BillAsEmergency: number;
  MemberID: string;
  PatientDOB: string;
  CurrentPayor: string;
  PayorSystemID: string;
  AddresseeSource: string;
  AddresseeFacility: string;
  AddresseeAddr: string;
  AddresseeAddr2: string;
  AddresseeCity: string;
  AddresseeState: string;
  AddresseeZip: string;
  OrderingDoctorName: string;
  [key: string]: unknown;
}

interface HelperGateRow {
  TripID: number;
  gates: GateInfo[];
  checkable: boolean;
  checked: boolean;
  recipient_lines: string[];
  supplier_lines: string[];
  clock: ClockInfo | null;
}

interface HelperGateResult {
  rows: HelperGateRow[];
}

interface HelperBuildResult {
  print_pdf: string;
  manifest_csv: string;
  gates_csv: string;
  pages: number;
  claims: number;
}

let _generating = false;

function pushProgress(text: string): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('claims:progress', text);
  }
}

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nowStr(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}${min}${ss}`;
}

async function loadClaims(): Promise<IPCResponse<LoadResult>> {
  try {
    const pbiRows = await executeQuery<PbiRawRow>("EVALUATE 'POM REQUIRED'");

    let lastRefresh: string | null = null;
    try {
      lastRefresh = await dataRefreshedAt();
    } catch {
    }

    const today = todayStr();
    const gateResult = (await runHelper(pbiRows, ['gate', '--as-of', today])) as HelperGateResult;

    const gateMap = new Map<number, HelperGateRow>();
    for (const gr of gateResult.rows) {
      gateMap.set(gr.TripID, gr);
    }

    const merged: ClaimRow[] = pbiRows.map((raw) => {
      const gate = gateMap.get(raw.TripID);
      return {
        TripID: raw.TripID,
        RunNumber: raw.RunNumber,
        RunNumberText: raw.RunNumberText,
        TripDate: raw.TripDate,
        PatientName: raw.PatientName,
        TripStatus: raw.TripStatus,
        StatusCode: raw.StatusCode,
        SubSeq: raw.SubSeq,
        BillAsEmergency: raw.BillAsEmergency,
        MemberID: raw.MemberID,
        PatientDOB: raw.PatientDOB,
        CurrentPayor: raw.CurrentPayor,
        PayorSystemID: raw.PayorSystemID,
        AddresseeSource: raw.AddresseeSource,
        AddresseeFacility: raw.AddresseeFacility,
        AddresseeAddr: raw.AddresseeAddr,
        AddresseeAddr2: raw.AddresseeAddr2,
        AddresseeCity: raw.AddresseeCity,
        AddresseeState: raw.AddresseeState,
        AddresseeZip: raw.AddresseeZip,
        OrderingDoctorName: raw.OrderingDoctorName,
        gates: gate?.gates ?? [],
        checkable: gate?.checkable ?? false,
        checked: gate?.checked ?? false,
        recipient_lines: gate?.recipient_lines ?? [],
        supplier_lines: gate?.supplier_lines ?? [],
        clock: gate?.clock ?? null,
      };
    });

    const gated = merged.filter((r) => !r.checkable).length;

    return {
      success: true,
      data: {
        rows: merged,
        gated,
        lastRefresh,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LOAD_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function registerClaimsIpc(): void {
  holdWhile(() => _generating);

  ipcMain.handle('claims:load', () => loadClaims());

  ipcMain.handle('claims:refresh', async () => {
    try {
      pushProgress('Requesting refresh...');
      const baseline = await trigger();
      pushProgress('Dataflow refreshing...');

      const result = await waitForCompletion(baseline, {
        timeoutMs: 20 * 60 * 1000,
        intervalMs: 5_000,
        onTick: pushProgress,
      });

      if (result === 'Timeout') {
        return {
          success: false,
          error: {
            code: 'REFRESH_TIMEOUT',
            message: 'Refresh did not finish in 20 minutes; try again or contact support',
          },
        };
      }
      if (result === 'Failed') {
        return {
          success: false,
          error: { code: 'REFRESH_FAILED', message: 'Dataset refresh failed' },
        };
      }

      pushProgress('Loading claims...');
      return await loadClaims();
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'REFRESH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  });

  ipcMain.handle(
    'claims:generate',
    async (_event, opts: { tripIds: number[] }) => {
      const outputDir = getOutputDir();
      if (!outputDir) {
        return {
          success: false,
          error: { code: 'NO_OUTPUT_DIR', message: 'Choose an output folder' },
        } satisfies IPCResponse<GenerateResult>;
      }

      const today = todayStr();
      const outDir = path.join(outputDir, today);

      if (!fs.existsSync(outputDir)) {
        return {
          success: false,
          error: { code: 'NO_OUTPUT_DIR', message: 'Choose an output folder' },
        } satisfies IPCResponse<GenerateResult>;
      }

      try {
        fs.mkdirSync(outDir);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') {
          return {
            success: false,
            error: {
              code: 'MKDIR_ERROR',
              message: err instanceof Error ? err.message : String(err),
            },
          } satisfies IPCResponse<GenerateResult>;
        }
      }

      const batchId = `pom-${today}-${nowStr()}`;
      const selectArg = opts.tripIds.join(',');

      const buildArgs: string[] = [
        'build',
        '--select',
        selectArg,
        '--out-dir',
        outDir,
        '--batch-id',
        batchId,
        '--as-of',
        today,
      ];

      let pbiRows: PbiRawRow[] = [];
      try {
        pbiRows = await executeQuery<PbiRawRow>("EVALUATE 'POM REQUIRED'");
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'QUERY_ERROR',
            message: err instanceof Error ? err.message : String(err),
          },
        } satisfies IPCResponse<GenerateResult>;
      }

      _generating = true;
      try {
        const buildResult = (await runHelper(pbiRows, buildArgs)) as HelperBuildResult;
        void shell.openPath(outDir);
        return {
          success: true,
          data: buildResult as GenerateResult,
        } satisfies IPCResponse<GenerateResult>;
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'GENERATE_ERROR',
            message: err instanceof Error ? err.message : String(err),
          },
        } satisfies IPCResponse<GenerateResult>;
      } finally {
        _generating = false;
      }
    },
  );

  ipcMain.handle('settings:get', () => {
    const data: SettingsData = {
      outputDir: getOutputDir(),
    };
    return data;
  });

  ipcMain.handle('settings:chooseOutputDir', async () => {
    const win = getMainWindow();
    const openOpts = {
      title: 'Choose output folder',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, openOpts)
      : await dialog.showOpenDialog(openOpts);
    if (result.canceled || result.filePaths.length === 0) return null;
    const chosen = result.filePaths[0];
    if (!chosen) return null;
    setOutputDir(chosen);
    return chosen;
  });

}
