// Runner: führt Abschnitte aus (Übung mit Niveau, Schwächen, Probencheck, freies Üben) und zeigt Aufgabe, Antwort und Rückmeldung.
import { el, pickWeighted } from '../modules/common.js';
import { generateTask, voicesOf } from '../modules/tasks.js';
import { play, playRefThenTest, stopAll, ensureAudio } from '../audio/player.js';
import { state } from '../engine/state.js';
import { SKILL_BY_ID, EXERCISES, openSkills, stageLabel } from '../engine/skills.js';
import { chooseStage, recordAnswer, logAnswer, closeBlock, ratingOf, overdueDays, currentStageIndex, updateStreak } from '../engine/rating.js';
import { PROBE, PROBE_STAGE, probeLevel, probeUpdate, probeValue } from '../engine/probe.js';
import { weakestSkill, weakerSign } from '../engine/lesson.js';
import { renderStaff } from './staff.js';
import { INSTRUMENTS } from '../theory/instruments.js';
import { fmtNum } from '../theory/tuning.js';

const a4 = () => state.settings.a4 || 443;

function flat(voices) {
  return voices.map((v) => ({ ...v, delay: 0 }));
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function taskHead(body, task) {
  const st = task.stage;
  const top = el('div', { class: 'item-top' });
  top.appendChild(el('h2', { text: st.noten ? task.title : task.chord ? 'Dreiklang' : task.title }));
  top.appendChild(el('div', { class: 'hint', text: st.noten ? task.sub : task.instLine }));
  body.appendChild(top);
  if (st.noten) {
    const box = el('div', { class: 'score-box staff-box' });
    try {
      box.appendChild(renderStaff(task.notes.map((sp, i) => ({ sp, label: INSTRUMENTS[task.insts[i]].name }))));
      body.appendChild(box);
    } catch (e) { console.error(e); }
  }
  body.appendChild(el('p', { class: 'prompt', text: task.prompt }));
}

/** Rückmeldung mit Hörvergleich. Ruft onNext beim Weitergehen. */
function showFeedback(box, task, res, { onNext, autoNext = false, nextLabel = 'Weiter', finalDev = null, compare = true } = {}) {
  const cls = res.correct ? 'ok' : res.partial ? 'partial' : 'bad';
  const head = res.timeout ? 'Zeit um' : res.correct ? 'Richtig' : res.partial ? (task.exercise === 'stimmen' ? 'Fast' : 'Ton gefunden, Richtung anders') : 'Noch nicht';
  const fb = el('div', { class: 'feedback ' + cls });
  fb.appendChild(el('div', { class: 'fb-head', text: head }));
  fb.appendChild(el('div', { class: 'fb-line', text: res.truthLabel }));
  if (task.exercise === 'orten' && !res.correct && !res.timeout) fb.appendChild(el('div', { class: 'fb-line muted', text: 'Deine Antwort: ' + res.answerLabel }));
  const row = el('div', { class: 'fb-controls' });
  let cur = null;
  let autoTimer = null;
  const stopCur = () => { clearTimeout(autoTimer); if (cur) cur.stop(); cur = null; };
  const testVoices = () => {
    const vs = flat(voicesOf(task, 'test'));
    if (finalDev !== null && task.dev) vs[task.dev.index].cents = task.target[task.dev.index] + finalDev;
    return vs;
  };
  const refVoices = () => flat(voicesOf(task, 'ref'));
  if (task.exercise === 'stimmen') {
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ Deine Einstellung', onclick: () => { stopCur(); cur = play(testVoices(), { a4: a4(), duration: 3 }); } }));
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ Ziel', onclick: () => { stopCur(); cur = play(refVoices(), { a4: a4(), duration: 3 }); } }));
  } else if (task.dev) {
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ So klang es', onclick: () => { stopCur(); cur = play(testVoices(), { a4: a4(), duration: 3 }); } }));
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ Sauber', onclick: () => { stopCur(); cur = play(refVoices(), { a4: a4(), duration: 3 }); } }));
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ Im Wechsel', onclick: () => { stopCur(); cur = playRefThenTest(testVoices(), refVoices(), { a4: a4(), refDuration: 2, gap: 0.35, duration: 2.4 }); } }));
  } else {
    row.appendChild(el('button', { class: 'btn ghost', text: '▶ Nochmal hören', onclick: () => { stopCur(); cur = play(refVoices(), { a4: a4(), duration: 3 }); } }));
  }
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    stopCur();
    document.removeEventListener('keydown', onKey);
    onNext();
  };
  const next = el('button', { class: 'btn primary', text: nextLabel, onclick: go });
  row.appendChild(next);
  fb.appendChild(row);
  box.appendChild(fb);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  };
  // kurze Sperre, damit ein Tastendruck der Antwort nicht gleich weiterblättert
  setTimeout(() => { if (!gone) document.addEventListener('keydown', onKey); }, 250);
  if (autoNext && res.correct) {
    fb.appendChild(el('div', { class: 'muted small auto-next', text: 'weiter …' }));
    autoTimer = setTimeout(go, 1300);
  } else {
    try { fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    // Rückmeldung als Klang: nach einem Fehlgriff erst so, wie es klang, dann sauber
    if (!res.correct && compare && state.settings.autoCompare !== false) {
      fb.appendChild(el('div', { class: 'muted small auto-next', text: task.exercise === 'stimmen' || !task.dev ? 'Du hörst jetzt den sauberen Klang.' : 'Du hörst jetzt erst den Klang der Aufgabe, dann den sauberen.' }));
      autoTimer = setTimeout(() => {
        if (gone) return;
        if (task.exercise === 'stimmen' || !task.dev) cur = play(refVoices(), { a4: a4(), duration: 2.6 });
        else cur = playRefThenTest(testVoices(), refVoices(), { a4: a4(), refDuration: 2, gap: 0.35, duration: 2.4 });
      }, 450);
    }
  }
  return { cancel: () => { gone = true; stopCur(); document.removeEventListener('keydown', onKey); } };
}

/**
 * Aufgabe „Richtung“ oder „Orten“ darbieten.
 * cfg: { onResult(res, ms), autoNext, nextLabel, compare (Vergleich nach einem Fehlgriff von selbst spielen) }
 * Rückgabe: { promise, cancel() }
 */
function presentListening(body, task, cfg) {
  let cancel = () => {};
  const promise = new Promise((resolve) => {
    const st = task.stage;
    const timed = st.answer > 0;
    body.innerHTML = '';
    taskHead(body, task);
    const controls = el('div', { class: 'controls' });
    const status = el('span', { class: 'muted small' });
    const bar = timed ? el('div', { class: 'timebar' }, el('div', { class: 'timebar-fill' })) : null;
    const answerBox = el('div', { class: 'answer-box' });
    let handle = null;
    let answered = false;
    let t0 = null;
    let timer = null;
    let startTimer = null;
    let fbHandle = null;
    let selectedTone = null;
    const buttons = [];

    const setEnabled = (on) => { for (const b of buttons) b.disabled = !on; };

    const submit = (answer) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      clearTimeout(startTimer);
      document.removeEventListener('keydown', onKey);
      const ms = t0 ? performance.now() - t0 : null;
      if (handle) handle.stop();
      setEnabled(false);
      if (bar) bar.classList.add('done');
      let res;
      try { res = task.evaluate(answer); } catch (e) { console.error(e); res = { score: 0, correct: false, truthKey: '?', answerKey: '?', truthLabel: '' }; }
      res.timeout = answer === null;
      for (const b of buttons) {
        if (b.dataset.key === res.truthKey) b.classList.add('truth');
        if (answer && b.dataset.key === answer && !res.correct) b.classList.add('chosen');
      }
      cfg.onResult(res, ms);
      fbHandle = showFeedback(answerBox, task, res, { onNext: () => resolve(res), autoNext: cfg.autoNext && timed, nextLabel: cfg.nextLabel, compare: cfg.compare !== false });
    };

    const start = () => {
      if (answered) return;
      if (handle) handle.stop();
      clearTimeout(startTimer);
      const duration = st.sound || null;
      handle = st.ref
        ? playRefThenTest(flat(voicesOf(task, 'ref')), voicesOf(task, 'test'), { a4: a4(), duration })
        : play(voicesOf(task, 'test'), { a4: a4(), duration });
      status.textContent = st.ref ? 'Erst der reine Klang, dann die Aufgabe.' : timed ? '' : 'Klingt, bis du antwortest.';
      startTimer = setTimeout(() => {
        if (answered) return;
        if (t0 === null) t0 = performance.now();
        setEnabled(true);
        if (st.ref) status.textContent = 'Jetzt die Aufgabe.';
        if (timed && !timer) {
          const fill = bar.firstChild;
          fill.style.transition = 'none';
          fill.style.width = '100%';
          void fill.offsetWidth;
          fill.style.transition = `width ${st.answer}s linear`;
          fill.style.width = '0%';
          timer = setTimeout(() => submit(null), st.answer * 1000);
        }
      }, handle.msToOnset());
    };

    if (!timed) controls.appendChild(el('button', { class: 'btn play', text: '▶ Nochmal', onclick: start }));
    controls.appendChild(status);
    body.appendChild(controls);
    if (bar) body.appendChild(bar);

    const mk = (key, label, sub, cls = '') => {
      const b = el('button', { class: 'abtn ' + cls, type: 'button', 'data-key': key, disabled: true });
      b.appendChild(el('span', { class: 'abtn-label', text: label }));
      if (sub) b.appendChild(el('span', { class: 'abtn-sub', text: sub }));
      b.addEventListener('click', () => submit(key));
      buttons.push(b);
      return b;
    };

    if (task.exercise === 'orten') {
      const grid = el('div', { class: 'orten-grid' });
      for (const tone of [...task.tones].reverse()) {
        grid.appendChild(el('div', { class: 'orten-tone', 'data-fn': tone.fn, text: tone.name }));
        grid.appendChild(mk(`${tone.fn}:tief`, 'zu tief', '↓'));
        grid.appendChild(mk(`${tone.fn}:hoch`, 'zu hoch', '↑'));
      }
      answerBox.appendChild(grid);
      answerBox.appendChild(mk('stimmt', 'stimmt', 'alles sauber', 'wide'));
      answerBox.appendChild(el('div', { class: 'muted small keys', text: 'Tasten: 1 · 3 · 5 wählt den Ton, ↑ ↓ die Richtung, 0 = stimmt' }));
    } else {
      const grid = el('div', { class: 'agrid cols-2' });
      for (const o of task.options) grid.appendChild(mk(o.key, o.label, o.sub));
      answerBox.appendChild(grid);
      answerBox.appendChild(el('div', { class: 'muted small keys', text: task.options[0].key === 'v0' ? 'Tasten: ← →' : 'Tasten: ↓ zu tief, ↑ zu hoch' }));
    }
    body.appendChild(answerBox);

    function onKey(e) {
      if (answered || e.metaKey || e.ctrlKey || e.altKey) return;
      const enabled = buttons.length && !buttons[0].disabled;
      if (e.key === 'r' || e.key === 'R') { if (!timed) { e.preventDefault(); start(); } return; }
      if (!enabled) return;
      if (task.exercise === 'orten') {
        if (['1', '3', '5'].includes(e.key)) {
          selectedTone = e.key;
          answerBox.querySelectorAll('.orten-tone').forEach((n) => n.classList.toggle('selected', n.dataset.fn === selectedTone));
          e.preventDefault();
        } else if (e.key === '0' || e.key === 's' || e.key === 'S') { e.preventDefault(); submit('stimmt'); }
        else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedTone) { e.preventDefault(); submit(`${selectedTone}:${e.key === 'ArrowUp' ? 'hoch' : 'tief'}`); }
      } else if (task.options[0].key === 'v0') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); submit('v0'); }
        if (e.key === 'ArrowRight') { e.preventDefault(); submit('v1'); }
      } else {
        if (e.key === 'ArrowUp') { e.preventDefault(); submit('hoch'); }
        if (e.key === 'ArrowDown') { e.preventDefault(); submit('tief'); }
      }
    }
    document.addEventListener('keydown', onKey);
    startTimer = setTimeout(start, 350);
    cancel = () => {
      answered = true;
      clearTimeout(timer);
      clearTimeout(startTimer);
      document.removeEventListener('keydown', onKey);
      if (handle) handle.stop();
      if (fbHandle) fbHandle.cancel();
    };
  });
  return { promise, cancel: () => cancel() };
}

/** Aufgabe „Stimmen“: der Klang liegt, Regler und Tasten verschieben den abweichenden Ton. */
function presentTune(body, task, cfg) {
  let cancel = () => {};
  const promise = new Promise((resolve) => {
    body.innerHTML = '';
    taskHead(body, task);
    const idx = task.tuneIndex;
    const start = task.dev.cents;
    let offset = 0; // Verschiebung gegenüber dem Start, in Cent
    let handle = null;
    let done = false;
    let fbHandle = null;
    const t0 = performance.now();
    const apply = () => { if (handle) handle.setCents(idx, task.target[idx] + start + offset); };
    const slider = el('input', { type: 'range', min: -600, max: 600, step: 1, value: 0, class: 'tune-slider', 'aria-label': 'Tonhöhe' });
    slider.addEventListener('input', () => { offset = Number(slider.value) / 10; apply(); });
    const nudge = (d) => {
      offset = Math.max(-60, Math.min(60, Math.round((offset + d) * 10) / 10));
      slider.value = Math.round(offset * 10);
      apply();
    };
    const row = el('div', { class: 'tune-row' }, [
      el('button', { class: 'btn small', text: '− 1', title: '1 Cent tiefer', onclick: () => nudge(-1) }),
      el('button', { class: 'btn small', text: '− 0,1', title: '0,1 Cent tiefer', onclick: () => nudge(-0.1) }),
      el('span', { class: 'muted small', text: 'tiefer · höher' }),
      el('button', { class: 'btn small', text: '+ 0,1', title: '0,1 Cent höher', onclick: () => nudge(0.1) }),
      el('button', { class: 'btn small', text: '+ 1', title: '1 Cent höher', onclick: () => nudge(1) }),
    ]);
    const answerBox = el('div', { class: 'answer-box' });
    const controls = el('div', { class: 'controls' });
    const playBtn = el('button', { class: 'btn play', text: '■ Pause' });
    const startSound = () => {
      if (handle) handle.stop();
      const vs = flat(voicesOf(task, 'test'));
      vs[idx].cents = task.target[idx] + start + offset;
      handle = play(vs, { a4: a4() });
      playBtn.textContent = '■ Pause';
    };
    playBtn.addEventListener('click', () => {
      if (done) return;
      if (handle) { handle.stop(); handle = null; playBtn.textContent = '▶ Weiter'; } else startSound();
    });
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      if (handle) handle.stop();
      handle = null;
      slider.disabled = true;
      row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      doneBtn.disabled = true;
      playBtn.disabled = true;
      const err = start + offset;
      const res = task.evaluate(err);
      res.err = err;
      cfg.onResult(res, performance.now() - t0);
      fbHandle = showFeedback(answerBox, task, res, { onNext: () => resolve(res), nextLabel: cfg.nextLabel, finalDev: err, compare: cfg.compare !== false });
    };
    const doneBtn = el('button', { class: 'btn primary', text: 'Fertig', onclick: finish });
    controls.appendChild(playBtn);
    controls.appendChild(el('span', { class: 'muted small', text: 'Tasten: ← → 1 Cent, mit Umschalt 0,1 Cent, Eingabe = Fertig' }));
    body.appendChild(controls);
    body.appendChild(slider);
    body.appendChild(row);
    body.appendChild(el('div', { class: 'row-right' }, doneBtn));
    body.appendChild(answerBox);
    function onKey(e) {
      if (done || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(e.shiftKey ? -0.1 : -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(e.shiftKey ? 0.1 : 1); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(); }
    }
    document.addEventListener('keydown', onKey);
    const st = setTimeout(startSound, 350);
    cancel = () => {
      done = true;
      clearTimeout(st);
      document.removeEventListener('keydown', onKey);
      if (handle) handle.stop();
      if (fbHandle) fbHandle.cancel();
    };
  });
  return { promise, cancel: () => cancel() };
}

function priority(skill, recent) {
  const st = state.skills[skill.id];
  let w = 1 + Math.min(3, overdueDays(skill.id)) * 0.5 + (100 - ratingOf(skill.id)) / 50 + (!st || st.n === 0 ? 1 : 0);
  if (recent.slice(-2).includes(skill.id)) w *= 0.25;
  return w;
}

/** Am häufigsten verfehlter Akkordton beim Orten (Index 0–2) oder undefined */
function weakTone() {
  const t = {};
  for (const a of state.answers.slice(-600)) {
    if (!a.skill.startsWith('orten.') || !a.meta || !a.meta.tone) continue;
    const e = (t[a.meta.tone] ||= { n: 0, ok: 0 });
    e.n++;
    if (a.score >= 0.99) e.ok++;
  }
  let worst;
  let worstAcc = 1;
  for (const [fn, e] of Object.entries(t)) {
    if (e.n < 4) continue;
    const acc = e.ok / e.n;
    if (acc < worstAcc - 0.05) { worstAcc = acc; worst = fn; }
  }
  if (worst === undefined) return undefined;
  return { 1: 0, 3: 1, 5: 2 }[worst];
}

/**
 * Abschnitt ausführen.
 * block: { kind: 'ex'|'weak'|'probe'|'free', label, seconds, exercise, mode, skillId, stageOverride, system }
 * Rückgabe: Promise<{answers, score, perSkill, deltas, stopped, seconds}>
 */
export function runBlock(container, block) {
  return new Promise((resolve) => {
    const results = { answers: 0, score: 0, perSkill: {}, timeouts: 0 };
    const startRatings = {};
    const recent = [];
    const limit = block.seconds ? block.seconds * 1000 : null;
    let tStart = null;
    let count = 0;
    let stopped = false;
    let current = null;
    let probeTurn = 0;
    const header = el('div', { class: 'run-header' });
    const body = el('div', { class: 'run-body' });
    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(body);

    // Schwächen: Thema und Richtung einmal zu Beginn festlegen
    let weak = null;
    if (block.kind === 'weak') {
      const ws = weakestSkill();
      const skill = ws ? ws.skill : openSkills('orten')[0];
      weak = { skill, sign: weakerSign((a) => a.skill.startsWith(skill.exercise + '.')), tone: skill.exercise === 'orten' ? weakTone() : undefined };
    }

    const finish = () => {
      if (current) current.cancel();
      current = null;
      stopAll();
      const deltas = {};
      for (const id of Object.keys(startRatings)) {
        closeBlock(id);
        deltas[id] = ratingOf(id) - startRatings[id];
      }
      container._stop = null;
      resolve({ ...results, deltas, stopped, seconds: tStart ? Math.round((performance.now() - tStart) / 1000) : 0 });
    };

    const nextSpec = () => {
      if (block.kind === 'free') {
        const skill = SKILL_BY_ID[block.skillId];
        const stageIdx = block.stageOverride !== null && block.stageOverride !== undefined ? block.stageOverride : chooseStage(skill.id, skill.stages);
        return { skillId: skill.id, stageIdx, opts: { system: block.system || 'rein' }, rated: (block.system || 'rein') === 'rein' };
      }
      if (block.kind === 'probe') {
        const cat = probeTurn++ % 2 === 0 ? 'tri' : 'iv';
        const open = openSkills(PROBE[cat].exercise, PROBE[cat].track);
        const skill = open[Math.floor(Math.random() * open.length)];
        const cents = probeLevel(cat);
        return { skillId: skill.id, stageIdx: -1, cat, opts: { stage: { ...PROBE_STAGE, cents }, cents }, rated: false };
      }
      if (block.kind === 'weak') {
        const skill = weak.skill;
        const bias = {};
        if (weak.sign) bias.sign = weak.sign;
        if (weak.tone !== undefined) bias.tone = weak.tone;
        return { skillId: skill.id, stageIdx: chooseStage(skill.id, skill.stages), opts: { bias }, rated: true };
      }
      const open = openSkills(block.exercise);
      const skill = pickWeighted(open.map((s) => ({ s, w: priority(s, recent) }))).s;
      return { skillId: skill.id, stageIdx: chooseStage(skill.id, skill.stages, block.mode === 'test' ? 'test' : 'normal'), opts: {}, rated: true };
    };

    const renderHeader = (spec, task) => {
      const skill = SKILL_BY_ID[spec.skillId];
      header.innerHTML = '';
      const left = limit ? `noch ${fmtTime(limit - (performance.now() - tStart))}` : `Aufgabe ${count + 1}`;
      header.appendChild(el('div', { class: 'run-title' }, [
        el('span', { class: 'run-skill', text: block.kind === 'probe' ? `Probencheck · ${PROBE[spec.cat].name}` : skill.name }),
        el('span', { class: 'run-count', text: left }),
      ]));
      let sub;
      if (block.kind === 'probe') sub = `${fmtNum(task.stage.cents, 1)} Cent · 2 s Klang, 3 s Antwort · ohne Hilfen`;
      else sub = `Stufe ${spec.stageIdx + 1} von ${skill.stages.length}: ${stageLabel(skill.exercise, task.stage)}`;
      if (block.kind === 'weak' && weak.sign) sub += ` · vor allem „${weak.sign > 0 ? 'zu hoch' : 'zu tief'}“`;
      if (spec.opts.system === 'gleich') sub += ' · Sollstimmung gleichstufig (ohne Wertung fürs Niveau)';
      header.appendChild(el('div', { class: 'run-stage muted small', text: sub }));
    };

    const step = () => {
      if (stopped) return;
      if (tStart === null) tStart = performance.now();
      if (limit && count >= 2 && performance.now() - tStart >= limit) return finish();
      const spec = nextSpec();
      let task;
      try {
        task = generateTask(spec.skillId, spec.stageIdx, spec.opts);
      } catch (e) {
        console.error(e);
        body.innerHTML = '';
        body.appendChild(el('div', { class: 'error', text: 'Die Aufgabe ließ sich nicht erzeugen: ' + e.message }));
        body.appendChild(el('button', { class: 'btn', text: 'Nächste Aufgabe', onclick: () => { count++; step(); } }));
        return;
      }
      if (window.__wciDebug) window.__wciTask = task; // nur für die automatischen Tests
      if (startRatings[task.skillId] === undefined && spec.rated) startRatings[task.skillId] = ratingOf(task.skillId);
      recent.push(task.skillId);
      renderHeader(spec, task);
      const onResult = (res, ms) => {
        const meta = {
          mat: task.material,
          cents: task.dev ? Math.round(Math.abs(task.dev.cents) * 10) / 10 : 0,
          sign: task.dev && task.exercise !== 'stimmen' ? Math.sign(task.dev.cents) : 0,
          tone: task.dev && task.chord ? task.tones[task.dev.index].fn : null,
          insts: task.insts,
          timeout: !!res.timeout,
          block: block.kind,
        };
        if (res.err !== undefined) meta.err = Math.round(res.err * 10) / 10;
        const rec = { skill: task.skillId, stage: spec.stageIdx, diff: task.diff, score: res.score, truth: res.truthKey, answer: res.answerKey, ms, meta };
        if (block.kind === 'probe') {
          meta.probe = spec.cat;
          logAnswer(rec);
          updateStreak();
          probeUpdate(spec.cat, res.score >= 0.99, !task.clean);
        } else if (!spec.rated) {
          logAnswer(rec);
          updateStreak();
        } else {
          recordAnswer(rec);
        }
        results.answers++;
        results.score += res.score;
        if (res.timeout) results.timeouts++;
        const ps = (results.perSkill[task.skillId] ||= { n: 0, score: 0 });
        ps.n++;
        ps.score += res.score;
      };
      const overTime = () => limit && count + 1 >= 2 && performance.now() - tStart >= limit;
      const cfg = { onResult, autoNext: block.kind !== 'free', compare: block.kind !== 'probe', get nextLabel() { return overTime() ? 'Abschnitt abschließen' : 'Weiter'; } };
      current = task.exercise === 'stimmen' ? presentTune(body, task, cfg) : presentListening(body, task, cfg);
      current.promise.then(() => { count++; current = null; step(); });
    };

    container._stop = () => { stopped = true; finish(); };
    ensureAudio().then(step);
  });
}

/** Ergebnis eines Abschnitts */
export function blockSummary(container, block, result) {
  const box = el('div', { class: 'summary' });
  const acc = result.answers ? Math.round((result.score / result.answers) * 100) : 0;
  box.appendChild(el('h3', { text: `${block.label || 'Abschnitt'} abgeschlossen` }));
  box.appendChild(el('p', { text: result.answers ? `${result.answers} Aufgaben · ${acc} % Trefferquote` : 'Keine Aufgabe beantwortet.' }));
  if (block.kind === 'probe') {
    for (const cat of Object.keys(PROBE)) {
      const v = probeValue(cat);
      box.appendChild(el('p', { class: 'small', text: `Probenwert ${PROBE[cat].name}: ${v === null ? 'noch zu wenige Messpunkte' : fmtNum(v, 1) + ' Cent'}` }));
    }
  }
  for (const [id, d] of Object.entries(result.deltas || {})) {
    const sk = SKILL_BY_ID[id];
    const idx = currentStageIndex(id, sk.stages);
    box.appendChild(el('p', { class: 'small', text: `${sk.name}: Niveau ${fmtNum(ratingOf(id), 1)} (${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d), 1)}) · Stufe ${idx + 1}: ${stageLabel(sk.exercise, sk.stages[idx])}` }));
  }
  container.appendChild(box);
  return box;
}

export { presentListening, presentTune, EXERCISES };
