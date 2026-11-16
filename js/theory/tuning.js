// Stimmungsrechnung: Intervalle und Akkorde als Frequenzverhältnisse, Cent-Abstände zur gleichstufigen Stimmung.

/** Cent eines Frequenzverhältnisses */
export function cents(ratio) {
  return 1200 * Math.log2(ratio);
}

/** Gleichstufige Frequenz eines MIDI-Tons beim Stimmton a4 (Hz für a′ = MIDI 69) */
export function etFreq(midi, a4 = 443) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Frequenz eines Tons mit Cent-Abstand zur gleichstufigen Lage */
export function freqOf(midi, offsetCents, a4 = 443) {
  return etFreq(midi, a4) * Math.pow(2, offsetCents / 1200);
}

// Reihenfolge = Lernreihenfolge (Jakobs Vorgabe, mit dem Einklang davor).
export const INTERVALS = [
  { id: 'P1', semis: 0, steps: 0, name: 'Einklang', just: [1, 1], pyth: [1, 1] },
  { id: 'P8', semis: 12, steps: 7, name: 'Oktave', just: [2, 1], pyth: [2, 1] },
  { id: 'P5', semis: 7, steps: 4, name: 'Quinte', just: [3, 2], pyth: [3, 2] },
  { id: 'P4', semis: 5, steps: 3, name: 'Quarte', just: [4, 3], pyth: [4, 3] },
  { id: 'M3', semis: 4, steps: 2, name: 'große Terz', just: [5, 4], pyth: [81, 64] },
  { id: 'm3', semis: 3, steps: 2, name: 'kleine Terz', just: [6, 5], pyth: [32, 27] },
  { id: 'M6', semis: 9, steps: 5, name: 'große Sexte', just: [5, 3], pyth: [27, 16] },
  { id: 'm6', semis: 8, steps: 5, name: 'kleine Sexte', just: [8, 5], pyth: [128, 81] },
  { id: 'm7', semis: 10, steps: 6, name: 'kleine Septime', just: [9, 5], pyth: [16, 9] },
  { id: 'M2', semis: 2, steps: 1, name: 'große Sekunde', just: [9, 8], pyth: [9, 8] },
  { id: 'M7', semis: 11, steps: 6, name: 'große Septime', just: [15, 8], pyth: [243, 128] },
  { id: 'TT', semis: 6, steps: 3, name: 'Tritonus', just: [45, 32], pyth: [729, 512] },
];
export const INTERVAL_BY_ID = Object.fromEntries(INTERVALS.map((i) => [i.id, i]));

// Akkorde in Grundstellung, Töne von unten nach oben. fn = Akkordfunktion.
export const CHORDS = [
  {
    id: 'maj', name: 'Dur-Dreiklang', short: 'Dur',
    tones: [
      { fn: '1', name: 'Grundton', semis: 0, steps: 0, just: [1, 1] },
      { fn: '3', name: 'Terz', semis: 4, steps: 2, just: [5, 4] },
      { fn: '5', name: 'Quinte', semis: 7, steps: 4, just: [3, 2] },
    ],
  },
  {
    id: 'min', name: 'Moll-Dreiklang', short: 'Moll',
    tones: [
      { fn: '1', name: 'Grundton', semis: 0, steps: 0, just: [1, 1] },
      { fn: '3', name: 'Terz', semis: 3, steps: 2, just: [6, 5] },
      { fn: '5', name: 'Quinte', semis: 7, steps: 4, just: [3, 2] },
    ],
  },
];
export const CHORD_BY_ID = Object.fromEntries(CHORDS.map((c) => [c.id, c]));

export const SYSTEMS = { rein: 'rein', gleich: 'gleichstufig' };

/** Cent-Abstand eines Tons zur gleichstufigen Lage in der gewählten Sollstimmung. Der Basston liegt immer gleichstufig. */
export function targetOffset(system, semis, just) {
  if (system === 'gleich') return 0;
  return cents(just[0] / just[1]) - 100 * semis;
}

/** Abstand rein gegen gleichstufig (Cent), z. B. große Terz: -13,7 */
export function justVsEt(iv) {
  return cents(iv.just[0] / iv.just[1]) - 100 * iv.semis;
}

/**
 * Schwebungsfrequenz zweier Töne an ihrem ersten gemeinsamen Teilton.
 * ratio = [p, q] des reinen Intervalls (f2 : f1 = p : q): der q-te Teilton des oberen trifft den p-ten des unteren.
 */
export function beatRate(f1, f2, ratio) {
  const [p, q] = ratio;
  return Math.abs(q * f2 - p * f1);
}

/** Zahl mit Komma und Vorzeichen für die Anzeige */
export function fmtCents(v, digits = 0) {
  const r = Math.abs(v) < 0.05 && digits > 0 ? 0 : v;
  const s = Math.abs(r).toFixed(digits).replace('.', ',');
  return (r > 0 ? '+' : r < 0 ? '−' : '') + s;
}

export function fmtNum(v, digits = 1) {
  return v.toFixed(digits).replace('.', ',');
}
