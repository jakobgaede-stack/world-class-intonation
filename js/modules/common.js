// Gemeinsame Bausteine der Übungen: DOM-Helfer, Zufall, Wahl von Lage und Instrumenten.
import { INSTRUMENTS, comfort, instrumentPool } from '../theory/instruments.js';
import { state } from '../engine/state.js';

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

export function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Gewichtete Zufallswahl: items = [{w, ...}] */
export function pickWeighted(items) {
  const total = items.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

/** Tiefste erlaubte Oberstimme: kleine Abweichungen brauchen genug Höhe, damit sie in kurzer Zeit hörbar sind. */
export function minTopFor(cents) {
  if (cents >= 25) return 0;
  if (cents >= 15) return 52;
  if (cents >= 8) return 57;
  return 62;
}

/**
 * Lage und Instrumente für einen Klang wählen.
 * semis: Abstände zum Basston, z. B. [0, 4, 7]. timbre: 'gleich' (ein Instrument für alle Stimmen) oder 'gemischt'.
 * Zuerst wird die Lage so gewählt, dass jede Stimme bequem in einem Instrument liegt, dann die Instrumente.
 * minBass: tiefster erlaubter Basston (enge Intervalle klingen in der Tiefe unklar). minTop: tiefste erlaubte Oberstimme.
 * Rückgabe: { bass, midis, insts }
 */
export function pickVoices(semis, { timbre = 'gemischt', minTop = 0, minBass = 28, pool = null, distinct = false } = {}) {
  const ids = (pool || instrumentPool(state.settings.ensemble)).filter((id) => INSTRUMENTS[id]);
  const top = Math.max(...semis);
  const attempt = (kind) => {
    const cands = [];
    for (let b = Math.max(28, minBass); b <= 84; b++) {
      if (b + top > 88) break;
      if (b + top < minTop) continue;
      let w;
      if (kind === 'gleich') {
        w = 0;
        for (const id of ids) {
          let p = 1;
          for (const s of semis) p *= comfort(id, b + s);
          if (p > w) w = p;
        }
      } else {
        w = 1;
        for (const s of semis) {
          let m = 0;
          for (const id of ids) m = Math.max(m, comfort(id, b + s));
          w *= m;
        }
      }
      if (w > 0) cands.push({ b, w });
    }
    if (!cands.length) return null;
    const bass = pickWeighted(cands).b;
    const midis = semis.map((s) => bass + s);
    let insts;
    if (kind === 'gleich') {
      const opts = ids.map((id) => ({ id, w: midis.reduce((p, m) => p * comfort(id, m), 1) })).filter((o) => o.w > 0);
      const id = pickWeighted(opts).id;
      insts = midis.map(() => id);
    } else {
      insts = new Array(midis.length);
      const used = new Set();
      const center = (id) => (INSTRUMENTS[id].range[0] + INSTRUMENTS[id].range[1]) / 2;
      let above = Infinity; // Lage des Instruments der Stimme darüber
      // von oben nach unten besetzen: die Oberstimme hat die kleinste Auswahl
      for (let i = midis.length - 1; i >= 0; i--) {
        const all = ids.map((id) => ({ id, w: comfort(id, midis[i]) })).filter((o) => o.w > 0);
        const fresh = all.filter((o) => !used.has(o.id));
        // Partiturordnung: unter einem Instrument spielt kein deutlich höheres
        const ordered = fresh.filter((o) => center(o.id) <= above + 4);
        let opts = ordered.length ? ordered : fresh;
        if (!opts.length) {
          if (distinct) return null;
          opts = all;
        }
        // Gewicht quadrieren: bequeme Lagen deutlich bevorzugen
        const id = pickWeighted(opts.map((o) => ({ id: o.id, w: o.w * o.w }))).id;
        insts[i] = id;
        used.add(id);
        above = center(id);
      }
    }
    return { bass, midis, insts };
  };
  for (let i = 0; i < 12; i++) {
    const r = attempt(timbre);
    if (r) return r;
  }
  for (let i = 0; i < 12; i++) {
    const r = attempt(timbre === 'gleich' ? 'gemischt' : 'gleich');
    if (r) return r;
  }
  throw new Error('Keine spielbare Lage gefunden');
}

/** Instrumentenliste als Text, von unten nach oben: „Tuba, Horn, Trompete“ */
export function instNames(insts) {
  const names = insts.map((id) => INSTRUMENTS[id].name);
  if (new Set(names).size === 1) return names.length === 2 ? `2 × ${names[0]}` : names.length === 3 ? `3 × ${names[0]}` : names[0];
  return names.join(', ');
}

/** Abweichung der Stufe mit etwas Streuung, damit sich keine feste Größe einprägt */
export function jitterCents(c) {
  return c * rand(0.9, 1.1);
}
