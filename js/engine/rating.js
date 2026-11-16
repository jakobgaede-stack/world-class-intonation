// Adaptive Engine wie in World Class Ear: Niveau je Thema (0–100), Stufenwahl an der Lerngrenze, Verwechslungen, Wiederholabstände.
import { state, saveState, todayKey } from './state.js';

export const START_RATING = 22;
export const TARGET_OFFSET = 12; // Zielstufe = Niveau − 12 entspricht rund 80 % Trefferquote
const SPACING_DAYS = [1, 2, 4, 7, 14];

export function expected(rating, diff) {
  return 1 / (1 + Math.pow(10, (diff - rating) / 20));
}

export function skillStats(skillId) {
  if (!state.skills[skillId]) {
    state.skills[skillId] = { rating: START_RATING, n: 0, history: [], lastPracticed: null, stability: 0, dueAt: 0, todayDate: null, todayCount: 0, todayCorrect: 0, avgMs: null };
  }
  const s = state.skills[skillId];
  const tk = todayKey();
  if (s.todayDate !== tk) {
    s.todayDate = tk;
    s.todayCount = 0;
    s.todayCorrect = 0;
  }
  return s;
}

/** Niveau ohne Seiteneffekt lesen (legt keinen Eintrag an) */
export function ratingOf(skillId) {
  return state.skills[skillId] ? state.skills[skillId].rating : START_RATING;
}

/** Niveau nach der Einstufung setzen */
export function seedRating(skillId, rating) {
  const s = skillStats(skillId);
  s.rating = Math.max(0, Math.min(100, rating));
}

function kFactor(n) {
  if (n < 10) return 8;
  if (n < 40) return 4;
  return 2.5;
}

function nearestStage(stages, target) {
  let best = 0;
  let bestD = Infinity;
  stages.forEach((st, i) => {
    const d = Math.abs(st.diff - target);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/** Stufe für die nächste Aufgabe: meist die Zielstufe, gelegentlich eine leichter oder schwerer. */
export function chooseStage(skillId, stages, mode = 'normal') {
  const best = nearestStage(stages, ratingOf(skillId) - TARGET_OFFSET);
  if (mode === 'test') return best;
  const r = Math.random();
  if (r < 0.15 && best > 0) return best - 1;
  if (r > 0.85 && best < stages.length - 1) return best + 1;
  return best;
}

export function currentStageIndex(skillId, stages) {
  return nearestStage(stages, ratingOf(skillId) - TARGET_OFFSET);
}

/**
 * Antwort verbuchen.
 * rec: { skill, stage, diff, score (0..1), truth, answer, ms, weight, meta }
 */
export function recordAnswer(rec) {
  const s = skillStats(rec.skill);
  const p = expected(s.rating, rec.diff);
  let k = kFactor(s.n) * (rec.weight || 1);
  // Wer deutlich über der Stufe liegt, steigt schneller: nach sechs Treffern in Folge zählt jeder weitere doppelt
  const lastSix = s.history.slice(-6);
  if (rec.score >= 0.99 && lastSix.length === 6 && lastSix.every((h) => h.score >= 0.99)) k *= 2;
  s.rating = Math.max(0, Math.min(100, s.rating + k * (rec.score - p)));
  s.n++;
  s.todayCount++;
  if (rec.score >= 0.75) s.todayCorrect++;
  s.lastPracticed = Date.now();
  s.history.push({ t: Date.now(), score: Math.round(rec.score * 100) / 100, diff: rec.diff, r: Math.round(s.rating * 10) / 10 });
  if (s.history.length > 300) s.history.splice(0, s.history.length - 300);
  if (rec.ms) s.avgMs = s.avgMs ? s.avgMs * 0.9 + rec.ms * 0.1 : rec.ms;
  if (rec.truth !== undefined && rec.answer !== undefined) {
    const cm = (state.confusion[rec.skill] ||= {});
    const row = (cm[rec.truth] ||= {});
    row[rec.answer] = (row[rec.answer] || 0) + 1;
  }
  logAnswer(rec);
  updateStreak();
  saveState();
  return s;
}

/** Antwort nur protokollieren (Probencheck, Einstufung): ohne Einfluss auf das Niveau. */
export function logAnswer(rec) {
  state.answers.push({ t: Date.now(), skill: rec.skill, stage: rec.stage, diff: rec.diff, score: rec.score, truth: rec.truth, answer: rec.answer, ms: rec.ms, meta: rec.meta || null });
  if (state.answers.length > 6000) state.answers.splice(0, state.answers.length - 6000);
}

export function updateStreak() {
  const tk = todayKey();
  const st = state.streak;
  if (st.lastDate === tk) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  st.current = st.lastDate === todayKey(y) ? st.current + 1 : 1;
  st.lastDate = tk;
}

/** Nach einem Block: Wiederholabstand anpassen (Trefferquote der letzten 20 Antworten) */
export function closeBlock(skillId) {
  if (!state.skills[skillId]) return;
  const s = skillStats(skillId);
  const recent = s.history.slice(-20);
  if (recent.length < 10) {
    s.stability = 0;
    s.dueAt = Date.now() + 86400000;
    saveState();
    return;
  }
  const acc = recent.reduce((a, h) => a + h.score, 0) / recent.length;
  if (acc >= 0.8) {
    const idx = SPACING_DAYS.indexOf(s.stability);
    s.stability = SPACING_DAYS[Math.min(idx + 1, SPACING_DAYS.length - 1)] || 1;
  } else if (acc < 0.7) {
    s.stability = 1;
  } else {
    s.stability = s.stability || 1;
  }
  s.dueAt = Date.now() + s.stability * 86400000;
  saveState();
}

/** Trefferquote der letzten n Antworten (null, wenn noch keine) */
export function recentAccuracy(skillId, n = 20) {
  const s = state.skills[skillId];
  if (!s || !s.history.length) return null;
  const recent = s.history.slice(-n);
  return recent.reduce((a, h) => a + h.score, 0) / recent.length;
}

/** Die häufigsten Verwechslungen eines Themas: [{truth, answer, count}] */
export function topConfusions(skillId, limit = 3) {
  const cm = state.confusion[skillId] || {};
  const list = [];
  for (const truth of Object.keys(cm))
    for (const answer of Object.keys(cm[truth]))
      if (truth !== answer) list.push({ truth, answer, count: cm[truth][answer] });
  list.sort((a, b) => b.count - a.count);
  return list.slice(0, limit);
}

export function overdueDays(skillId) {
  const s = state.skills[skillId];
  if (!s || !s.lastPracticed) return 3;
  return Math.max(0, (Date.now() - s.dueAt) / 86400000);
}
