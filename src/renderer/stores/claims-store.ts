import { create } from 'zustand';
import type { ClaimRow } from '@shared/ipc-types';

interface ClaimsState {
  rows: ClaimRow[];
  checkedIds: Set<number>;
  selectedTripId: number | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastRefresh: string | null;
  progressText: string;
  outputDir: string | null;
  generating: boolean;
  notice: string | null;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  generate: () => Promise<void>;
  toggleCheck: (tripId: number) => void;
  setAllChecked: (checked: boolean) => void;
  selectRow: (tripId: number | null) => void;
  chooseOutputDir: () => Promise<void>;
  loadSettings: () => Promise<void>;
  dismissError: () => void;
  dismissNotice: () => void;
}

function initCheckedIds(rows: ClaimRow[]): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.checkable && row.checked) {
      ids.add(row.TripID);
    }
  }
  return ids;
}

export const useClaimsStore = create<ClaimsState>((set, get) => ({
  rows: [],
  checkedIds: new Set(),
  selectedTripId: null,
  loading: false,
  refreshing: false,
  error: null,
  lastRefresh: null,
  progressText: '',
  outputDir: null,
  generating: false,
  notice: null,

  loadSettings: async () => {
    const settings = await window.electronAPI.settings.get();
    set({ outputDir: settings.outputDir });
  },

  load: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.claims.load();
      if (result.success) {
        const rows = result.data.rows;
        set({
          rows,
          checkedIds: initCheckedIds(rows),
          lastRefresh: result.data.lastRefresh,
          loading: false,
        });
      } else {
        set({ loading: false, error: result.error.message });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  refresh: async () => {
    set({ refreshing: true, error: null, notice: null, progressText: 'Refreshing from RescueNet (usually under a minute)...' });
    try {
      const result = await window.electronAPI.claims.refresh();
      if (result.success) {
        const rows = result.data.rows;
        set({
          rows,
          checkedIds: initCheckedIds(rows),
          lastRefresh: result.data.lastRefresh,
          refreshing: false,
          progressText: '',
        });
      } else {
        set({ refreshing: false, progressText: '', error: result.error.message });
      }
    } catch (err) {
      set({
        refreshing: false,
        progressText: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  generate: async () => {
    const { checkedIds, outputDir, generating } = get();
    if (generating) return;
    if (!outputDir) {
      set({ error: 'Choose an output folder' });
      return;
    }
    if (checkedIds.size === 0) return;

    set({ error: null, notice: null, generating: true });
    try {
      const result = await window.electronAPI.claims.generate({
        tripIds: Array.from(checkedIds),
      });
      if (result.success) {
        const { claims, pages, out_dir } = result.data;
        const folder = out_dir ?? outputDir;
        set({
          generating: false,
          notice: `Print file created: ${claims} ${claims === 1 ? 'claim' : 'claims'}, ${pages} ${pages === 1 ? 'page' : 'pages'} in ${folder}`,
        });
      } else {
        set({ generating: false, error: result.error.message });
      }
    } catch (err) {
      set({ generating: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  toggleCheck: (tripId: number) => {
    const { rows, checkedIds } = get();
    const row = rows.find((r) => r.TripID === tripId);
    if (!row || !row.checkable) return;
    const next = new Set(checkedIds);
    if (next.has(tripId)) {
      next.delete(tripId);
    } else {
      next.add(tripId);
    }
    set({ checkedIds: next });
  },

  setAllChecked: (checked: boolean) => {
    const { rows } = get();
    const next = new Set<number>();
    if (checked) {
      for (const row of rows) {
        if (row.checkable) next.add(row.TripID);
      }
    }
    set({ checkedIds: next });
  },

  dismissError: () => {
    set({ error: null });
  },

  dismissNotice: () => {
    set({ notice: null });
  },

  selectRow: (tripId: number | null) => {
    set({ selectedTripId: tripId });
  },

  chooseOutputDir: async () => {
    const chosen = await window.electronAPI.settings.chooseOutputDir();
    if (chosen !== null) {
      set({ outputDir: chosen });
    }
  },
}));
