// Sync: Fortschritt über denselben Cloudflare-Worker wie World Class Ear abgleichen (Zusammenführen statt Überschreiben).
// Der Schlüssel ist derselbe wie in World Class Ear; die App hängt „-intonation“ an, damit die Daten getrennt bleiben.
import { state, saveState, onChange } from './state.js';

export const SYNC_URL = 'https://world-class-ear-sync.jakobgaede.workers.dev/state';
const SUFFIX = '-intonation';
let pushTimer = null;
let busy = false;
const listeners = new Set();

export function syncStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function tell(msg) { for (const fn of listeners) fn(msg); }

export function syncEnabled() { return !!(state.settings.syncKey && state.settings.syncKey.length >= 6); }

function mergeSkills(a, b) {
  const out = { ...a };
  for (const [id, s] of Object.entries(b || {})) {
    const cur = out[id];
    if (!cur || (s.n || 0) > (cur.n || 0) || ((s.n || 0) === (cur.n || 0) && (s.lastPracticed || 0) > (cur.lastPracticed || 0))) out[id] = s;
  }
  return out;
}

function mergeConfusion(a, b) {
  const out = JSON.parse(JSON.stringify(a || {}));
  for (const [skill, rows] of Object.entries(b || {})) {
    out[skill] = out[skill] || {};
    for (const [truth, cols] of Object.entries(rows)) {
      out[skill][truth] = out[skill][truth] || {};
      for (const [ans, n] of Object.entries(cols)) out[skill][truth][ans] = Math.max(out[skill][truth][ans] || 0, n);
    }
  }
  return out;
}

function mergeAnswers(a, b) {
  const seen = new Set();
  const all = [];
  for (const x of [...(a || []), ...(b || [])]) {
    const k = x.t + '|' + x.skill;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(x);
  }
  all.sort((x, y) => x.t - y.t);
  return all.slice(-6000);
}

function mergeLessons(a, b) {
  const byId = {};
  for (const l of [...(a || []), ...(b || [])]) {
    const cur = byId[l.createdAt];
    if (!cur || (l.progress || 0) > (cur.progress || 0) || (l.done && !cur.done)) byId[l.createdAt] = l;
  }
  return Object.values(byId).sort((x, y) => x.createdAt - y.createdAt).slice(-200);
}

function mergeProbe(a, b) {
  const out = { ...(a || {}) };
  for (const [cat, e] of Object.entries(b || {})) {
    if (!out[cat] || (e.n || 0) > (out[cat].n || 0)) out[cat] = e;
  }
  return out;
}

/** Entfernten Zustand in den lokalen einarbeiten (lokale Einstellungen und Sync-Schlüssel bleiben). */
export function mergeRemote(remote) {
  if (!remote || typeof remote !== 'object') return;
  state.skills = mergeSkills(state.skills, remote.skills);
  state.confusion = mergeConfusion(state.confusion, remote.confusion);
  state.answers = mergeAnswers(state.answers, remote.answers);
  state.lessons = mergeLessons(state.lessons, remote.lessons);
  state.probe = mergeProbe(state.probe, remote.probe);
  if (remote.placement && remote.placement.done && !state.placement.done) state.placement = remote.placement;
  if (remote.streak && (remote.streak.lastDate || '') > (state.streak.lastDate || '')) state.streak = remote.streak;
  else if (remote.streak && remote.streak.lastDate === state.streak.lastDate) state.streak.current = Math.max(state.streak.current || 0, remote.streak.current || 0);
}

async function request(method, body) {
  let res;
  try {
    res = await fetch(SYNC_URL, { method, headers: { 'X-WCE-Key': state.settings.syncKey + SUFFIX, 'Content-Type': 'application/json' }, body });
  } catch (e) {
    throw new Error('Sync-Server nicht erreichbar (kein Netz, oder dieser Browser blockiert die Verbindung)');
  }
  if (res.status === 401) throw new Error('Sync-Schlüssel zu kurz');
  if (!res.ok) throw new Error('Sync-Server antwortet mit ' + res.status);
  return res.json();
}

export async function pull() {
  if (!syncEnabled() || busy) return false;
  busy = true;
  try {
    const r = await request('GET');
    if (r.data) { mergeRemote(r.data); saveState(); }
    state.settings.syncLast = Date.now();
    tell('Sync geholt');
    return true;
  } catch (e) {
    tell('Sync fehlgeschlagen: ' + e.message);
    return false;
  } finally { busy = false; }
}

export async function push() {
  if (!syncEnabled() || busy) return false;
  busy = true;
  try {
    const { settings, ...rest } = state;
    await request('PUT', JSON.stringify(rest));
    state.settings.syncLast = Date.now();
    tell('Sync gespeichert');
    return true;
  } catch (e) {
    tell('Sync fehlgeschlagen: ' + e.message);
    return false;
  } finally { busy = false; }
}

export function schedulePush() {
  if (!syncEnabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 4000);
}

/** Beim Start: holen, danach bei jeder Änderung verzögert schicken. */
export async function initSync() {
  onChange(() => schedulePush());
  if (syncEnabled()) await pull();
}
