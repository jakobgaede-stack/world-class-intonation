// AudioContext und Master-Kette. Der Begrenzer greift nur als Schutz ein; die Stimmen sind so gepegelt, dass er im Normalfall ruht
// (ein arbeitender Kompressor würde Schwebungen einebnen).
let ctx = null;
let master = null;
let limiter = null;

export const MASTER_LIMITER = { threshold: -2, knee: 4, ratio: 4, attack: 0.005, release: 0.15 };

/** Master-Kette in einem beliebigen Kontext aufbauen (auch OfflineAudioContext für Messungen). Rückgabe: Eingangsknoten. */
export function buildMaster(c, volume = 0.8) {
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = MASTER_LIMITER.threshold;
  lim.knee.value = MASTER_LIMITER.knee;
  lim.ratio.value = MASTER_LIMITER.ratio;
  lim.attack.value = MASTER_LIMITER.attack;
  lim.release.value = MASTER_LIMITER.release;
  const out = c.createGain();
  out.gain.value = volume;
  lim.connect(out);
  out.connect(c.destination);
  return { input: lim, out };
}

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const chain = buildMaster(ctx);
    limiter = chain.input;
    master = chain.out;
  }
  return ctx;
}

/** Eingang der Master-Kette */
export function getMaster() {
  getCtx();
  return limiter;
}

export async function unlockAudio() {
  const c = getCtx();
  if (c.state !== 'running') {
    try { await c.resume(); } catch (e) { /* ohne Nutzeraktion nicht möglich */ }
  }
  return c;
}

export function now() {
  return getCtx().currentTime;
}

export function setMasterVolume(v) {
  getCtx();
  master.gain.value = Math.max(0, Math.min(1, v));
}
