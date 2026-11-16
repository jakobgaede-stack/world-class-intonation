// Probenwert: kleinste Abweichung, bei der Ton und Richtung ohne Hilfen in drei Sekunden zu rund 80 % richtig genannt werden.
// Gemessen mit einem gewichteten Auf-Ab-Verfahren: nach einem Treffer wird es etwas feiner, nach einem Fehlgriff viermal so stark gröber.
// Das Verfahren pendelt sich dort ein, wo vier von fünf Antworten stimmen.
import { state, saveState, todayKey } from './state.js';

export const PROBE = {
  iv: { name: 'Intervalle', exercise: 'richtung', track: 'iv' },
  tri: { name: 'Dreiklänge', exercise: 'orten', track: 'ch' },
};
const DOWN = 0.93;
const UP = Math.pow(DOWN, -4);
const MIN = 1.5;
const MAX = 50;
const START = 30;

// Darbietung im Probencheck: ohne Hilfen, wie in der Probe
export const PROBE_STAGE = { diff: 60, cents: START, ref: false, onset: 'together', sound: 2, answer: 3, width: 0.5, timbre: 'gemischt', noten: false };

function entry(cat) {
  if (!state.probe[cat]) state.probe[cat] = { level: START, n: 0, last: [], days: [] };
  return state.probe[cat];
}

export function probeLevel(cat) {
  return entry(cat).level;
}

export function setProbeLevel(cat, cents) {
  const e = entry(cat);
  e.level = Math.max(MIN, Math.min(MAX, cents));
}

/** Antwort verbuchen. counts = false bei sauberen Akkorden, die richtig als sauber erkannt wurden (sie sagen nichts über die Größe). */
export function probeUpdate(cat, correct, counts = true) {
  const e = entry(cat);
  if (counts || !correct) {
    e.last.push(Math.round(e.level * 10) / 10);
    if (e.last.length > 24) e.last.shift();
    e.level = Math.max(MIN, Math.min(MAX, e.level * (correct ? DOWN : UP)));
    e.n++;
  }
  const v = probeValue(cat);
  const tk = todayKey();
  const d = e.days[e.days.length - 1];
  if (d && d.d === tk) d.v = v;
  else e.days.push({ d: tk, v });
  if (e.days.length > 180) e.days.shift();
  saveState();
}

/** Probenwert in Cent: geometrisches Mittel der letzten Messpunkte (null, solange zu wenige vorliegen) */
export function probeValue(cat) {
  const e = entry(cat);
  if (e.last.length < 6) return null;
  const xs = e.last.slice(-16);
  const g = Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
  return Math.round(g * 10) / 10;
}

export function probeHistory(cat) {
  return entry(cat).days.filter((d) => d.v !== null);
}

export function probeCount(cat) {
  return entry(cat).n;
}
