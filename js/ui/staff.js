// Kleines Notenbild für einen Zusammenklang: ganze Noten auf einem System (oder zwei), mit Vorzeichen und Instrumentennamen.
// Schlüssel sind als Pfade gezeichnet, damit sie auf jedem Gerät gleich aussehen.
const NS = 'http://www.w3.org/2000/svg';
const GAP = 10; // Abstand zweier Notenlinien
const INK = '#16181d';
const X0 = 10;
const STAFF_END = 166;
const NOTE_X = 112;
const LABEL_X = 178;
const WIDTH = 320;

function svg(tag, attrs = {}, text = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  return e;
}

// diatonische Position: C0 = 0, je Stammton +1
function dia(sp) {
  return sp.octave * 7 + sp.letter;
}

// bottom = diatonische Position der untersten Linie (Violinschlüssel e′, Bassschlüssel G)
const CLEFS = { treble: { bottom: 30 }, bass: { bottom: 18 } };

function drawClef(root, kind, yTop) {
  const g = svg('g', { transform: `translate(${X0 + 6},${yTop})`, fill: 'none', stroke: INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (kind === 'treble') {
    g.setAttribute('stroke-width', '2.3');
    g.appendChild(svg('path', { d: 'M10.5 50 C11 56 19.5 55.5 19 47.5 L14 3 C13 -7 21 -13 21.8 -3.5 C22.6 6 8 12.5 6.6 24.5 C5.2 36.5 14 42.5 21 38.5 C27.5 34.5 25.5 24.2 17.6 24.2 C11 24.2 9.6 31 13 34.6' }));
    g.appendChild(svg('circle', { cx: 10.5, cy: 50, r: 2.5, fill: INK, stroke: 'none' }));
  } else {
    g.setAttribute('stroke-width', '2.6');
    g.appendChild(svg('path', { d: 'M7 11.5 C6 2.5 22 -2.5 23.5 10.5 C24.6 21.5 14.5 30.5 4 36.5' }));
    g.appendChild(svg('circle', { cx: 7.2, cy: 11.5, r: 3, fill: INK, stroke: 'none' }));
    g.appendChild(svg('circle', { cx: 29.5, cy: 5, r: 2, fill: INK, stroke: 'none' }));
    g.appendChild(svg('circle', { cx: 29.5, cy: 15, r: 2, fill: INK, stroke: 'none' }));
  }
  root.appendChild(g);
}

/**
 * notes: [{ sp: {letter, acc, octave, midi}, label }] von unten nach oben.
 * Rückgabe: SVG-Element.
 */
export function renderStaff(notes) {
  const midis = notes.map((n) => n.sp.midi);
  const lowest = Math.min(...midis);
  const highest = Math.max(...midis);
  let staves;
  if (lowest >= 57) staves = ['treble'];
  else if (highest <= 62) staves = ['bass'];
  else staves = ['treble', 'bass'];
  const assign = (n) => (staves.length === 1 ? staves[0] : n.sp.midi >= 60 ? 'treble' : 'bass');
  const posOf = (n) => dia(n.sp) - CLEFS[assign(n)].bottom; // 0 = unterste Linie, 8 = oberste

  // Platzbedarf über dem obersten und unter dem untersten System (Noten und Schlüssel)
  let above = staves[0] === 'treble' ? 3 : 0;
  let below = staves[staves.length - 1] === 'treble' ? 4 : 0;
  for (const n of notes) {
    const p = posOf(n);
    const st = assign(n);
    if (st === staves[0]) above = Math.max(above, p - 8);
    if (st === staves[staves.length - 1]) below = Math.max(below, -p);
  }
  const padTop = 12 + above * (GAP / 2);
  const padBottom = 12 + below * (GAP / 2);
  const staffH = 4 * GAP;
  const between = 44;
  const height = padTop + staves.length * staffH + (staves.length - 1) * between + padBottom;
  const root = svg('svg', { viewBox: `0 0 ${WIDTH} ${height}`, width: WIDTH, height, role: 'img', 'aria-label': 'Notenbild' });

  const bottomY = {};
  staves.forEach((st, i) => {
    const y = padTop + i * (staffH + between);
    bottomY[st] = y + staffH;
    for (let l = 0; l < 5; l++) root.appendChild(svg('line', { x1: X0, x2: STAFF_END, y1: y + l * GAP, y2: y + l * GAP, stroke: INK, 'stroke-width': 1 }));
    drawClef(root, st, y);
  });
  if (staves.length === 2) {
    root.appendChild(svg('line', { x1: X0, x2: X0, y1: padTop, y2: bottomY.bass, stroke: INK, 'stroke-width': 1.5 }));
    root.appendChild(svg('line', { x1: STAFF_END, x2: STAFF_END, y1: padTop, y2: bottomY.bass, stroke: INK, 'stroke-width': 1 }));
  }

  // Noten: bei Sekunden und im Einklang seitlich versetzen
  const placed = [];
  for (const n of notes) {
    const st = assign(n);
    const p = posOf(n);
    const y = bottomY[st] - p * (GAP / 2);
    const prev = placed[placed.length - 1];
    const x = prev && prev.st === st && Math.abs(prev.p - p) <= 1 && prev.x === NOTE_X ? NOTE_X + 16 : NOTE_X;
    placed.push({ n, st, p, y, x });
  }
  let accCol = 0;
  let lastAccY = -100;
  for (const pl of [...placed].reverse()) {
    const { n, p, y, x, st } = pl;
    const ledger = (q) => root.appendChild(svg('line', { x1: x - 12, x2: x + 12, y1: bottomY[st] - q * (GAP / 2), y2: bottomY[st] - q * (GAP / 2), stroke: INK, 'stroke-width': 1 }));
    for (let q = -2; q >= p; q -= 2) ledger(q);
    for (let q = 10; q <= p; q += 2) ledger(q);
    root.appendChild(svg('ellipse', { cx: x, cy: y, rx: 7, ry: 4.3, fill: '#fff', stroke: INK, 'stroke-width': 1.8, transform: `rotate(-18 ${x} ${y})` }));
    if (n.sp.acc) {
      // Vorzeichen eng beieinander nach links staffeln
      accCol = Math.abs(y - lastAccY) < 16 ? accCol + 1 : 0;
      lastAccY = y;
      const sign = n.sp.acc === 1 ? '♯' : n.sp.acc === -1 ? '♭' : n.sp.acc === 2 ? '×' : '♭♭';
      root.appendChild(svg('text', { x: NOTE_X - 16 - accCol * 12, y: y + 6, 'font-size': 19, 'text-anchor': 'end', fill: INK, 'font-family': '"Apple Symbols","Noto Music","Segoe UI Symbol","Arial Unicode MS",serif' }, sign));
    }
  }
  // Instrumentennamen rechts vom System, mit Mindestabstand untereinander
  const labels = placed.map((pl) => ({ y: pl.y, text: pl.n.label, from: pl })).sort((a, b) => a.y - b.y);
  let prevY = -100;
  for (const l of labels) {
    const y = Math.max(l.y, prevY + 14);
    prevY = y;
    root.appendChild(svg('line', { x1: l.from.x + 11, x2: LABEL_X - 5, y1: l.from.y, y2: y, stroke: '#9aa0ad', 'stroke-width': 0.8 }));
    root.appendChild(svg('text', { x: LABEL_X, y: y + 4.5, 'font-size': 13, fill: INK, 'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }, l.text));
  }
  // Höhe an die unterste Beschriftung anpassen
  const total = Math.max(height, prevY + 12);
  root.setAttribute('viewBox', `0 0 ${WIDTH} ${total}`);
  root.setAttribute('height', total);
  return root;
}
