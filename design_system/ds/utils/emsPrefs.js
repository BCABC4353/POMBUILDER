export const EMS_PREFS_STORAGE_KEY = 'ems-prefs';
export const EMS_PREFS_CHANGE_EVENT = 'ems-prefs-change';
export const LEGACY_THEME_STORAGE_KEY = 'ems-theme';

export function readEmsPrefs() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(EMS_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
