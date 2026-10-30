export const SHARE_ROOT = 'https://ryanlmelvin.github.io/debrief-corn-game/';
// Only these teasers go into shared links. Never include testimony or ending prose.
export const ENDING_SHARES = {
  witness: { code: '01', line: 'I kept the receipts.', art: 'debrief-desk', alt: 'A lamp lights a tape recorder and papers on a desk.' },
  guide: { code: '02', line: 'I knew the way.', art: 'encounter-lantern', alt: 'A lantern waits between the corn rows.' },
  compliance: { code: '03', line: 'I followed procedure.', art: 'field-sighting', alt: 'Corn stands beyond the watchtower at night.' },
  dissent: { code: '04', line: 'I put it on the record.', art: 'encounter-radio', alt: 'A field radio waits in the dark.' },
  breach: { code: '05', line: 'I missed a few.', art: 'field-corner', alt: 'A fence marks the edge of a dark cornfield.' },
  assimilation: { code: '06', line: 'I stayed a little too long.', art: 'encounter-tracks', alt: 'Footprints and exposed roots mark a muddy path between corn rows.' },
  consumption: { code: '07', line: 'I ate the corn.', art: 'pump-stove', alt: 'Corn boils on a camping stove beside a plate and butter.' }
};

export function endingShareData(ending, collected = null) {
  if (!Object.hasOwn(ENDING_SHARES, ending)) return null;
  const card = ENDING_SHARES[ending];
  let text = card.line;
  if (Array.isArray(collected)) {
    const found = new Set([...collected, ending].filter(id => Object.hasOwn(ENDING_SHARES, id))).size;
    text += `\nI've found ${found} of ${Object.keys(ENDING_SHARES).length} endings.`;
  }
  return { title: `${card.line} — DEBRIEF`, text, url: `${SHARE_ROOT}share/${card.code}/` };
}

export async function shareEnding(ending, platform = navigator, collected = null) {
  const data = endingShareData(ending, collected);
  if (!data) return 'unavailable';
  if (typeof platform.share === 'function') {
    try {
      // Call immediately from the player's click, retaining user activation.
      await platform.share(data);
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await platform.clipboard.writeText(`${data.text}\n${data.url}`);
    return 'copied';
  } catch {
    return 'manual';
  }
}
