// Persistenz: ein Zustandsobjekt in IndexedDB, mit Export/Import als JSON.
const DB_NAME = 'world-class-intonation';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'wci-state';

function freshState() {
  return {
    app: 'world-class-intonation',
    version: 1,
    createdAt: Date.now(),
    skills: {},
    confusion: {},
    answers: [],
    lessons: [],
    probe: {},
    placement: { done: false, date: null, results: null },
    settings: { minutes: 20, volume: 0.8, a4: 443, listen: 'kopf-raum', ensemble: 'beides', system: 'rein' },
    streak: { current: 0, lastDate: null },
  };
}

export const state = freshState();

let db = null;
let saveTimer = null;
const listeners = new Set();

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function mergeInto(target, src) {
  for (const k of Object.keys(src)) {
    if (k === 'settings') Object.assign(target.settings, src.settings || {});
    else if (k === 'placement') Object.assign(target.placement, src.placement || {});
    else target[k] = src[k];
  }
}

export async function loadState() {
  try {
    db = await openDb();
    const saved = await idbGet(KEY);
    if (saved) mergeInto(state, saved);
  } catch (e) {
    console.warn('IndexedDB nicht verfügbar, versuche localStorage', e);
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) mergeInto(state, JSON.parse(raw));
    } catch (e2) { /* ohne Speicher weiter */ }
  }
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) { /* nicht verfügbar */ }
  return state;
}

async function writeNow() {
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    if (db) await idbSet(KEY, snapshot);
    else localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
  }
  for (const fn of listeners) fn(state);
}

export function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}

/** Sofort speichern (vor dem Neuladen der Seite) */
export async function flushState() {
  clearTimeout(saveTimer);
  await writeNow();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function exportJson() {
  return JSON.stringify(state, null, 1);
}

export async function importJson(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || obj.app !== 'world-class-intonation' || !obj.skills) throw new Error('Keine gültige World-Class-Intonation-Datei');
  const fresh = freshState();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  mergeInto(state, obj);
  await flushState();
}

export async function resetState() {
  const keep = { syncKey: state.settings.syncKey };
  const fresh = freshState();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  if (keep.syncKey) state.settings.syncKey = keep.syncKey;
  await flushState();
}

export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
