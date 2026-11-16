// Verteilung der Stimmen im Stereobild.
// Zwei Töne: unten links, oben rechts. Dreiklang: Bass in der Mitte, der engere Abstand zum Bass (Terz oder Quarte) links,
// der weitere (Quinte oder Sexte) rechts. Über Kopfhörer löscht harte Trennung die Schwebungen fast aus; „Raum“ mischt beide Ohren.

export const LISTEN_MODES = {
  'kopf-raum': { name: 'Kopfhörer: Raum', width: 0.5, hint: 'Beide Ohren hören alle Stimmen. Schwebungen und Differenztöne bleiben hörbar.' },
  'kopf-getrennt': { name: 'Kopfhörer: getrennt', width: 1, hint: 'Stimmen hart links und rechts. Fast keine Schwebungen: Du hörst nur die Größe des Intervalls.' },
  boxen: { name: 'Lautsprecher', width: 1, hint: 'Volle Breite. Die Stimmen mischen sich im Raum, Schwebungen bleiben.' },
  mono: { name: 'Mono', width: 0, hint: 'Alles aus der Mitte, stärkste Schwebungen.' },
};

export function listenWidth(mode) {
  return (LISTEN_MODES[mode] || LISTEN_MODES['kopf-raum']).width;
}

/**
 * Grundpositionen (-1..1) für Stimmen, die von unten nach oben geordnet sind.
 * semis: Abstände der Stimmen zum Basston in Halbtönen, z. B. [0, 4, 7].
 */
export function basePositions(semis) {
  const n = semis.length;
  if (n === 1) return [0];
  if (n === 2) return [-1, 1];
  // Bass Mitte; obere Stimmen nach Abstand zum Bass: engster links, weitester rechts, dazwischen gleichmäßig
  const upper = semis.slice(1).map((s, i) => ({ s, i: i + 1 })).sort((a, b) => a.s - b.s);
  const pos = new Array(n).fill(0);
  upper.forEach((u, k) => {
    pos[u.i] = upper.length === 1 ? 1 : -1 + (2 * k) / (upper.length - 1);
  });
  return pos;
}

/** Positionen mit Abhörart und Stufenbreite (1 = weit, kleiner = enger) */
export function panFor(semis, mode, stageWidth = 1) {
  const w = listenWidth(mode) * stageWidth;
  return basePositions(semis).map((p) => p * w);
}
