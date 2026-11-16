// Einstufung: drei kurze Teile (Richtung, Orten, Stimmen) legen das Startniveau und den ersten Probenwert fest.
import { el } from '../modules/common.js';
import { generateTask } from '../modules/tasks.js';
import { stopAll, ensureAudio } from '../audio/player.js';
import { PLACEMENT_PARTS, Staircase, applyPlacement } from '../engine/placement.js';
import { STIMMEN_STAGES } from '../engine/skills.js';
import { logAnswer, updateStreak } from '../engine/rating.js';
import { saveState } from '../engine/state.js';
import { presentListening, presentTune } from './runner.js';
import { fmtNum } from '../theory/tuning.js';

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rückgabe: Promise<results | null> (null = abgebrochen) */
export function runPlacement(container) {
  return new Promise((resolve) => {
    const results = {};
    let stopped = false;
    let current = null;
    container.innerHTML = '';
    const header = el('div', { class: 'run-header' });
    const body = el('div', { class: 'run-body' });
    container.appendChild(header);
    container.appendChild(body);

    const abort = () => {
      stopped = true;
      if (current) current.cancel();
      stopAll();
      container._stop = null;
      resolve(null);
    };
    container._stop = abort;

    const setHeader = (part, i, n) => {
      header.innerHTML = '';
      header.appendChild(el('div', { class: 'run-title' }, [
        el('span', { class: 'run-skill', text: `Einstufung · ${part.name}` }),
        el('span', { class: 'run-count', text: `${i} von ${n}` }),
      ]));
    };

    const runPart = (pi) => {
      if (stopped) return;
      if (pi >= PLACEMENT_PARTS.length) return finish();
      const part = PLACEMENT_PARTS[pi];
      header.innerHTML = '';
      header.appendChild(el('div', { class: 'run-title' }, [el('span', { class: 'run-skill', text: `Einstufung · Teil ${pi + 1} von ${PLACEMENT_PARTS.length}: ${part.name}` })]));
      body.innerHTML = '';
      body.appendChild(el('h2', { text: part.name }));
      body.appendChild(el('p', { text: part.intro }));
      body.appendChild(el('p', { class: 'muted', text: 'Die Aufgaben werden so lange feiner, bis du an deine Grenze kommst. Fehlgriffe gehören dazu, sie zeigen der App, wo du stehst.' }));
      const go = el('button', { class: 'btn primary', text: 'Los', onclick: () => { document.removeEventListener('keydown', onKey); trial(0); } });
      body.appendChild(el('div', { class: 'row-right' }, go));
      const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); document.removeEventListener('keydown', onKey); trial(0); } };
      document.addEventListener('keydown', onKey);
      const stair = part.start ? new Staircase(part.start) : null;
      const errs = [];
      let counted = 0;

      const trial = (k) => {
        if (stopped) return;
        if ((stair && counted >= part.trials) || (!stair && k >= part.trials)) {
          results[part.id] = stair ? Math.round(stair.threshold() * 10) / 10 : Math.round(median(errs) * 10) / 10;
          return runPart(pi + 1);
        }
        setHeader(part, (stair ? counted : k) + 1, part.trials);
        const skillId = stair ? part.skills[Math.floor(Math.random() * part.skills.length)] : part.skills[k % part.skills.length];
        let task;
        if (stair) {
          const cents = stair.next();
          const clean = part.id === 'orten' && k > 0 && Math.random() < 1 / 7;
          task = generateTask(skillId, -1, { stage: { ...part.stage, cents }, cents, clean });
        } else {
          task = generateTask(skillId, 5, { stage: STIMMEN_STAGES[5] });
        }
        const onResult = (res, ms) => {
          logAnswer({ skill: task.skillId, stage: -1, diff: task.diff, score: res.score, truth: res.truthKey, answer: res.answerKey, ms, meta: { mat: task.material, cents: task.dev ? Math.round(Math.abs(task.dev.cents) * 10) / 10 : 0, sign: task.dev && stair ? Math.sign(task.dev.cents) : 0, block: 'placement', timeout: !!res.timeout } });
          updateStreak();
          saveState();
          if (stair) {
            const ok = res.score >= 0.99;
            // sauber erkannte saubere Akkorde sagen nichts über die Größe
            if (!(task.clean && ok)) { stair.record(ok); counted++; }
          } else {
            errs.push(Math.abs(res.err));
          }
        };
        const cfg = { onResult, autoNext: true, nextLabel: 'Weiter', compare: false };
        current = stair ? presentListening(body, task, cfg) : presentTune(body, task, cfg);
        current.promise.then(() => { current = null; trial(k + 1); });
      };
    };

    const finish = () => {
      applyPlacement(results);
      container._stop = null;
      header.innerHTML = '';
      body.innerHTML = '';
      body.appendChild(el('h2', { text: 'Einstufung fertig' }));
      const p = (t) => body.appendChild(el('p', { text: t }));
      if (results.richtung) p(`Richtung bei Intervallen: sicher ab etwa ${fmtNum(results.richtung, 0)} Cent (2 Sekunden Klang).`);
      if (results.orten) p(`Orten im Dur-Dreiklang: sicher ab etwa ${fmtNum(results.orten, 0)} Cent (3 Sekunden Klang).`);
      if (results.stimmen !== undefined) p(`Stimmen: im Mittel ${fmtNum(results.stimmen, 1)} Cent am Ziel.`);
      p('Daraus stammen dein Startniveau je Thema und der erste Probenwert. Beides passt sich mit jeder Lektion an.');
      body.appendChild(el('div', { class: 'row-right' }, el('button', { class: 'btn primary', text: 'Zur Lektion', onclick: () => resolve(results) })));
    };

    ensureAudio().then(() => runPart(0));
  });
}
