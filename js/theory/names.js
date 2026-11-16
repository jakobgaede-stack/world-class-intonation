// Tonnamen: deutsch mit H und B, Oktavlage nach Helmholtz; Schreibweise nach dem Intervall zum Basston.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// Standardschreibweise je Tonklasse: [Stammton-Index, Vorzeichen]
const SPELL_DEFAULT = [[0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
// Grundtöne von Dur- und Mollakkorden (vermeidet Doppelvorzeichen in den Akkordtönen)
const SPELL_MAJOR_ROOT = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
const SPELL_MINOR_ROOT = [[0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0]];

function germanName(letter, acc) {
  const L = LETTERS[letter];
  if (acc === 0) return L;
  if (acc === 1) return L + 'is';
  if (acc === 2) return L + 'isis';
  if (acc === -1) {
    if (L === 'H') return 'B';
    if (L === 'E') return 'Es';
    if (L === 'A') return 'As';
    return L + 'es';
  }
  if (L === 'H') return 'Heses';
  if (L === 'E') return 'Eses';
  if (L === 'A') return 'Asas';
  return L + 'eses';
}

function octaveMark(name, octave) {
  // octave: wissenschaftliche Zählung des Stammtons (c′ = 4, kleines c = 3, großes C = 2, Kontra-C = 1)
  if (octave >= 3) {
    const marks = ['', '′', '″', '‴', '⁗', '⁗′'];
    return name.charAt(0).toLowerCase() + name.slice(1) + (marks[octave - 3] ?? '');
  }
  if (octave === 2) return name;
  const subs = { 1: '₁', 0: '₂', '-1': '₃' };
  return name + (subs[String(octave)] || '');
}

/** Schreibweise eines MIDI-Tons: {letter, acc, octave} */
export function spell(midi, table = SPELL_DEFAULT) {
  const pc = ((midi % 12) + 12) % 12;
  const [letter, acc] = table[pc];
  // Oktave des Stammtons: Ces liegt eine Oktave höher als der Klang vermuten lässt, His eine tiefer
  const natural = midi - acc;
  const octave = Math.floor(natural / 12) - 1;
  return { letter, acc, octave, midi };
}

/** Oberen Ton passend zum Intervall über einem geschriebenen Basston schreiben (steps = diatonische Schritte). */
export function spellAbove(base, midi, steps) {
  const idx = base.letter + steps;
  const letter = ((idx % 7) + 7) % 7;
  const octave = base.octave + Math.floor(idx / 7);
  const natural = (octave + 1) * 12 + LETTER_PC[letter];
  const acc = midi - natural;
  if (Math.abs(acc) > 1) return spell(midi);
  return { letter, acc, octave, midi };
}

export function rootTable(chordId) {
  return chordId === 'min' ? SPELL_MINOR_ROOT : SPELL_MAJOR_ROOT;
}

/** Deutscher Tonname mit Oktavlage, z. B. „cis″“, „B“, „Es₁“ */
export function noteName(sp) {
  return octaveMark(germanName(sp.letter, sp.acc), sp.octave);
}

export function midiName(midi) {
  return noteName(spell(midi));
}

/** Tonname ohne Oktavlage, groß geschrieben (für Akkordnamen: „Es-Dur“) */
export function pitchClassName(sp) {
  return germanName(sp.letter, sp.acc);
}
