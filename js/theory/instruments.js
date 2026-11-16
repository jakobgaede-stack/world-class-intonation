// Instrumente: Namen, klingende Tonumfänge (bequemer Bereich), Klangfarbe (Teiltonspektrum) und Einschwingverhalten.
import { SPECTRA } from '../audio/spectra.js';

// range = klingender Umfang in MIDI, in dem das Instrument in der Praxis sicher intoniert gespielt wird.
// spec.kind: 'measured' = an Aufnahmen gemessen · 'derived' = aus einem verwandten Instrument abgeleitet · 'model' = Schätzmodell
export const INSTRUMENTS = {
  flute: { name: 'Flöte', short: 'Fl', family: 'holz', range: [60, 84], spec: { kind: 'measured', key: 'flute' }, attack: 0.07, release: 0.12, noise: -30 },
  oboe: { name: 'Oboe', short: 'Ob', family: 'holz', range: [58, 81], spec: { kind: 'measured', key: 'oboe' }, attack: 0.04, release: 0.09 },
  clarinet: { name: 'Klarinette', short: 'Kl', family: 'holz', range: [50, 79], spec: { kind: 'measured', key: 'clarinet' }, attack: 0.05, release: 0.1 },
  bassoon: { name: 'Fagott', short: 'Fg', family: 'holz', range: [34, 69], spec: { kind: 'measured', key: 'bassoon' }, attack: 0.05, release: 0.1 },
  altsax: { name: 'Altsaxophon', short: 'ASx', family: 'holz', range: [49, 77], spec: { kind: 'model', fc: 700, tilt: 9, bumps: [[1100, 5, 0.7], [2600, 3, 0.6]], h1: -2 }, attack: 0.05, release: 0.1 },
  tenorsax: { name: 'Tenorsaxophon', short: 'TSx', family: 'holz', range: [44, 72], spec: { kind: 'model', fc: 500, tilt: 9, bumps: [[800, 5, 0.7], [2000, 3, 0.6]], h1: -2 }, attack: 0.05, release: 0.1 },
  barisax: { name: 'Baritonsaxophon', short: 'BSx', family: 'holz', range: [37, 65], spec: { kind: 'model', fc: 350, tilt: 9, bumps: [[550, 5, 0.7], [1500, 3, 0.6]], h1: -3 }, attack: 0.06, release: 0.11 },
  horn: { name: 'Horn', short: 'Hn', family: 'blech', range: [41, 72], spec: { kind: 'measured', key: 'horn' }, attack: 0.07, release: 0.13, bloom: 0.12 },
  trumpet: { name: 'Trompete', short: 'Tp', family: 'blech', range: [52, 79], spec: { kind: 'measured', key: 'trumpet' }, attack: 0.05, release: 0.11, bloom: 0.09 },
  fluegelhorn: { name: 'Flügelhorn', short: 'Flg', family: 'blech', range: [52, 77], spec: { kind: 'derived', from: 'trumpet', tiltFrom: 700, tilt: -3.5 }, attack: 0.06, release: 0.12, bloom: 0.1 },
  tenorhorn: { name: 'Tenorhorn', short: 'Th', family: 'blech', range: [43, 70], spec: { kind: 'derived', from: 'trombone', tiltFrom: 500, tilt: -2.5 }, attack: 0.06, release: 0.12, bloom: 0.1 },
  trombone: { name: 'Posaune', short: 'Pos', family: 'blech', range: [40, 69], spec: { kind: 'measured', key: 'trombone' }, attack: 0.06, release: 0.12, bloom: 0.1 },
  euphonium: { name: 'Euphonium', short: 'Euph', family: 'blech', range: [40, 67], spec: { kind: 'derived', from: 'trombone', tiltFrom: 400, tilt: -4 }, attack: 0.07, release: 0.13, bloom: 0.1 },
  tuba: { name: 'Tuba', short: 'Tb', family: 'blech', range: [28, 58], spec: { kind: 'measured', key: 'tuba' }, attack: 0.08, release: 0.14, bloom: 0.12 },
  violin: { name: 'Violine', short: 'Vl', family: 'streicher', range: [55, 84], spec: { kind: 'measured', key: 'violin' }, attack: 0.11, release: 0.16, noise: -36 },
  viola: { name: 'Bratsche', short: 'Va', family: 'streicher', range: [48, 77], spec: { kind: 'measured', key: 'viola' }, attack: 0.11, release: 0.16, noise: -36 },
  cello: { name: 'Violoncello', short: 'Vc', family: 'streicher', range: [36, 72], spec: { kind: 'measured', key: 'cello' }, attack: 0.12, release: 0.17, noise: -36 },
  contrabass: { name: 'Kontrabass', short: 'Kb', family: 'streicher', range: [28, 55], spec: { kind: 'measured', key: 'contrabass' }, attack: 0.13, release: 0.18, noise: -36 },
};

export const ENSEMBLES = {
  blas: { name: 'Blasorchester', ids: ['flute', 'clarinet', 'altsax', 'tenorsax', 'barisax', 'fluegelhorn', 'trumpet', 'horn', 'tenorhorn', 'trombone', 'euphonium', 'tuba'] },
  sinfonie: { name: 'Sinfonieorchester', ids: ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba', 'violin', 'viola', 'cello', 'contrabass'] },
  beides: { name: 'Beides gemischt', ids: Object.keys(INSTRUMENTS) },
};

export function instrumentPool(ensembleId) {
  return (ENSEMBLES[ensembleId] || ENSEMBLES.beides).ids;
}

/** Wie bequem liegt der Ton im Umfang? 0 = außerhalb, sonst 0,12 (Rand) bis 1,12 (Mitte). */
export function comfort(id, midi) {
  const [lo, hi] = INSTRUMENTS[id].range;
  if (midi < lo || midi > hi) return 0;
  const x = hi === lo ? 0.5 : (midi - lo) / (hi - lo);
  return 0.12 + (1 - Math.pow(Math.abs(2 * x - 1), 1.6));
}

function measuredDb(key, midi) {
  const table = SPECTRA[key];
  const notes = Object.keys(table).map(Number).sort((a, b) => a - b);
  let lo = notes[0];
  let hi = notes[notes.length - 1];
  if (midi <= lo) return table[lo].slice();
  if (midi >= hi) return table[hi].slice();
  for (const n of notes) {
    if (n <= midi) lo = n;
    if (n >= midi) { hi = n; break; }
  }
  if (lo === hi) return table[lo].slice();
  const w = (midi - lo) / (hi - lo);
  const a = table[lo];
  const b = table[hi];
  const len = Math.max(a.length, b.length);
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const x = i < a.length ? a[i] : -70;
    const y = i < b.length ? b[i] : -70;
    out[i] = x + (y - x) * w;
  }
  return out;
}

/** Teiltonpegel in dB (relativ, stärkster = 0) für Instrument und Ton; f0 = Grundfrequenz in Hz. */
export function spectrumDb(id, midi, f0) {
  const spec = INSTRUMENTS[id].spec;
  let db;
  if (spec.kind === 'measured') {
    db = measuredDb(spec.key, midi);
  } else if (spec.kind === 'derived') {
    db = measuredDb(spec.from, midi).map((v, i) => {
      const f = (i + 1) * f0;
      return f > spec.tiltFrom ? v + spec.tilt * Math.log2(f / spec.tiltFrom) : v;
    });
  } else {
    const count = Math.max(4, Math.min(40, Math.floor(12000 / f0)));
    db = [];
    for (let k = 1; k <= count; k++) {
      const f = k * f0;
      let v = -spec.tilt * Math.max(0, Math.log2(f / spec.fc));
      for (const [fb, gain, width] of spec.bumps) v += gain * Math.exp(-0.5 * Math.pow(Math.log2(f / fb) / width, 2));
      if (k === 1) v += spec.h1 || 0;
      db.push(v);
    }
  }
  const max = Math.max(...db);
  return db.map((v) => v - max);
}

/** A-Bewertung als linearer Faktor (für annähernd gleiche Lautheit aller Stimmen) */
export function aWeight(f) {
  const f2 = f * f;
  const ra = (148693636 * f2 * f2) / ((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148693636));
  return ra * 1.2589;
}
