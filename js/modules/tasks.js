// Aufgaben erzeugen und auswerten: Stimmen, Richtung, Orten.
// Vorzeichen: dev.cents > 0 heißt „zu hoch“. Der Basston liegt immer gleichstufig; die Sollstimmung bestimmt die übrigen Töne.
import { INTERVAL_BY_ID, CHORD_BY_ID, targetOffset, fmtNum } from '../theory/tuning.js';
import { INSTRUMENTS } from '../theory/instruments.js';
import { spell, spellAbove, rootTable, noteName, pitchClassName } from '../theory/names.js';
import { panFor } from '../audio/space.js';
import { state } from '../engine/state.js';
import { SKILL_BY_ID } from '../engine/skills.js';
import { pickVoices, pickWeighted, minTopFor, jitterCents, rand, instNames } from './common.js';

const STAGGER = 0.8; // Abstand der Einsätze in Sekunden

// Tiefster Basston je Material (MIDI): Untergrenzen, unter denen das Intervall in der Praxis nicht mehr klar klingt.
// Terzen ab B bzw. c, Sekunde ab es, Quinte und Oktave dürfen tief liegen.
const LOW_LIMIT = { P1: 40, P8: 28, P5: 34, P4: 46, M3: 46, m3: 48, M6: 41, m6: 43, m7: 41, M2: 51, M7: 41, TT: 47, maj: 46, min: 48 };

function describeTone(task, i) {
  return `${INSTRUMENTS[task.insts[i]].name} ${noteName(task.notes[i])}`;
}

function buildCommon(skill, stageIdx, stage, opts) {
  const mat = skill.material;
  const system = opts.system || 'rein';
  const chord = CHORD_BY_ID[mat] || null;
  const iv = INTERVAL_BY_ID[mat] || null;
  const tones = chord ? chord.tones : [{ fn: 'u', name: 'unterer Ton', semis: 0, steps: 0, just: [1, 1] }, { fn: 'o', name: 'oberer Ton', semis: iv.semis, steps: iv.steps, just: iv.just }];
  const semis = tones.map((t) => t.semis);
  // Einklang: immer zwei verschiedene Instrumente, sonst sind die Stimmen nicht zu unterscheiden
  const timbre = iv && iv.id === 'P1' ? 'gemischt' : stage.timbre;
  const sizeForRegister = opts.cents || stage.cents;
  const voices = pickVoices(semis, { timbre, minBass: LOW_LIMIT[mat] || 28, minTop: stage.sound ? minTopFor(sizeForRegister) : 0, distinct: iv && iv.id === 'P1' });
  const base = chord ? spell(voices.bass, rootTable(chord.id)) : spell(voices.bass);
  const notes = tones.map((t, i) => (i === 0 ? base : spellAbove(base, voices.midis[i], t.steps)));
  const target = tones.map((t) => targetOffset(system, t.semis, t.just));
  const pans = panFor(semis, state.settings.listen, stage.width);
  let title;
  if (chord) {
    const root = pitchClassName(base);
    title = chord.id === 'min' ? `${root.charAt(0).toLowerCase()}${root.slice(1)}-Moll` : `${root}-Dur`;
  } else {
    title = iv.name.charAt(0).toUpperCase() + iv.name.slice(1);
  }
  const task = {
    skillId: skill.id, exercise: skill.exercise, material: mat, chord, iv, tones, system,
    stageIdx, stage, diff: stage.diff,
    midis: voices.midis, insts: voices.insts, notes, target, pans, title,
    dev: null,
  };
  task.sub = task.midis.map((m, i) => describeTone(task, i)).join(' · ');
  task.instLine = instNames(task.insts);
  return task;
}

/** Stimmen für die Wiedergabe: test = mit Abweichung, ref = Sollstimmung */
export function voicesOf(task, which = 'test') {
  const stagger = task.stage.onset === 'stagger';
  return task.midis.map((midi, i) => ({
    inst: task.insts[i],
    midi,
    cents: task.target[i] + (which === 'test' && task.dev && task.dev.index === i ? task.dev.cents : 0),
    pan: task.pans[i],
    delay: stagger && which === 'test' ? i * STAGGER : 0,
  }));
}

function signFor(bias) {
  if (bias && bias.sign) return Math.random() < 0.7 ? bias.sign : -bias.sign;
  return Math.random() < 0.5 ? 1 : -1;
}

function dirWord(sign) {
  return sign > 0 ? 'zu hoch' : 'zu tief';
}

// ---------------------------------------------------------------- Richtung

function genRichtung(skill, stageIdx, stage, opts) {
  const task = buildCommon(skill, stageIdx, stage, opts);
  const size = jitterCents(opts.cents || stage.cents);
  const sign = signFor(opts.bias);
  let index = 1;
  if (task.chord) {
    // Terz am häufigsten, dann Quinte, seltener der Grundton
    index = pickWeighted([{ i: 1, w: 0.5 }, { i: 2, w: 0.35 }, { i: 0, w: 0.15 }]).i;
  }
  task.dev = { index, cents: sign * size };
  const unison = task.iv && task.iv.id === 'P1';
  if (unison) {
    task.prompt = 'Zwei Instrumente im Einklang. Wer ist höher?';
    task.options = [
      { key: 'v0', label: INSTRUMENTS[task.insts[0]].name, sub: task.pans[0] < 0 ? 'links' : '' },
      { key: 'v1', label: INSTRUMENTS[task.insts[1]].name, sub: task.pans[1] > 0 ? 'rechts' : '' },
    ];
    task.truthKey = sign > 0 ? 'v1' : 'v0';
  } else {
    const who = task.chord ? (index === 0 ? 'Der Grundton' : `Die ${task.tones[index].name}`) : 'Der obere Ton';
    task.namedIndex = index;
    task.prompt = `${who} (${INSTRUMENTS[task.insts[index]].name}) weicht ab: zu hoch oder zu tief?`;
    task.options = [{ key: 'tief', label: 'zu tief', sub: '↓' }, { key: 'hoch', label: 'zu hoch', sub: '↑' }];
    task.truthKey = sign > 0 ? 'hoch' : 'tief';
  }
  task.evaluate = (answerKey) => {
    const correct = answerKey === task.truthKey;
    const c = fmtNum(Math.abs(task.dev.cents), Math.abs(task.dev.cents) < 10 ? 1 : 0);
    let truthLabel;
    if (unison) {
      const hi = sign > 0 ? 1 : 0;
      truthLabel = `${INSTRUMENTS[task.insts[hi]].name} war ${c} Cent höher als ${INSTRUMENTS[task.insts[1 - hi]].name}.`;
    } else {
      const name = task.chord ? (index === 0 ? 'Der Grundton' : `Die ${task.tones[index].name}`) : 'Der obere Ton';
      truthLabel = `${name} war ${c} Cent ${dirWord(sign)}.`;
    }
    return { score: correct ? 1 : 0, correct, truthKey: task.truthKey, answerKey: answerKey || 'keine', truthLabel };
  };
  return task;
}

// ---------------------------------------------------------------- Orten

const CLEAN_SHARE = 1 / 6;

function genOrten(skill, stageIdx, stage, opts) {
  const task = buildCommon(skill, stageIdx, stage, opts);
  const size = jitterCents(opts.cents || stage.cents);
  const clean = opts.clean !== undefined ? opts.clean : Math.random() < CLEAN_SHARE;
  let index = null;
  let sign = 0;
  if (!clean) {
    const w = { 0: 0.2, 1: 0.45, 2: 0.35 };
    if (opts.bias && opts.bias.tone !== undefined) w[opts.bias.tone] += 0.6;
    index = pickWeighted([0, 1, 2].map((i) => ({ i, w: w[i] }))).i;
    sign = signFor(opts.bias);
    task.dev = { index, cents: sign * size };
  }
  task.prompt = 'Welcher Akkordton weicht ab, und wohin?';
  task.truthKey = clean ? 'stimmt' : `${task.tones[index].fn}:${sign > 0 ? 'hoch' : 'tief'}`;
  task.clean = clean;
  const labelOf = (key) => {
    if (key === 'stimmt') return 'stimmt';
    if (!key || key === 'keine') return 'keine Antwort';
    const [fn, dir] = key.split(':');
    const tone = task.tones.find((t) => t.fn === fn);
    return `${tone.name} ${dir === 'hoch' ? 'zu hoch' : 'zu tief'}`;
  };
  task.labelOf = labelOf;
  task.evaluate = (answerKey) => {
    const correct = answerKey === task.truthKey;
    let score = correct ? 1 : 0;
    let partial = false;
    if (!correct && !clean && answerKey && answerKey.includes(':') && answerKey.split(':')[0] === task.tones[index].fn) {
      score = 0.5;
      partial = true;
    }
    let truthLabel;
    if (clean) truthLabel = 'Der Akkord war sauber.';
    else {
      const c = fmtNum(size, size < 10 ? 1 : 0);
      const name = index === 0 ? 'Der Grundton' : `Die ${task.tones[index].name}`;
      truthLabel = `${name} (${INSTRUMENTS[task.insts[index]].name}) war ${c} Cent ${dirWord(sign)}.`;
    }
    return { score, correct, partial, truthKey: task.truthKey, answerKey: answerKey || 'keine', truthLabel, answerLabel: labelOf(answerKey) };
  };
  return task;
}

// ---------------------------------------------------------------- Stimmen

function genStimmen(skill, stageIdx, stage, opts) {
  const task = buildCommon(skill, stageIdx, stage, opts);
  const index = task.chord ? (Math.random() < 0.6 ? 1 : 2) : 1;
  const start = (Math.random() < 0.5 ? 1 : -1) * rand(15, 45);
  task.dev = { index, cents: start };
  task.tuneIndex = index;
  task.tol = stage.tol;
  const name = task.chord ? `die ${task.tones[index].name}` : 'den oberen Ton';
  task.prompt = `Stimme ${name} (${INSTRUMENTS[task.insts[index]].name}), bis der Klang ${task.system === 'rein' ? 'rein' : 'gleichstufig'} steht.`;
  task.truthKey = 'ziel';
  /** answer = verbleibender Abstand zum Ziel in Cent (mit Vorzeichen) */
  task.evaluate = (err) => {
    const a = Math.abs(err);
    const correct = a <= task.tol;
    const score = correct ? 1 : a <= 2 * task.tol ? 0.5 : 0;
    const where = a < 0.05 ? 'genau im Ziel' : `${fmtNum(a, 1)} Cent ${err > 0 ? 'über' : 'unter'} dem Ziel`;
    return {
      score, correct, partial: !correct && score > 0, truthKey: 'ziel', answerKey: correct ? 'ziel' : err > 0 ? 'hoch' : 'tief',
      truthLabel: `Du bist ${where}. Ziel dieser Stufe: ±${fmtNum(task.tol, task.tol % 1 ? 1 : 0)} Cent.`,
    };
  };
  return task;
}

const GEN = { richtung: genRichtung, orten: genOrten, stimmen: genStimmen };

/**
 * Aufgabe erzeugen.
 * opts: { system, bias: {sign, tone}, cents (überschreibt die Stufe), clean, stage (fertiges Stufenobjekt, z. B. Probencheck) }
 */
export function generateTask(skillId, stageIdx, opts = {}) {
  const skill = SKILL_BY_ID[skillId];
  const stage = opts.stage || skill.stages[stageIdx];
  return GEN[skill.exercise](skill, stageIdx, stage, opts);
}
