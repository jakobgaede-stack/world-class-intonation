// Wiedergabe: Stimmen zeitgenau starten (gleichzeitig oder nacheinander), halten oder nach fester Dauer beenden.
import { getCtx, getMaster, unlockAudio } from './context.js';
import { startVoice } from './synth.js';
import { freqOf } from '../theory/tuning.js';

const active = new Set();
const LEAD = 0.07; // Vorlauf in Sekunden, damit alle Stimmen exakt zum selben Zeitpunkt beginnen

export async function ensureAudio() {
  return unlockAudio();
}

export function stopAll() {
  for (const h of [...active]) h.stop();
}

/**
 * Stimmen abspielen.
 * voices: [{ inst, midi, cents (Abstand zur gleichstufigen Lage), pan, gainDb, delay (s) }]
 * opts: { a4, duration (s ab dem letzten Einsatz; null = halten bis stop()), offset (s Verzögerung des Ganzen) }
 * Rückgabe: { stop(), setCents(i, cents), ended (Promise), lastOnset (Kontextzeit), msToOnset() }
 */
export function play(voices, { a4 = 443, duration = null, offset = 0 } = {}) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + LEAD + offset;
  const dest = getMaster();
  const delays = voices.map((v) => v.delay || 0);
  const lastOnset = t0 + Math.max(0, ...delays);
  const vs = voices.map((v, i) => startVoice(ctx, dest, { inst: v.inst, midi: v.midi, freq: freqOf(v.midi, v.cents || 0, a4), pan: v.pan || 0, gainDb: v.gainDb || 0 }, t0 + delays[i]));
  let done = false;
  let timer = null;
  let resolveEnded;
  const ended = new Promise((r) => { resolveEnded = r; });
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    active.delete(handle);
    resolveEnded();
  };
  const handle = {
    t0,
    lastOnset,
    ended,
    /** Millisekunden bis zum letzten Einsatz (für die Antwortuhr) */
    msToOnset() { return Math.max(0, (lastOnset - ctx.currentTime) * 1000); },
    setCents(i, cents) { if (vs[i]) vs[i].setCents(cents - (voices[i].cents || 0)); },
    stop() {
      for (const v of vs) v.stop();
      finish();
    },
  };
  if (duration) {
    const tEnd = lastOnset + duration;
    for (const v of vs) v.stop(tEnd);
    timer = setTimeout(finish, Math.max(0, (tEnd - ctx.currentTime) * 1000) + 350);
  }
  active.add(handle);
  return handle;
}

/**
 * Erst den Vergleichsklang, nach kurzer Pause den Aufgabenklang.
 * Rückgabe wie play(); lastOnset und msToOnset() beziehen sich auf den Aufgabenklang.
 */
export function playRefThenTest(refVoices, testVoices, { a4 = 443, refDuration = 2.2, gap = 0.6, duration = null } = {}) {
  const ref = play(refVoices, { a4, duration: refDuration });
  const maxDelay = Math.max(0, ...refVoices.map((v) => v.delay || 0));
  const test = play(testVoices, { a4, duration, offset: maxDelay + refDuration + gap });
  return {
    t0: ref.t0,
    lastOnset: test.lastOnset,
    ended: test.ended,
    msToOnset: () => test.msToOnset(),
    setCents: (i, c) => test.setCents(i, c),
    stop() { ref.stop(); test.stop(); },
  };
}
