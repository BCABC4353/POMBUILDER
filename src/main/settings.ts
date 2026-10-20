import Store from 'electron-store';
import { execFileSync } from 'child_process';
import * as fs from 'fs';

interface SettingsSchema {
  outputDir?: string;
}

const settingsStore = new Store<SettingsSchema>({
  name: 'pom-builder-settings',
  clearInvalidConfig: true,
});

let seeded = false;

function tryReadRegistry(): string | null {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\POM Builder', '/v', 'OutputDir'],
      { encoding: 'utf8', windowsHide: true, timeout: 5_000 },
    );
    const match = /OutputDir\s+REG_SZ\s+(.+)/.exec(output);
    const val = match?.[1];
    return val ? val.trim() : null;
  } catch {
    return null;
  }
}

function seedOnce(): void {
  if (seeded) return;
  seeded = true;
  if (settingsStore.get('outputDir')) return;
  const regVal = tryReadRegistry();
  if (regVal) {
    settingsStore.set('outputDir', regVal);
  }
}

export function getOutputDir(): string | null {
  seedOnce();
  const dir = settingsStore.get('outputDir');
  if (!dir) return null;
  try {
    if (!fs.existsSync(dir)) {
      return null;
    }
    return dir;
  } catch {
    return null;
  }
}

export function setOutputDir(dir: string): void {
  settingsStore.set('outputDir', dir);
}
