// Klangerzeugung: je Stimme ein Oszillator mit dem Teiltonspektrum des Instruments (an Aufnahmen gemessen).
// Die Tonhöhe ist exakt und steht vollkommen ruhig; jede Abweichung in Cent ist gewollt und genau.
import { INSTRUMENTS, spectrumDb, aWeight } from '../theory/instruments.js';

const LEVEL = 0.085; // Pegel einer Stimme (lautheitsbewertet)
const PEAK_MAX = 0.27; // Spitzenwert einer Stimme, damit auch vier Stimmen den Begrenzer nicht erreichen
const MAX_PARTIAL_HZ = 16000;

const waveCache = new WeakMap();
const noiseCache = new WeakMap();

function nominalFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** PeriodicWave für Instrument und Ton; lautheitsnormiert, mit Schroeder-Phasen (niedriger Scheitelfaktor). */
export function getWave(ctx, inst, midi) {
  let cache = waveCache.get(ctx);
  if (!cache) { cache = new Map(); waveCache.set(ctx, cache); }
  const key = inst + ':' + midi;
  if (cache.has(key)) return cache.get(key);
  const f0 = nominalFreq(midi);
  const db = spectrumDb(inst, midi, f0);
  const amps = [];
  for (let k = 1; k <= db.length; k++) {
    if (k * f0 > MAX_PARTIAL_HZ) break;
    amps.push(Math.pow(10, db[k - 1] / 20));
  }
  if (!amps.length) amps.push(1);
  const n = amps.length;
  // Lautheit: halbe A-Bewertung (Kompromiss zwischen leisen und lauten Abhörpegeln)
  let s = 0;
  for (let k = 1; k <= n; k++) {
    const w = Math.sqrt(aWeight(k * f0));
    s += Math.pow(amps[k - 1] * w, 2);
  }
  const scale = 1 / Math.sqrt(s);
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const ph = (-Math.PI * k * (k - 1)) / n;
    real[k] = amps[k - 1] * scale * Math.cos(ph);
    imag[k] = amps[k - 1] * scale * Math.sin(ph);
  }
  let peak = 0;
  for (let i = 0; i < 512; i++) {
    const th = (2 * Math.PI * i) / 512;
    let y = 0;
    for (let k = 1; k <= n; k++) y += real[k] * Math.cos(k * th) + imag[k] * Math.sin(k * th);
    if (Math.abs(y) > peak) peak = Math.abs(y);
  }
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
  const entry = { wave, peak, partials: n };
  cache.set(key, entry);
  return entry;
}

function noiseBuffer(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/**
 * Stimme starten.
 * v: { inst, midi, freq (Hz, exakt), pan (-1..1), gainDb }
 * Rückgabe: { setCents(deltaCents, time), stop(time), level }
 */
export function startVoice(ctx, dest, v, when) {
  const def = INSTRUMENTS[v.inst];
  const { wave, peak } = getWave(ctx, v.inst, v.midi);
  const level = Math.min(LEVEL, PEAK_MAX / peak) * Math.pow(10, (v.gainDb || 0) / 20);
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = v.freq;
  const env = ctx.createGain();
  env.gain.value = 0;
  let src = osc;
  if (def.bloom) {
    // Blech: die hohen Teiltöne kommen etwas später als der Grundton
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Math.max(700, 3 * v.freq), when);
    lp.frequency.exponentialRampToValueAtTime(19000, when + def.bloom);
    osc.connect(lp);
    src = lp;
  }
  src.connect(env);
  let noise = null;
  if (def.noise) {
    // Anblas- bzw. Strichgeräusch, sehr leise; trägt keine Tonhöhe
    noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, Math.max(1500, 4 * v.freq));
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    // Faktor gleicht den Pegelverlust des Bandpasses aus: def.noise ist der Geräuschpegel in dB relativ zum Ton
    ng.gain.value = Math.pow(10, def.noise / 20) * 4.5;
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(env);
    noise.start(when, Math.random() * 1.5);
  }
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level, when + def.attack);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, v.pan || 0));
  env.connect(pan);
  pan.connect(dest);
  osc.start(when);
  let stopAt = null;
  return {
    level,
    /** Tonhöhe um deltaCents gegenüber der Startfrequenz verschieben (gleitet in wenigen Millisekunden) */
    setCents(delta, time) {
      const t = time === undefined ? ctx.currentTime : time;
      osc.detune.cancelScheduledValues(t);
      osc.detune.setTargetAtTime(delta, t, 0.012);
    },
    /** Ausklingen ab time (Standard: sofort). Ein früherer Zeitpunkt ersetzt einen bereits geplanten späteren. */
    stop(time) {
      const t = Math.max(time === undefined ? ctx.currentTime : time, when);
      if (stopAt !== null && t >= stopAt - 1e-4) return;
      stopAt = t;
      const cur = level * Math.max(0, Math.min(1, (t - when) / def.attack));
      try {
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(cur, t);
        env.gain.setTargetAtTime(0, t, def.release / 3);
      } catch (e) { /* Kontext geschlossen */ }
      const end = t + def.release * 2 + 0.05;
      try { osc.stop(end); } catch (e) {}
      if (noise) { try { noise.stop(end); } catch (e) {} }
    },
  };
}
