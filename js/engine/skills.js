// Themen: jede Verbindung aus Übung und Material hat ein eigenes Niveau. Hier stehen Material, Stufen und Freischaltung.
import { INTERVALS, CHORDS, INTERVAL_BY_ID, CHORD_BY_ID } from '../theory/tuning.js';
import { ratingOf } from './rating.js';

export const OPEN_AT = 32; // Niveau, ab dem das nächste Material einer Reihe aufgeht

// diff = Schwierigkeit der Stufe (5 bis 86). Die Zielstufe liegt bei Niveau − 12; mit Niveau 98 ist die oberste Stufe erreicht.
// Stellgrößen einer Stufe:
// cents  Abweichung · ref Vergleichsklang vorab · onset Einsätze · sound Klangdauer in s (0 = gehalten) · answer Antwortzeit in s (0 = frei)
// width  Breite des Stereobilds · timbre Klangfarben · noten Notenbild
const S = (diff, cents, ref, onset, sound, answer, width, timbre, noten = true) => ({ diff, cents, ref, onset, sound, answer, width, timbre, noten });

// Richtung: erst grob und immer schneller, dann fein. Gleiche Klangfarbe ist leichter, verschiedene schwerer.
export const RICHTUNG_STAGES = [
  S(5, 40, true, 'stagger', 0, 0, 1, 'gleich'),
  S(12, 40, false, 'stagger', 0, 0, 1, 'gleich'),
  S(20, 35, false, 'together', 0, 0, 1, 'gleich'),
  S(27, 30, false, 'together', 4, 8, 1, 'gleich'),
  S(34, 25, false, 'together', 3, 5, 1, 'gemischt'),
  S(42, 20, false, 'together', 2, 3, 0.8, 'gemischt'),
  S(49, 15, false, 'together', 2, 3, 0.8, 'gemischt'),
  S(57, 12, false, 'together', 2, 3, 0.6, 'gemischt'),
  S(64, 10, false, 'together', 2, 3, 0.6, 'gemischt'),
  S(71, 8, false, 'together', 2, 3, 0.5, 'gemischt'),
  S(79, 6, false, 'together', 2, 3, 0.4, 'gemischt'),
  S(86, 5, false, 'together', 1.5, 3, 0.35, 'gemischt'),
];

// Orten: verschiedene Klangfarben sind leichter (Stimmen lassen sich trennen), gleiche schwerer.
export const ORTEN_STAGES = [
  S(5, 40, true, 'stagger', 0, 0, 1, 'gemischt', true),
  S(12, 40, false, 'stagger', 0, 0, 1, 'gemischt', true),
  S(20, 35, false, 'together', 0, 0, 1, 'gemischt', true),
  S(27, 30, false, 'together', 5, 8, 1, 'gemischt', true),
  S(34, 25, false, 'together', 4, 6, 1, 'gemischt', true),
  S(42, 20, false, 'together', 3, 4, 0.8, 'gemischt', true),
  S(49, 15, false, 'together', 2, 3, 0.8, 'gemischt', true),
  S(57, 12, false, 'together', 2, 3, 0.6, 'gemischt', true),
  S(64, 10, false, 'together', 2, 3, 0.6, 'gleich', true),
  S(71, 8, false, 'together', 2, 3, 0.5, 'gleich', false),
  S(79, 6, false, 'together', 2, 3, 0.4, 'gleich', false),
  S(86, 5, false, 'together', 1.5, 3, 0.35, 'gleich', false),
];

// Stimmen: der Klang liegt, du korrigierst mit Regler und Tasten. tol = erlaubter Abstand zum Ziel in Cent.
const T = (diff, tol, timbre) => ({ diff, tol, cents: 30, ref: false, onset: 'together', sound: 0, answer: 0, width: 1, timbre, noten: true });
export const STIMMEN_STAGES = [T(5, 10, 'gleich'), T(14, 8, 'gleich'), T(23, 6, 'gleich'), T(32, 5, 'gleich'), T(41, 4, 'gemischt'), T(50, 3, 'gemischt'), T(59, 2.5, 'gemischt'), T(68, 2, 'gemischt'), T(77, 1.5, 'gemischt'), T(86, 1, 'gemischt')];

function num(v) {
  return String(v).replace('.', ',');
}

export function stageLabel(exercise, st) {
  if (exercise === 'stimmen') return `Ziel ±${num(st.tol)} Cent`;
  const parts = [`${st.cents} Cent`];
  if (st.ref) parts.push('reiner Klang vorab');
  if (st.onset === 'stagger') parts.push('Einsätze nacheinander');
  if (st.sound) parts.push(`${num(st.sound)} s Klang, ${num(st.answer)} s Antwort`);
  else parts.push('gehalten, freie Zeit');
  if (exercise === 'orten' && !st.noten) parts.push('ohne Noten');
  return parts.join(' · ');
}

export const EXERCISES = {
  stimmen: { id: 'stimmen', name: 'Stimmen', stages: STIMMEN_STAGES, tracks: { iv: INTERVALS.map((i) => i.id), ch: CHORDS.map((c) => c.id) }, open: { iv: 3, ch: 1 }, about: 'Den abweichenden Ton mit Regler und Tasten korrigieren, bis der Klang steht.' },
  richtung: { id: 'richtung', name: 'Richtung', stages: RICHTUNG_STAGES, tracks: { iv: INTERVALS.map((i) => i.id), ch: CHORDS.map((c) => c.id) }, open: { iv: 3, ch: 1 }, about: 'Der abweichende Ton ist benannt. Du sagst, ob er zu hoch oder zu tief ist.' },
  orten: { id: 'orten', name: 'Orten', stages: ORTEN_STAGES, tracks: { ch: CHORDS.map((c) => c.id) }, open: { ch: 1 }, about: 'Ein Dreiklang: Welcher Akkordton weicht ab, und wohin? Manchmal stimmt alles.' },
};
export const EXERCISE_ORDER = ['stimmen', 'richtung', 'orten'];

export function materialName(mat) {
  if (INTERVAL_BY_ID[mat]) {
    const n = INTERVAL_BY_ID[mat].name;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  return CHORD_BY_ID[mat].short;
}

export function isChord(mat) {
  return !!CHORD_BY_ID[mat];
}

export const SKILLS = [];
for (const exId of EXERCISE_ORDER) {
  const ex = EXERCISES[exId];
  for (const [track, mats] of Object.entries(ex.tracks)) {
    mats.forEach((mat, index) => {
      SKILLS.push({ id: `${exId}.${mat}`, exercise: exId, material: mat, track, index, name: `${ex.name} · ${materialName(mat)}`, stages: ex.stages });
    });
  }
}
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Ist das Thema freigeschaltet? Die ersten Materialien jeder Reihe sind offen, jedes weitere, sobald das vorige sicher läuft. */
export function isOpen(skill) {
  const ex = EXERCISES[skill.exercise];
  if (skill.index < ex.open[skill.track]) return true;
  const prev = SKILLS.find((s) => s.exercise === skill.exercise && s.track === skill.track && s.index === skill.index - 1);
  return isOpen(prev) && ratingOf(prev.id) >= OPEN_AT;
}

export function openSkills(exercise, track = null) {
  return SKILLS.filter((s) => s.exercise === exercise && (!track || s.track === track) && isOpen(s));
}

/** Stufe, deren Abweichung der gesuchten am nächsten liegt (für die Einstufung) */
export function stageForCents(stages, cents) {
  let best = 0;
  let bestD = Infinity;
  stages.forEach((st, i) => {
    const d = Math.abs(Math.log(st.cents / cents));
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && st.diff > stages[best].diff)) { bestD = d; best = i; }
  });
  return best;
}
