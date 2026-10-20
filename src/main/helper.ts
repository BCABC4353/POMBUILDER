import { execFile } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';

const CONDA_PYTHON = 'C:\\Users\\Brendan Cameron\\.conda\\envs\\ems_extractor\\python.exe';

function helperExePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'helper', 'pom_helper', 'pom_helper.exe');
  }
  return CONDA_PYTHON;
}

function buildExeArgs(helperArgs: string[]): string[] {
  if (app.isPackaged) {
    return helperArgs;
  }
  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'helper', 'pom_helper.py');
  return [scriptPath, ...helperArgs];
}

export async function runHelper(rows: unknown[], args: string[]): Promise<object> {
  const dir = path.join(os.tmpdir(), 'pom-builder');
  fs.mkdirSync(dir, { recursive: true });
  const rowsFile = path.join(dir, `${randomUUID()}.json`);
  fs.writeFileSync(rowsFile, JSON.stringify(rows), 'utf-8');

  const subcmd = args[0];
  const rest = args.slice(1);
  if (!subcmd) {
    fs.unlinkSync(rowsFile);
    throw new Error('runHelper: args must include a subcommand');
  }

  const helperArgs = [subcmd, '--rows', rowsFile, ...rest];
  const exe = helperExePath();
  const exeArgs = buildExeArgs(helperArgs);

  try {
    return await new Promise<object>((resolve, reject) => {
      execFile(
        exe,
        exeArgs,
        { windowsHide: true, timeout: 120_000, maxBuffer: 100 * 1024 * 1024 },
        (error, stdout, _stderr) => {
          if (error) {
            if (typeof error.code === 'number' && error.code === 2) {
              try {
                const parsed = JSON.parse(stdout.trim()) as { error?: string };
                reject(new Error(parsed.error ?? 'helper exit 2'));
              } catch {
                reject(new Error(`helper exit 2: ${stdout.slice(0, 400)}`));
              }
              return;
            }
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()) as object);
          } catch {
            reject(new Error(`helper returned non-JSON: ${stdout.slice(0, 400)}`));
          }
        },
      );
    });
  } finally {
    try {
      fs.unlinkSync(rowsFile);
    } catch {
    }
  }
}
