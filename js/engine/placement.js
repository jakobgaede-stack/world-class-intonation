// Einstufung: drei kurze Messungen legen das Startniveau fest.
// Richtung und Orten werden mit einem Auf-Ab-Verfahren unter Zeitdruck gemessen, Stimmen über den erreichten Abstand zum Ziel.
import { state, saveState, todayKey } from './state.js';
import { SKILLS, RICHTUNG_STAGES, ORTEN_STAGES, STIMMEN_STAGES, stageForCents } from './skills.js';
import { seedRating, TARGET_OFFSET, START_RATING } from './rating.js';
import { setProbeLevel } from './probe.js';

export const PLACEMENT_PARTS = [
  { id: 'richtung', name: 'Richtung', trials: 14, start: 30, skills: ['richtung.P8', 'richtung.P5', 'richtung.P4', 'richtung.M3', 'richtung.m3'], stage: { diff: 50, cents: 30, ref: false, onset: 'together', sound: 2, answer: 4, width: 0.8, timbre: 'gemischt', noten: true }, intro: 'Ein Intervall klingt zwei Sekunden. Sag, ob der obere Ton zu hoch oder zu tief ist. Du hast vier Sekunden.' },
  { id: 'orten', name: 'Orten', trials: 14, start: 30, skills: ['orten.maj'], stage: { diff: 50, cents: 30, ref: false, onset: 'together', sound: 3, answer: 5, width: 0.8, timbre: 'gemischt', noten: true }, intro: 'Ein Dur-Dreiklang klingt drei Sekunden. Nenne den abweichenden Akkordton und die Richtung, oder „stimmt“. Du hast fünf Sekunden.' },
  { id: 'stimmen', name: 'Stimmen', trials: 4, skills: ['stimmen.P5', 'stimmen.M3', 'stimmen.maj', 'stimmen.m3'], intro: 'Vier Klänge zum Stimmen mit Regler und Tasten, ohne Zeitdruck. So genau du kannst.' },
];

/** Auf-Ab-Verfahren für die Einstufung: erst große Schritte bis zum ersten Fehlgriff, dann fein. */
export class Staircase {
  constructor(start) {
    this.level = start;
    this.coarse = true;
    this.levels = [];
  }

  next() {
    return this.level;
  }

  record(correct) {
    this.levels.push(this.level);
    if (this.coarse) {
      if (correct) this.level *= 0.72;
      else { this.coarse = false; this.level *= 1.5; }
    } else {
      this.level *= correct ? 0.88 : Math.pow(0.88, -4);
    }
    this.level = Math.max(2, Math.min(50, this.level));
  }

  /** Schwelle: geometrisches Mittel der letzten sechs Messpunkte */
  threshold() {
    const xs = this.levels.slice(-6);
    if (!xs.length) return this.level;
    return Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
  }
}

function ratingFromCents(stages, cents) {
  const idx = stageForCents(stages, cents);
  return stages[idx].diff + TARGET_OFFSET;
}

/**
 * Ergebnisse übernehmen.
 * results: { richtung: Schwelle in Cent, orten: Schwelle in Cent, stimmen: mittlerer Abstand in Cent } (fehlende Teile bleiben beim Startniveau)
 */
export function applyPlacement(results) {
  if (results.richtung) {
    const base = ratingFromCents(RICHTUNG_STAGES, results.richtung);
    for (const s of SKILLS.filter((x) => x.exercise === 'richtung')) {
      // spätere Intervalle der Reihe etwas vorsichtiger ansetzen; Akkorde leicht darunter
      const r = s.track === 'iv' ? base - 2.5 * Math.max(0, s.index - 1) : base - 6 - 4 * s.index;
      seedRating(s.id, Math.max(START_RATING - 4, r));
    }
    setProbeLevel('iv', results.richtung);
  }
  if (results.orten) {
    const base = ratingFromCents(ORTEN_STAGES, results.orten);
    for (const s of SKILLS.filter((x) => x.exercise === 'orten')) seedRating(s.id, Math.max(START_RATING - 4, base - 5 * s.index));
    setProbeLevel('tri', results.orten);
  }
  if (results.stimmen !== undefined && results.stimmen !== null) {
    // Stufe, deren Ziel der erreichte Abstand gerade noch erfüllt
    let idx = 0;
    STIMMEN_STAGES.forEach((st, i) => { if (results.stimmen <= st.tol) idx = i; });
    const base = STIMMEN_STAGES[idx].diff + TARGET_OFFSET;
    for (const s of SKILLS.filter((x) => x.exercise === 'stimmen')) {
      const r = s.track === 'iv' ? base - 2.5 * Math.max(0, s.index - 1) : base - 5 - 4 * s.index;
      seedRating(s.id, Math.max(START_RATING - 4, r));
    }
  }
  state.placement = { done: true, date: todayKey(), results };
  saveState();
}

export function skipPlacement() {
  state.placement = { done: true, date: todayKey(), results: null, skipped: true };
  saveState();
}
