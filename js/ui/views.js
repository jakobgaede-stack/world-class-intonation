// Ansichten: Heute (Lektion), Üben, Statistik, Einstellungen.
import { el } from '../modules/common.js';
import { state, saveState, exportJson, importJson, resetState } from '../engine/state.js';
import { planLesson, saveLesson, openLesson, blockMinutes, lessonsDoneToday, MIN_MINUTES, MAX_MINUTES } from '../engine/lesson.js';
import { runBlock, blockSummary } from './runner.js';
import { runCompare } from './compare.js';
import { runPlacement } from './placement.js';
import { skipPlacement } from '../engine/placement.js';
import { SKILLS, EXERCISES, EXERCISE_ORDER, isOpen, stageLabel, materialName, isChord, OPEN_AT } from '../engine/skills.js';
import { ratingOf, currentStageIndex, recentAccuracy } from '../engine/rating.js';
import { PROBE, probeValue, probeHistory, probeCount } from '../engine/probe.js';
import { LISTEN_MODES } from '../audio/space.js';
import { ENSEMBLES } from '../theory/instruments.js';
import { setMasterVolume, unlockAudio } from '../audio/context.js';
import { stopAll } from '../audio/player.js';
import { syncEnabled, pull, push, syncStatus } from '../engine/sync.js';
import { fmtNum } from '../theory/tuning.js';

const MINUTE_CHIPS = [5, 10, 15, 20, 30, 45, 60, 90];

function waitButton(container, label, registry = container) {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      resolve(true);
    };
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    setTimeout(() => { if (!done) document.addEventListener('keydown', onKey); }, 250);
    const btn = el('button', { class: 'btn primary', text: label, onclick: go });
    container.appendChild(el('div', { class: 'row-right' }, btn));
    registry._cancelWait = () => { done = true; document.removeEventListener('keydown', onKey); resolve(false); };
  });
}

function probeLine(cat) {
  const v = probeValue(cat);
  return `${PROBE[cat].name}: ${v === null ? 'noch offen' : fmtNum(v, 1) + ' Cent'}`;
}

// ------------------------------------------------------------------ Heute

export function viewToday(app) {
  app.innerHTML = '';
  app.appendChild(el('h1', { text: 'Heute' }));

  if (!state.placement.done) {
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', { text: 'Zuerst: Einstufung' }));
    p.appendChild(el('p', { text: 'Drei kurze Teile, zusammen etwa acht Minuten: Richtung, Orten, Stimmen. Danach beginnt jede Übung auf deinem Niveau.' }));
    const listen = el('select', { class: 'select narrow', 'aria-label': 'Abhören' });
    for (const [id, m] of Object.entries(LISTEN_MODES)) listen.appendChild(el('option', { value: id, text: m.name, selected: state.settings.listen === id }));
    const hint = el('div', { class: 'muted small', text: (LISTEN_MODES[state.settings.listen] || LISTEN_MODES['kopf-raum']).hint });
    listen.addEventListener('change', () => { state.settings.listen = listen.value; hint.textContent = LISTEN_MODES[listen.value].hint; saveState(); });
    p.appendChild(el('div', { class: 'row' }, [el('span', { text: 'Worüber hörst du?' }), listen]));
    p.appendChild(hint);
    p.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn primary', text: 'Einstufung starten', onclick: () => startPlacement(app) }),
      el('button', { class: 'btn ghost', text: 'Überspringen', onclick: () => { skipPlacement(); viewToday(app); } }),
    ]));
    app.appendChild(p);
  }

  const lessonPanel = el('div', { class: 'panel' });
  lessonPanel.appendChild(el('h2', { text: 'Lektion' }));
  const resume = openLesson();
  if (resume) {
    lessonPanel.appendChild(el('p', { text: `Angefangene Lektion: Abschnitt ${resume.progress + 1} von ${resume.blocks.length} (${resume.blocks[resume.progress].label}).` }));
    lessonPanel.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Fortsetzen', onclick: () => runLesson(app, resume) })));
  }
  let minutes = state.settings.minutes || 20;
  const input = el('input', { class: 'num', type: 'number', min: MIN_MINUTES, max: MAX_MINUTES, step: 1, value: minutes, 'aria-label': 'Minuten' });
  const list = el('ol', { class: 'blocks' });
  const chips = el('div', { class: 'chips' });
  let plan = null;
  const refresh = () => {
    plan = planLesson(minutes);
    list.innerHTML = '';
    for (const b of plan.blocks) list.appendChild(el('li', {}, [el('b', { text: `${b.label} · ${blockMinutes(b)} min` }), el('div', { class: 'muted small', text: b.why })]));
    chips.querySelectorAll('button').forEach((c) => c.classList.toggle('selected', Number(c.dataset.m) === minutes));
  };
  const setMinutes = (m) => {
    minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(m) || MIN_MINUTES));
    input.value = minutes;
    state.settings.minutes = minutes;
    saveState();
    refresh();
  };
  input.addEventListener('change', () => setMinutes(Number(input.value)));
  for (const m of MINUTE_CHIPS) chips.appendChild(el('button', { class: 'btn chip', 'data-m': m, text: String(m), onclick: () => setMinutes(m) }));
  lessonPanel.appendChild(el('div', { class: 'row' }, [el('span', { text: 'Wie viel Zeit hast du?' }), input, el('span', { class: 'muted', text: 'Minuten' })]));
  lessonPanel.appendChild(chips);
  lessonPanel.appendChild(list);
  lessonPanel.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn primary', text: resume ? 'Neue Lektion starten' : 'Lektion starten', onclick: () => { saveLesson(plan); runLesson(app, plan); } })));
  app.appendChild(lessonPanel);
  refresh();

  // iPhone und iPad: bei eingeschaltetem Stummschalter bleibt Web-Audio still
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) lessonPanel.appendChild(el('p', { class: 'muted small', text: 'Bleibt es still? Dann ist der Stummschalter am Gerät an. Schalte ihn aus oder nimm Kopfhörer.' }));

  const stand = el('div', { class: 'panel' });
  stand.appendChild(el('h2', { text: 'Stand' }));
  stand.appendChild(el('p', { text: `Probenwert · ${probeLine('iv')} · ${probeLine('tri')}` }));
  stand.appendChild(el('p', { class: 'muted small', text: 'Der Probenwert ist die kleinste Abweichung, die du ohne Hilfen in drei Sekunden zu 80 % richtig benennst. Zielmarken: 15 Cent, dann 5 Cent.' }));
  const done = lessonsDoneToday();
  stand.appendChild(el('p', { class: 'small', text: `Serie: ${state.streak.current || 0} ${state.streak.current === 1 ? 'Tag' : 'Tage'} · heute ${done} ${done === 1 ? 'Lektion' : 'Lektionen'} abgeschlossen · Abhören: ${(LISTEN_MODES[state.settings.listen] || LISTEN_MODES['kopf-raum']).name}` }));
  app.appendChild(stand);
}

async function startPlacement(app) {
  await unlockAudio();
  app.innerHTML = '';
  const bar = el('div', { class: 'topbar' }, [el('span', { text: 'Einstufung' }), el('button', { class: 'btn small ghost', text: 'Abbrechen', onclick: () => { if (area._stop) area._stop(); } })]);
  const area = el('div');
  app.appendChild(bar);
  app.appendChild(area);
  app._stop = () => { if (area._stop) area._stop(); };
  await runPlacement(area);
  // nach einem Wechsel der Ansicht nichts mehr zeichnen
  if (!document.body.contains(area)) return;
  app._stop = null;
  viewToday(app);
}

async function runLesson(app, plan) {
  await unlockAudio();
  app.innerHTML = '';
  const bar = el('div', { class: 'topbar' });
  const area = el('div');
  app.appendChild(bar);
  app.appendChild(area);
  let aborted = false;
  const abort = () => {
    aborted = true;
    if (area._cancelWait) area._cancelWait();
    if (area._stop) area._stop();
  };
  app._stop = abort;
  const renderBar = (i) => {
    bar.innerHTML = '';
    bar.appendChild(el('span', { text: `Lektion · Abschnitt ${i + 1} von ${plan.blocks.length}: ${plan.blocks[i].label}` }));
    bar.appendChild(el('button', { class: 'btn small ghost', text: 'Lektion beenden', onclick: abort }));
  };
  for (let i = plan.progress; i < plan.blocks.length; i++) {
    const b = plan.blocks[i];
    renderBar(i);
    area.innerHTML = '';
    const intro = el('div', { class: 'run-body' });
    intro.appendChild(el('h2', { text: `${b.label} · ${blockMinutes(b)} min` }));
    intro.appendChild(el('p', { text: b.why }));
    area.appendChild(intro);
    const go = await waitButton(intro, 'Los', area);
    if (aborted || !go) break;
    const result = b.kind === 'compare' ? await runCompare(area, b) : await runBlock(area, b);
    if (aborted || result.stopped) break;
    plan.results[i] = { label: b.label, answers: result.answers, score: Math.round(result.score * 100) / 100, seconds: result.seconds };
    plan.progress = i + 1;
    saveLesson(plan);
    if (i < plan.blocks.length - 1) {
      area.innerHTML = '';
      const box = blockSummary(area, b, result);
      const next = await waitButton(box, `Weiter: ${plan.blocks[i + 1].label}`, area);
      if (aborted || !next) break;
    }
  }
  stopAll();
  if (!document.body.contains(area)) {
    // Ansicht wurde gewechselt: Stand sichern, nichts mehr zeichnen
    saveLesson(plan);
    return;
  }
  app._stop = null;
  if (plan.progress >= plan.blocks.length) {
    plan.done = true;
    plan.finishedAt = Date.now();
    saveLesson(plan);
    lessonSummary(app, plan);
  } else {
    saveLesson(plan);
    viewToday(app);
  }
}

function lessonSummary(app, plan) {
  app.innerHTML = '';
  app.appendChild(el('h1', { text: 'Lektion abgeschlossen' }));
  const box = el('div', { class: 'summary' });
  const total = plan.results.reduce((a, r) => a + (r ? r.answers : 0), 0);
  const score = plan.results.reduce((a, r) => a + (r ? r.score : 0), 0);
  const secs = plan.results.reduce((a, r) => a + (r ? r.seconds : 0), 0);
  box.appendChild(el('p', { text: `${Math.max(1, Math.round(secs / 60))} Minuten · ${total} Aufgaben · ${total ? Math.round((score / total) * 100) : 0} % Trefferquote` }));
  box.appendChild(el('p', { text: `Probenwert · ${probeLine('iv')} · ${probeLine('tri')}` }));
  const t = el('table', { class: 'stats' });
  t.appendChild(el('tr', {}, [el('th', { text: 'Abschnitt' }), el('th', { text: 'Aufgaben' }), el('th', { text: 'Treffer' })]));
  plan.results.forEach((r) => {
    if (!r) return;
    t.appendChild(el('tr', {}, [el('td', { text: r.label }), el('td', { text: r.answers ? String(r.answers) : '–' }), el('td', { text: r.answers ? Math.round((r.score / r.answers) * 100) + ' %' : '–' })]));
  });
  box.appendChild(t);
  app.appendChild(box);
  app.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn primary', text: 'Fertig', onclick: () => viewToday(app) }),
    el('a', { class: 'btn ghost', href: '#statistik', text: 'Zur Statistik' }),
  ]));
}

// ------------------------------------------------------------------ Üben

export function viewPractice(app) {
  app.innerHTML = '';
  app.appendChild(el('h1', { text: 'Üben' }));
  app.appendChild(el('p', { class: 'muted', text: 'Freies Üben mit eigenen Einstellungen, ohne Zeitvorgabe. Das Niveau zählt mit; nur bei gleichstufiger Sollstimmung bleibt es unberührt.' }));
  for (const exId of EXERCISE_ORDER) {
    const ex = EXERCISES[exId];
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', { text: ex.name }));
    p.appendChild(el('p', { class: 'muted', text: ex.about }));
    const skills = SKILLS.filter((s) => s.exercise === exId);
    const matSel = el('select', { class: 'select', 'aria-label': 'Material' });
    for (const s of skills) {
      const open = isOpen(s);
      matSel.appendChild(el('option', { value: s.id, text: `${materialName(s.material)}${isChord(s.material) ? '-Dreiklang' : ''} · Niveau ${Math.round(ratingOf(s.id))}${open ? '' : ' · noch nicht in den Lektionen'}` }));
    }
    const stageSel = el('select', { class: 'select', 'aria-label': 'Stufe' });
    stageSel.appendChild(el('option', { value: '', text: 'Stufe: automatisch nach Niveau' }));
    ex.stages.forEach((st, i) => stageSel.appendChild(el('option', { value: i, text: `Stufe ${i + 1}: ${stageLabel(exId, st)}` })));
    const sysSel = el('select', { class: 'select', 'aria-label': 'Sollstimmung' });
    sysSel.appendChild(el('option', { value: 'rein', text: 'Sollstimmung: rein' }));
    sysSel.appendChild(el('option', { value: 'gleich', text: 'Sollstimmung: gleichstufig' }));
    p.appendChild(el('div', { class: 'practice-grid' }, [matSel, stageSel, sysSel]));
    p.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Starten', onclick: () => runFree(app, { kind: 'free', label: ex.name, skillId: matSel.value, stageOverride: stageSel.value === '' ? null : Number(stageSel.value), system: sysSel.value }) })));
    app.appendChild(p);
  }
  const c = el('div', { class: 'panel' });
  c.appendChild(el('h2', { text: 'Hörvergleich' }));
  c.appendChild(el('p', { class: 'muted', text: 'Rein, gleichstufig, zu weit, zu eng im direkten Wechsel. Ohne Wertung.' }));
  c.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Starten', onclick: () => runFree(app, { kind: 'compare', label: 'Hörvergleich' }) })));
  app.appendChild(c);
}

async function runFree(app, block) {
  await unlockAudio();
  app.innerHTML = '';
  const area = el('div');
  const bar = el('div', { class: 'topbar' }, [el('span', { text: `Freies Üben · ${block.label}` }), el('button', { class: 'btn small ghost', text: 'Beenden', onclick: () => { if (area._stop) area._stop(); } })]);
  app.appendChild(bar);
  app.appendChild(area);
  app._stop = () => { if (area._stop) area._stop(); };
  const result = block.kind === 'compare' ? await runCompare(area, block) : await runBlock(area, block);
  app._stop = null;
  if (!document.body.contains(area)) return;
  area.innerHTML = '';
  bar.remove();
  const box = blockSummary(area, block, result);
  box.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Zurück zur Auswahl', onclick: () => viewPractice(app) })));
}

// ------------------------------------------------------------------ Statistik

function sparkline(points) {
  const NS = 'http://www.w3.org/2000/svg';
  const w = 220;
  const h = 46;
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('width', w);
  s.setAttribute('height', h);
  s.setAttribute('class', 'spark');
  if (points.length < 2) return s;
  const vals = points.map((p) => p.v);
  const lo = Math.min(...vals, 5);
  const hi = Math.max(...vals, 15);
  const x = (i) => 4 + (i / (points.length - 1)) * (w - 8);
  const y = (v) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8);
  for (const mark of [15, 5]) {
    if (mark < lo || mark > hi) continue;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 0); l.setAttribute('x2', w); l.setAttribute('y1', y(mark)); l.setAttribute('y2', y(mark));
    l.setAttribute('class', 'spark-mark');
    s.appendChild(l);
  }
  const path = document.createElementNS(NS, 'polyline');
  path.setAttribute('points', points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '));
  path.setAttribute('class', 'spark-line');
  s.appendChild(path);
  return s;
}

function keyLabel(key) {
  if (key === 'stimmt') return 'stimmt';
  if (key === 'keine') return 'keine Antwort';
  if (!key.includes(':')) return key;
  const [fn, dir] = key.split(':');
  return `${{ 1: 'Grundton', 3: 'Terz', 5: 'Quinte' }[fn] || fn} ${dir === 'hoch' ? 'zu hoch' : 'zu tief'}`;
}

export function viewStats(app) {
  app.innerHTML = '';
  app.appendChild(el('h1', { text: 'Statistik' }));

  const pr = el('div', { class: 'panel' });
  pr.appendChild(el('h2', { text: 'Probenwert' }));
  pr.appendChild(el('p', { class: 'muted small', text: 'Kleinste Abweichung, die du ohne Hilfen in drei Sekunden zu 80 % richtig benennst. Linien im Verlauf: 15 und 5 Cent.' }));
  const grid = el('div', { class: 'probe-grid' });
  for (const cat of Object.keys(PROBE)) {
    const v = probeValue(cat);
    const card = el('div', { class: 'probe-card' });
    card.appendChild(el('div', { class: 'muted small', text: PROBE[cat].name }));
    card.appendChild(el('div', { class: 'probe-value', text: v === null ? '–' : fmtNum(v, 1) + ' Cent' }));
    card.appendChild(el('div', { class: 'muted small', text: v === null ? `noch ${Math.max(0, 6 - probeCount(cat))} Messpunkte bis zum ersten Wert` : `${probeCount(cat)} Messpunkte` }));
    card.appendChild(sparkline(probeHistory(cat)));
    grid.appendChild(card);
  }
  pr.appendChild(grid);
  app.appendChild(pr);

  // Treffer nach Richtung
  const dir = { 1: { n: 0, ok: 0 }, '-1': { n: 0, ok: 0 } };
  let clean = { n: 0, ok: 0 };
  for (const a of state.answers) {
    if (!a.meta || a.skill.startsWith('stimmen.')) continue;
    if (a.meta.sign) { const e = dir[String(a.meta.sign)]; e.n++; if (a.score >= 0.99) e.ok++; }
    else if (a.skill.startsWith('orten.')) { clean.n++; if (a.score >= 0.99) clean.ok++; }
  }
  const dp = el('div', { class: 'panel' });
  dp.appendChild(el('h2', { text: 'Treffer nach Richtung' }));
  const pct = (e) => (e.n ? `${Math.round((e.ok / e.n) * 100)} % von ${e.n}` : 'noch keine Aufgaben');
  dp.appendChild(el('p', { text: `zu hoch: ${pct(dir['1'])} · zu tief: ${pct(dir['-1'])} · saubere Akkorde erkannt: ${pct(clean)}` }));
  app.appendChild(dp);

  for (const exId of EXERCISE_ORDER) {
    const ex = EXERCISES[exId];
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', { text: ex.name }));
    const t = el('table', { class: 'stats' });
    t.appendChild(el('tr', {}, [el('th', { text: 'Material' }), el('th', { text: 'Niveau' }), el('th', { text: 'Stufe' }), el('th', { text: 'letzte 20' }), el('th', { text: 'Aufgaben' })]));
    for (const s of SKILLS.filter((x) => x.exercise === exId)) {
      const st = state.skills[s.id];
      const open = isOpen(s);
      const idx = currentStageIndex(s.id, s.stages);
      const acc = recentAccuracy(s.id);
      const r = ratingOf(s.id);
      const barCell = el('td', {}, [el('div', { class: 'rbar' }, el('div', { class: 'rbar-fill', style: `width:${Math.round(r)}%` })), el('span', { class: 'small', text: ' ' + Math.round(r) })]);
      t.appendChild(el('tr', { class: open ? '' : 'locked' }, [
        el('td', { text: materialName(s.material) + (isChord(s.material) ? '-Dreiklang' : '') }),
        barCell,
        el('td', { class: 'small', text: open ? `${idx + 1}: ${stageLabel(exId, s.stages[idx])}` : 'noch nicht in den Lektionen' }),
        el('td', { text: acc === null ? '–' : Math.round(acc * 100) + ' %' }),
        el('td', { text: st ? String(st.n) : '0' }),
      ]));
    }
    p.appendChild(t);
    if (SKILLS.some((x) => x.exercise === exId && !isOpen(x))) p.appendChild(el('p', { class: 'muted small', text: `Neues Material kommt in die Lektionen, sobald das vorige Niveau ${OPEN_AT} erreicht. Im freien Üben ist alles wählbar.` }));
    if (exId === 'orten') {
      // Drei Teilleistungen getrennt: bemerkt, Ton gefunden, Richtung richtig
      const o = { n: 0, noticed: 0, tone: 0, full: 0 };
      for (const a of state.answers) {
        if (!a.skill.startsWith('orten.') || !a.truth || !String(a.truth).includes(':')) continue;
        o.n++;
        const ans = String(a.answer || '');
        if (ans.includes(':')) {
          o.noticed++;
          if (ans.split(':')[0] === String(a.truth).split(':')[0]) o.tone++;
          if (ans === a.truth) o.full++;
        }
      }
      if (o.n) {
        const pc = (x) => Math.round((x / o.n) * 100) + ' %';
        p.appendChild(el('p', { class: 'small', text: `Bei ${o.n} verstimmten Akkorden (mit Probencheck und Einstufung): Abweichung bemerkt ${pc(o.noticed)} · richtigen Ton genannt ${pc(o.tone)} · Ton und Richtung richtig ${pc(o.full)}` }));
      }
      const list = [];
      for (const s of SKILLS.filter((x) => x.exercise === 'orten')) {
        const cm = state.confusion[s.id] || {};
        for (const truth of Object.keys(cm)) for (const ans of Object.keys(cm[truth])) if (truth !== ans) list.push({ s, truth, ans, n: cm[truth][ans] });
      }
      list.sort((a, b) => b.n - a.n);
      if (list.length) {
        p.appendChild(el('h3', { text: 'Häufigste Verwechslungen' }));
        for (const c of list.slice(0, 5)) p.appendChild(el('p', { class: 'small', text: `${materialName(c.s.material)}: ${keyLabel(c.truth)} → geantwortet „${keyLabel(c.ans)}“ (${c.n}×)` }));
      }
    }
    app.appendChild(p);
  }

  const lp = el('div', { class: 'panel' });
  lp.appendChild(el('h2', { text: 'Letzte Lektionen' }));
  const done = state.lessons.filter((l) => l.progress > 0).slice(-10).reverse();
  if (!done.length) lp.appendChild(el('p', { class: 'muted', text: 'Noch keine Lektion.' }));
  else {
    const t = el('table', { class: 'stats' });
    t.appendChild(el('tr', {}, [el('th', { text: 'Datum' }), el('th', { text: 'geplant' }), el('th', { text: 'Aufgaben' }), el('th', { text: 'Treffer' }), el('th', { text: '' })]));
    for (const l of done) {
      const total = l.results.reduce((a, r) => a + (r ? r.answers : 0), 0);
      const score = l.results.reduce((a, r) => a + (r ? r.score : 0), 0);
      t.appendChild(el('tr', {}, [el('td', { text: l.date.split('-').reverse().join('.') }), el('td', { text: l.minutes + ' min' }), el('td', { text: String(total) }), el('td', { text: total ? Math.round((score / total) * 100) + ' %' : '–' }), el('td', { class: 'small muted', text: l.done ? 'abgeschlossen' : `bis Abschnitt ${l.progress}` })]));
    }
    lp.appendChild(t);
  }
  app.appendChild(lp);
}

// ------------------------------------------------------------------ Einstellungen

export function viewSettings(app) {
  app.innerHTML = '';
  app.appendChild(el('h1', { text: 'Einstellungen' }));
  const s = state.settings;
  const field = (label, control, hint) => el('div', { class: 'field' }, [el('div', {}, [el('div', { text: label }), hint ? el('div', { class: 'muted small', text: hint }) : null]), control]);

  const sound = el('div', { class: 'panel' });
  sound.appendChild(el('h2', { text: 'Klang' }));
  const a4 = el('input', { class: 'num', type: 'number', min: 415, max: 466, step: 1, value: s.a4 });
  a4.addEventListener('change', () => { s.a4 = Math.max(415, Math.min(466, Number(a4.value) || 443)); a4.value = s.a4; saveState(); });
  sound.appendChild(field('Stimmton a′ in Hz', a4, 'Gilt für alle Übungen.'));
  const vol = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round((s.volume ?? 0.8) * 100), class: 'vol' });
  vol.addEventListener('input', () => { s.volume = Number(vol.value) / 100; setMasterVolume(s.volume); saveState(); });
  sound.appendChild(field('Lautstärke', vol));
  const listen = el('select', { class: 'select narrow' });
  for (const [id, m] of Object.entries(LISTEN_MODES)) listen.appendChild(el('option', { value: id, text: m.name, selected: s.listen === id }));
  const listenHint = el('div', { class: 'muted small', text: (LISTEN_MODES[s.listen] || LISTEN_MODES['kopf-raum']).hint });
  listen.addEventListener('change', () => { s.listen = listen.value; listenHint.textContent = LISTEN_MODES[s.listen].hint; saveState(); });
  sound.appendChild(field('Abhören', listen, 'Bestimmt, wie weit die Stimmen links und rechts auseinanderliegen.'));
  sound.appendChild(listenHint);
  const ens = el('select', { class: 'select narrow' });
  for (const [id, e] of Object.entries(ENSEMBLES)) ens.appendChild(el('option', { value: id, text: e.name, selected: s.ensemble === id }));
  ens.addEventListener('change', () => { s.ensemble = ens.value; saveState(); });
  sound.appendChild(field('Besetzung', ens, 'Aus welchen Instrumenten die Klänge gebildet werden.'));
  const auto = el('input', { type: 'checkbox', checked: s.autoCompare !== false });
  auto.addEventListener('change', () => { s.autoCompare = auto.checked; saveState(); });
  sound.appendChild(field('Vergleich nach einem Fehlgriff', auto, 'Spielt von selbst erst den Klang der Aufgabe, dann den sauberen.'));
  sound.appendChild(el('p', { class: 'muted small', text: 'Die Klangfarben stammen aus gemessenen Teiltonspektren echter Instrumentenaufnahmen; die Tonhöhe steht dabei vollkommen ruhig. Saxophone, Flügelhorn, Tenorhorn und Euphonium sind vorerst geschätzt.' }));
  app.appendChild(sound);

  const lvl = el('div', { class: 'panel' });
  lvl.appendChild(el('h2', { text: 'Einstufung' }));
  lvl.appendChild(el('p', { class: 'muted', text: state.placement.done ? (state.placement.results ? `Zuletzt am ${String(state.placement.date).split('-').reverse().join('.')}.` : 'Übersprungen.') : 'Noch nicht gemacht.' }));
  lvl.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn', text: state.placement.done ? 'Einstufung wiederholen' : 'Einstufung starten', onclick: () => startPlacement(app) })));
  app.appendChild(lvl);

  const sync = el('div', { class: 'panel' });
  sync.appendChild(el('h2', { text: 'Abgleich zwischen Geräten' }));
  const key = el('input', { class: 'search', type: 'text', placeholder: 'Sync-Schlüssel (derselbe wie in World Class Ear)', value: s.syncKey || '', autocomplete: 'off' });
  const status = el('div', { class: 'muted small', text: syncEnabled() ? (s.syncLast ? 'Zuletzt abgeglichen: ' + new Date(s.syncLast).toLocaleString('de-AT') : 'Bereit.') : 'Aus. Mindestens sechs Zeichen.' });
  const off = syncStatus((msg) => { status.textContent = msg; });
  key.addEventListener('change', async () => { s.syncKey = key.value.trim(); saveState(); if (syncEnabled()) { await pull(); await push(); } else status.textContent = 'Aus. Mindestens sechs Zeichen.'; });
  sync.appendChild(key);
  sync.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', text: 'Jetzt abgleichen', onclick: async () => { if (!syncEnabled()) { status.textContent = 'Erst einen Schlüssel eintragen.'; return; } await pull(); await push(); } }), status]));
  sync.appendChild(el('p', { class: 'muted small', text: 'Die App hängt an den Schlüssel „-intonation“ an. Deine Daten aus World Class Ear bleiben getrennt.' }));
  app.appendChild(sync);
  const prevStop = app._stop;
  app._stop = () => { off(); if (prevStop) prevStop(); };

  const data = el('div', { class: 'panel' });
  data.appendChild(el('h2', { text: 'Daten' }));
  const file = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  const msg = el('div', { class: 'muted small' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try { await importJson(await f.text()); msg.textContent = 'Importiert.'; viewSettings(app); } catch (e) { msg.textContent = 'Import nicht möglich: ' + e.message; }
  });
  data.appendChild(file);
  data.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn', text: 'Fortschritt exportieren', onclick: () => {
      const blob = new Blob([exportJson()], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `world-class-intonation-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } }),
    el('button', { class: 'btn', text: 'Importieren', onclick: () => file.click() }),
    el('button', { class: 'btn danger', text: 'Alles zurücksetzen', onclick: async () => {
      if (!window.confirm('Wirklich den gesamten Fortschritt auf diesem Gerät löschen?')) return;
      await resetState();
      viewSettings(app);
    } }),
  ]));
  data.appendChild(msg);
  app.appendChild(data);

  app.appendChild(el('p', { class: 'muted small', text: 'World Class Intonation · Etappe 1 · Tasten in den Übungen: ↑ ↓ Richtung, 1 · 3 · 5 Akkordton, 0 stimmt, R nochmal, Eingabe weiter.' }));
}
