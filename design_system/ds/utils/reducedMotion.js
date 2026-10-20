import { useSyncExternalStore } from 'react';
import { EMS_PREFS_STORAGE_KEY, EMS_PREFS_CHANGE_EVENT, readEmsPrefs } from './emsPrefs.js';

const QUERY = '(prefers-reduced-motion: reduce)';

function osPrefersReduce() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

function appMotionMode() {
  const mode = readEmsPrefs()?.reduceMotion;
  return mode === 'on' || mode === 'off' ? mode : 'system';
}

function computePrefersReducedMotion() {
  const mode = appMotionMode();
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return osPrefersReduce();
}

let cache = null;

export function prefersReducedMotion() {
  if (cache === null) cache = computePrefersReducedMotion();
  return cache;
}

function invalidate() {
  cache = null;
}

let moduleListenersInstalled = false;

function ensureModuleListeners() {
  if (moduleListenersInstalled) return;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  moduleListenersInstalled = true;
  const media = window.matchMedia(QUERY);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', invalidate);
  }
  window.addEventListener(EMS_PREFS_CHANGE_EVENT, invalidate);
  window.addEventListener('storage', (event) => {
    if (event.key === EMS_PREFS_STORAGE_KEY) invalidate();
  });
}

ensureModuleListeners();

function subscribe(callback) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(QUERY);
  const notify = () => {
    cache = null;
    callback();
  };
  const teardown = [];
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', notify);
    teardown.push(() => media.removeEventListener('change', notify));
  }
  window.addEventListener(EMS_PREFS_CHANGE_EVENT, notify);
  teardown.push(() => window.removeEventListener(EMS_PREFS_CHANGE_EVENT, notify));
  const onStorage = (event) => {
    if (event.key === EMS_PREFS_STORAGE_KEY) notify();
  };
  window.addEventListener('storage', onStorage);
  teardown.push(() => window.removeEventListener('storage', onStorage));
  return () => {
    for (const off of teardown) off();
  };
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
