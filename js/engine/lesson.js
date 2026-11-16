// Lektion: aus dem Zeitbudget entsteht eine feste Abfolge von Abschnitten.
import { SKILLS, EXERCISES, isOpen, openSkills } from './skills.js';
import { ratingOf, recentAccuracy, overdueDays, topConfusions } from './rating.js';
import { state, saveState, todayKey } from './state.js';

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 90;

function avgRating(exercise) {
  const open = openSkills(exercise);
  if (!open.length) return 100;
  return open.reduce((a, s) => a + ratingOf(s.id), 0) / open.length;
}

/** Welcher Schwerpunkt zuerst? Der mit dem niedrigeren Niveau; bei Gleichstand wechselt es täglich. */
function focusOrder() {
  const a = avgRating('orten');
  const b = avgRating('richtung');
  if (Math.abs(a - b) < 4) return new Date().getDate() % 2 === 0 ? ['orten', 'richtung'] : ['richtung', 'orten'];
  return a < b ? ['orten', 'richtung'] : ['richtung', 'orten'];
}

/** Schwächstes Thema der letzten Zeit: niedrigste Trefferquote unter den Themen mit genug Antworten */
export function weakestSkill() {
  let best = null;
  for (const s of SKILLS) {
    if (s.exercise === 'stimmen' || !isOpen(s)) continue;
    const st = state.skills[s.id];
    if (!st || st.history.length < 5) continue;
    const acc = recentAccuracy(s.id, 20);
    if (best === null || acc < best.acc) best = { skill: s, acc };
  }
  return best;
}

/** Schwächere Richtung eines Themas aus dem Antwortprotokoll: +1 (zu hoch wird öfter verfehlt), -1 oder 0 */
export function weakerSign(filter) {
  const t = { 1: { n: 0, ok: 0 }, '-1': { n: 0, ok: 0 } };
  for (const a of state.answers.slice(-1500)) {
    if (!a.meta || !a.meta.sign || !filter(a)) continue;
    const e = t[String(a.meta.sign)];
    e.n++;
    if (a.score >= 0.99) e.ok++;
  }
  if (t['1'].n < 6 || t['-1'].n < 6) return 0;
  const up = t['1'].ok / t['1'].n;
  const down = t['-1'].ok / t['-1'].n;
  if (Math.abs(up - down) < 0.1) return 0;
  return up < down ? 1 : -1;
}

/**
 * Lektionsplan. Rückgabe: { date, minutes, blocks: [{kind, label, seconds, exercise?, why}] }
 * kind: 'ex' (Übung mit Niveau), 'compare' (Hörvergleich), 'probe' (Probencheck)
 */
export function planLesson(minutes) {
  const M = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
  // ?tempo=N verkürzt die Abschnitte für die automatischen Tests
  const tempo = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('tempo')) || 1 : 1;
  const sec = (share) => (tempo > 1 ? Math.max(4, Math.round((M * 60 * share) / tempo)) : Math.max(45, Math.round(M * 60 * share)));
  const [f1, f2] = focusOrder();
  const blocks = [];
  if (M < 10) {
    // kurze Lektion: Schwerpunkt 2 und Schwächen entfallen, die übrigen Anteile wachsen entsprechend
    blocks.push({ kind: 'ex', label: 'Einhören', exercise: 'stimmen', seconds: sec(0.15), mode: 'easy', why: 'Stimmen mit Regler: das reine Klangbild ins Ohr holen.' });
    blocks.push({ kind: 'ex', label: 'Schwerpunkt', exercise: f1, seconds: sec(0.47), mode: 'normal', why: EXERCISES[f1].about });
    blocks.push({ kind: 'compare', label: 'Hörvergleich', seconds: sec(0.23), why: 'Rein, gleichstufig, zu weit, zu eng im direkten Wechsel. Ohne Wertung.' });
    blocks.push({ kind: 'probe', label: 'Probencheck', seconds: sec(0.15), why: 'Ohne Hilfen, 2 Sekunden Klang, 3 Sekunden Antwort. Ergibt deinen Probenwert.' });
  } else {
    blocks.push({ kind: 'ex', label: 'Einhören', exercise: 'stimmen', seconds: sec(0.1), mode: 'easy', why: 'Stimmen mit Regler: das reine Klangbild ins Ohr holen.' });
    blocks.push({ kind: 'ex', label: 'Schwerpunkt 1', exercise: f1, seconds: sec(0.3), mode: 'normal', why: EXERCISES[f1].about });
    blocks.push({ kind: 'compare', label: 'Hörvergleich', seconds: sec(0.15), why: 'Rein, gleichstufig, zu weit, zu eng im direkten Wechsel. Ohne Wertung.' });
    blocks.push({ kind: 'ex', label: 'Schwerpunkt 2', exercise: f2, seconds: sec(0.2), mode: 'normal', why: EXERCISES[f2].about });
    blocks.push({ kind: 'weak', label: 'Schwächen', seconds: sec(0.15), why: 'Gezielt das Thema und die Richtung, die dir zuletzt am schwersten fielen.' });
    blocks.push({ kind: 'probe', label: 'Probencheck', seconds: sec(0.1), why: 'Ohne Hilfen, 2 Sekunden Klang, 3 Sekunden Antwort. Ergibt deinen Probenwert.' });
  }
  return { date: todayKey(), createdAt: Date.now(), minutes: M, blocks, progress: 0, done: false, results: [] };
}

export function saveLesson(plan) {
  const idx = state.lessons.findIndex((l) => l.createdAt === plan.createdAt);
  if (idx >= 0) state.lessons[idx] = plan;
  else state.lessons.push(plan);
  if (state.lessons.length > 200) state.lessons.splice(0, state.lessons.length - 200);
  saveState();
}

/** Angefangene Lektion von heute (noch nicht fertig) */
export function openLesson() {
  return state.lessons.find((l) => l.date === todayKey() && !l.done && l.progress > 0 && l.progress < l.blocks.length) || null;
}

export function lessonsDoneToday() {
  return state.lessons.filter((l) => l.date === todayKey() && l.done).length;
}

export function blockMinutes(b) {
  const m = b.seconds / 60;
  return m < 1 ? '1' : String(Math.round(m));
}

export { overdueDays, topConfusions };
