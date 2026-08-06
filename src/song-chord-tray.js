function cleanChordText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function collectUniqueSongChords(events) {
  const output = [];
  const seen = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    const displayChord = cleanChordText(event?.displayChord ?? event?.chord);
    const soundChord = cleanChordText(event?.soundChord ?? event?.chord ?? displayChord);
    if (!displayChord || displayChord === '—' || seen.has(displayChord)) continue;
    seen.add(displayChord);
    output.push({ displayChord, soundChord: soundChord || displayChord });
  }
  return output;
}

export function nextChordVariationIndex(currentIndex, total, delta) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  if (count <= 1) return 0;
  const current = Math.floor(Number(currentIndex) || 0);
  const step = Math.trunc(Number(delta) || 0);
  return ((current + step) % count + count) % count;
}

export function chordVariationCounter(index, total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  if (!count) return '0/0';
  const safeIndex = Math.min(count - 1, Math.max(0, Math.floor(Number(index) || 0)));
  return `${safeIndex + 1}/${count}`;
}

export function voicingFretLabel(voicing) {
  const frets = Array.isArray(voicing?.frets)
    ? voicing.frets.filter((fret) => Number.isInteger(fret) && fret > 0)
    : [];
  if (!frets.length) return 'Open';
  const minimum = Math.min(...frets);
  const maximum = Math.max(...frets);
  const hasOpenString = voicing.frets.some((fret) => fret === 0);
  if (hasOpenString && maximum <= 4) {
    return minimum === maximum ? `Open · fret ${minimum}` : `Open · frets ${minimum}–${maximum}`;
  }
  return minimum === maximum ? `Fret ${minimum}` : `Frets ${minimum}–${maximum}`;
}
