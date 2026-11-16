// Hörvergleich: derselbe Klang in mehreren Zuständen, während er weiterklingt umschaltbar. Ohne Wertung.
import { el } from '../modules/common.js';
import { generateTask, voicesOf } from '../modules/tasks.js';
import { play, stopAll, ensureAudio } from '../audio/player.js';
import { state } from '../engine/state.js';
import { openSkills } from '../engine/skills.js';
import { probeLevel } from '../engine/probe.js';
import { renderStaff } from './staff.js';
import { INSTRUMENTS } from '../theory/instruments.js';
import { cents, etFreq, beatRate, fmtNum, fmtCents } from '../theory/tuning.js';

const HOLD = { diff: 0, cents: 20, ref: false, onset: 'together', sound: 0, answer: 0, width: 1, timbre: 'gemischt', noten: true };

function freqs(task, devs) {
  const a4 = state.settings.a4 || 443;
  return task.midis.map((m, i) => etFreq(m, a4) * Math.pow(2, (task.target[i] + (devs[i] || 0)) / 1200));
}

function beatText(rate) {
  if (rate < 0.15) return 'steht ruhig';
  if (rate < 20) return `schwebt hier rund ${fmtNum(rate, rate < 3 ? 1 : 0)}-mal pro Sekunde`;
  return `rau: rund ${fmtNum(rate, 0)} Schwebungen pro Sekunde`;
}

/** Zustände eines Materials: [{key, label, devs (Abweichung je Stimme von der reinen Lage), info}] */
function statesFor(task, n) {
  const list = [];
  const info = (devs) => {
    const f = freqs(task, devs);
    if (task.chord) {
      const third = task.tones[1].just;
      const upper = task.chord.id === 'maj' ? [6, 5] : [5, 4];
      return `Grundton und Terz: ${beatText(beatRate(f[0], f[1], third))} · Terz und Quinte: ${beatText(beatRate(f[1], f[2], upper))} · Grundton und Quinte: ${beatText(beatRate(f[0], f[2], [3, 2]))}`;
    }
    return task.iv.id === 'P1' ? beatText(Math.abs(f[1] - f[0])).replace(/^s/, 'S') : beatText(beatRate(f[0], f[1], task.iv.just)).replace(/^[sr]/, (c) => c.toUpperCase());
  };
  const add = (key, label, devs) => list.push({ key, label, devs, info: info(devs) });
  const zero = task.midis.map(() => 0);
  add('rein', 'rein', zero);
  if (task.chord) {
    const et = task.tones.map((t) => 100 * t.semis - cents(t.just[0] / t.just[1]));
    add('gleich', 'gleichstufig', et);
    add('t+', `Terz ${fmtCents(n)}`, [0, n, 0]);
    add('t-', `Terz ${fmtCents(-n)}`, [0, -n, 0]);
    add('q+', `Quinte ${fmtCents(n)}`, [0, 0, n]);
    add('q-', `Quinte ${fmtCents(-n)}`, [0, 0, -n]);
  } else {
    const et = 100 * task.iv.semis - cents(task.iv.just[0] / task.iv.just[1]);
    if (Math.abs(et) > 0.05) add('gleich', `gleichstufig (${fmtCents(et, 1)})`, [0, et]);
    const unison = task.iv.id === 'P1';
    add('+', unison ? `${INSTRUMENTS[task.insts[1]].name} ${fmtCents(n)}` : `zu weit (${fmtCents(n)})`, [0, n]);
    add('-', unison ? `${INSTRUMENTS[task.insts[1]].name} ${fmtCents(-n)}` : `zu eng (${fmtCents(-n)})`, [0, -n]);
  }
  return list;
}

function explain(task) {
  if (task.chord) {
    return task.chord.id === 'maj'
      ? 'Rein liegt die Durterz 13,7 Cent unter der gleichstufigen, die Quinte 2 Cent darüber. Achte darauf, an welchem Tonpaar es schwebt.'
      : 'Rein liegt die Mollterz 15,6 Cent über der gleichstufigen, die Quinte 2 Cent darüber. Achte darauf, an welchem Tonpaar es schwebt.';
  }
  const d = 100 * task.iv.semis - cents(task.iv.just[0] / task.iv.just[1]);
  if (task.iv.id === 'P1') return 'Zwei Instrumente auf demselben Ton. Die Schwebung zeigt den Abstand, nicht die Richtung: Höre, welches Instrument oben liegt.';
  if (Math.abs(d) < 0.05) return 'Rein und gleichstufig sind hier gleich. Höre, wie die Schwebung mit der Abweichung schneller wird.';
  return `Gleichstufig ist dieses Intervall ${fmtNum(Math.abs(d), 1)} Cent ${d > 0 ? 'weiter' : 'enger'} als rein. Höre erst rein, dann die Abweichungen in beide Richtungen.`;
}

/**
 * block: { seconds } (ohne seconds: frei, bis „Beenden“)
 * Rückgabe: Promise<{answers: 0, cards, stopped}>
 */
export function runCompare(container, block) {
  return new Promise((resolve) => {
    const limit = block.seconds ? block.seconds * 1000 : null;
    let tStart = null;
    let cards = 0;
    let handle = null;
    let stopped = false;
    const used = [];
    container.innerHTML = '';
    const header = el('div', { class: 'run-header' });
    const body = el('div', { class: 'run-body' });
    container.appendChild(header);
    container.appendChild(body);

    const finish = () => {
      if (handle) handle.stop();
      stopAll();
      container._stop = null;
      resolve({ answers: 0, score: 0, cards, deltas: {}, stopped, seconds: tStart ? Math.round((performance.now() - tStart) / 1000) : 0 });
    };

    const card = () => {
      if (stopped) return;
      if (tStart === null) tStart = performance.now();
      if (limit && cards >= 2 && performance.now() - tStart >= limit) return finish();
      // Material: offene Themen, abwechselnd Akkord und Intervall, ohne direkte Wiederholung
      const pool = (cards % 2 === 0 ? openSkills('orten') : openSkills('richtung', 'iv')).filter((s) => !used.slice(-3).includes(s.id));
      const all = pool.length ? pool : openSkills('richtung', 'iv');
      const skill = all[Math.floor(Math.random() * all.length)];
      used.push(skill.id);
      const task = generateTask(skill.id, 0, { stage: HOLD, clean: true });
      task.dev = null;
      const n = Math.max(8, Math.min(25, Math.round(probeLevel(task.chord ? 'tri' : 'iv'))));
      const sts = statesFor(task, n);
      header.innerHTML = '';
      header.appendChild(el('div', { class: 'run-title' }, [
        el('span', { class: 'run-skill', text: 'Hörvergleich · ' + (task.chord ? task.chord.name : task.title) }),
        el('span', { class: 'run-count', text: limit ? `Karte ${cards + 1}` : `Karte ${cards + 1}` }),
      ]));
      header.appendChild(el('div', { class: 'run-stage muted small', text: 'Ohne Wertung. Der Klang bleibt liegen; schalte zwischen den Zuständen um.' }));
      body.innerHTML = '';
      body.appendChild(el('h2', { text: task.title }));
      body.appendChild(el('div', { class: 'hint', text: task.sub }));
      const box = el('div', { class: 'score-box staff-box' });
      try { box.appendChild(renderStaff(task.notes.map((sp, i) => ({ sp, label: INSTRUMENTS[task.insts[i]].name })))); body.appendChild(box); } catch (e) { console.error(e); }
      body.appendChild(el('p', { text: explain(task) }));
      const info = el('p', { class: 'compare-info' });
      const grid = el('div', { class: 'agrid cols-3' });
      let active = sts[0];
      const voices = () => voicesOf(task, 'ref').map((v, i) => ({ ...v, cents: task.target[i] + (active.devs[i] || 0), delay: 0 }));
      const startSound = () => {
        if (handle) handle.stop();
        handle = play(voices(), { a4: state.settings.a4 || 443 });
        playBtn.textContent = '■ Pause';
      };
      const select = (s, btn) => {
        active = s;
        grid.querySelectorAll('.abtn').forEach((b) => b.classList.toggle('selected', b === btn));
        info.textContent = s.info;
        if (handle) task.midis.forEach((m, i) => handle.setCents(i, task.target[i] + (s.devs[i] || 0)));
        else startSound();
      };
      sts.forEach((s, i) => {
        const b = el('button', { class: 'abtn' + (i === 0 ? ' selected' : ''), type: 'button', 'data-key': s.key });
        b.appendChild(el('span', { class: 'abtn-label', text: s.label }));
        b.appendChild(el('span', { class: 'abtn-sub', text: String(i + 1) }));
        b.addEventListener('click', () => select(s, b));
        grid.appendChild(b);
      });
      info.textContent = active.info;
      const playBtn = el('button', { class: 'btn play', text: '■ Pause', onclick: () => {
        if (handle) { handle.stop(); handle = null; playBtn.textContent = '▶ Weiter hören'; } else startSound();
      } });
      body.appendChild(el('div', { class: 'controls' }, [playBtn, el('span', { class: 'muted small', text: 'Tasten: 1 bis ' + sts.length + ' schalten um, Eingabe = nächste Karte' })]));
      body.appendChild(grid);
      body.appendChild(info);
      const next = () => {
        document.removeEventListener('keydown', onKey);
        if (handle) handle.stop();
        handle = null;
        cards++;
        card();
      };
      function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const i = Number(e.key) - 1;
        if (i >= 0 && i < sts.length) { e.preventDefault(); select(sts[i], grid.children[i]); }
        else if (e.key === 'Enter') { e.preventDefault(); next(); }
      }
      document.addEventListener('keydown', onKey);
      const over = limit && cards + 1 >= 2 && performance.now() - tStart >= limit;
      body.appendChild(el('div', { class: 'row-right' }, el('button', { class: 'btn primary', text: over ? 'Abschnitt abschließen' : 'Nächste Karte', onclick: next })));
      container._cleanup = () => document.removeEventListener('keydown', onKey);
      setTimeout(() => { if (!stopped && !handle) startSound(); }, 300);
    };

    container._stop = () => { stopped = true; if (container._cleanup) container._cleanup(); finish(); };
    ensureAudio().then(card);
  });
}
