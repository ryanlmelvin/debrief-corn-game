export const SHARE_ROOT = 'https://ryanlmelvin.github.io/debrief-corn-game/';
// Only these teasers go into shared links. Never include testimony or ending prose.
export const ENDING_SHARES = {
  witness: { code: '01', line: 'I kept the receipts.', art: 'debrief-desk', alt: 'A lamp lights a tape recorder and papers on a desk.' },
  guide: { code: '02', line: 'I took the scenic route.', art: 'encounter-lantern', alt: 'A lantern waits between the corn rows.' },
  guide_shot: { code: '10', line: 'I shot the sheriff. And the deputy. And some third guy.', art: 'encounter-unattended-lamp', alt: 'An unattended lantern and an open equipment case among the corn rows.' },
  guide_arrested: { code: '08', line: 'I made it a police matter.', art: 'encounter-unattended-lamp', alt: 'An unattended lantern and an open equipment case among the corn rows.' },
  guide_interrupted: { code: '09', line: 'I went off script.', art: 'debrief-desk', alt: 'A lamp lights a tape recorder and papers on a desk.' },
  compliance: { code: '03', line: 'I was just following orders.', art: 'field-sighting', alt: 'Corn stands beyond the watchtower at night.' },
  dissent: { code: '04', line: 'I made it an HR problem.', art: 'encounter-radio', alt: 'A field radio waits in the dark.' },
  breach: { code: '05', line: 'I had one job.', art: 'field-corner', alt: 'A fence marks the edge of a dark cornfield.' },
  assimilation: { code: '06', line: 'I let the intrusive thoughts win.', art: 'encounter-tracks', alt: 'Footprints and exposed roots mark a muddy path between corn rows.' },
  consumption: { code: '07', line: 'I ate the corn.', art: 'pump-stove', alt: 'Corn boils on a camping stove beside a plate and butter.' },
  relief: { code: '11', line: 'I trained my replacement. He’s me.', art: 'ending-relief', alt: 'Two guards in matching coats exchange a badge beneath a watchtower.' },
  witness_present: { code: '12', line: 'I brought a plus-one.', art: 'ending-witness', alt: 'An empty chair waits across from a running recorder in the interview room.' },
  rescue: { code: '13', line: 'I chose people over paperwork.', art: 'ending-rescue', alt: 'A guard helps an exhausted person out of the corn toward the road.' },
  vacancy: { code: '14', line: 'I became the problem.', art: 'ending-vacancy', alt: 'An uncapped pen and release form wait at an empty supervisor’s chair.' },
  transmission: { code: '15', line: 'I took my own advice.', art: 'ending-transmission', alt: 'A radio in one wooden tower overlooks another light above the corn.' }
};

export const GUIDE_TEAM_SHARE = ENDING_SHARES.guide_shot;

export function endingShareData(ending, collected = null, stamp = null) {
  if (!Object.hasOwn(ENDING_SHARES, ending)) return null;
  const card = ending === 'guide' && stamp === 'PERIMETER SECURED' ? GUIDE_TEAM_SHARE : ending === 'guide' && ['TAKEN INTO CUSTODY','PERSONNEL INCIDENT'].includes(stamp) ? ENDING_SHARES.guide_arrested : ENDING_SHARES[ending];
  let text = card.line;
  if (Array.isArray(collected)) {
    const found = new Set([...collected, ending].filter(id => Object.hasOwn(ENDING_SHARES, id))).size;
    text += `\nI've achieved ${found} of ${Object.keys(ENDING_SHARES).length} endings.`;
  }
  return { title: `${card.line} — DEBRIEF`, text, url: `${SHARE_ROOT}share/${card.code}/` };
}

export async function shareEnding(ending, platform = navigator, collected = null, stamp = null) {
  const data = endingShareData(ending, collected, stamp);
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
