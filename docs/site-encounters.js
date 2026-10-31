import { storyDraw } from './story-random.js';

// Optional landmark scenes are separate from evidence and walking encounters.
// Each pool declares its campaign guarantees; the selector and validator use
// those declarations without knowing which scene offers an ending.
export const SITE_SCENES = {
  cooking: {
    id: 'cooking', site: 'pump', title: 'Something warm.', art: 'stove',
    cue: 'A sweet cooking smell drifts from behind the treatment drums.',
    label: 'Follow the cooking smell',
    text: 'Corn boils on a stove beside the treatment drums. Butter, salt, and a clean plate wait. The sweet smell makes your stomach ache. You cannot remember when you last ate.',
    note: 'A notice above the stove reads: DO NOT CONSUME THE CROP.',
    action: 'eat-crop', actionLabel: 'Butter an ear. Take a bite.', closeLabel: 'Leave it untouched.'
  },
  'pump-drips': {
    id: 'pump-drips', site: 'pump', title: 'The tap counts backward.', art: 'pump-drips',
    cue: 'A slow tapping comes from the dry basin behind the treatment drums.',
    label: 'Listen beside the basin',
    text: 'Five drops strike the basin. A pause, then four. You look beneath the tap. The metal is dry. Three more drops sound, then two. You wait for the last one. It lands inside the pipe, above your head.',
    closeLabel: 'Return to the path.'
  },
  'pump-glass': {
    id: 'pump-glass', site: 'pump', title: 'On the inside of the glass.', art: 'pump-glass',
    cue: 'A pale mark is spreading across a pressure gauge beside the drums.',
    label: 'Look at the pressure gauge',
    text: 'The gauge has no needle. Condensation clouds its glass from inside. Five narrow lines clear through the mist, like fingertips resting against it. You wipe the outside with your sleeve. The marks stay where they are.',
    closeLabel: 'Return to the path.'
  },
  'pump-ledger': {
    id: 'pump-ledger', site: 'pump', title: 'Someone kept your place.', art: 'pump-ledger',
    cue: 'Paper rustles on the pump-house shelf, although the air is still.',
    label: 'Check the rustling paper',
    text: 'An old ledger lies open beside the pipes. One blank page lifts and settles. Beneath it, the damp paper bears the outline of a hand. You hold your own hand above it. The thumb is on the wrong side.',
    closeLabel: 'Return to the path.'
  },
  'pump-keys': {
    id: 'pump-keys', site: 'pump', title: 'One shadow too many.', art: 'pump-keys',
    cue: 'The keys on a wall hook cast more shadows than they should.',
    label: 'Count the keys and shadows',
    text: 'Two old keys hang from one hook. The warm bulb above them throws three clear shadows. You cover one key with your glove. Two shadows remain. The covered key feels cold enough to hurt.',
    closeLabel: 'Return to the path.'
  },
  'pump-thread': {
    id: 'pump-thread', site: 'pump', title: 'A spool around the valve.', art: 'pump-thread',
    cue: 'A pale thread trails from a rusted valve toward the floor.',
    label: 'Examine the wound roots',
    text: 'Pale roots wind around the stem of a dry, rusted valve, layer over layer. You watch; nothing moves. You glance at the door. When you look back, the loose end has crossed the pipe. The valve has not turned.',
    closeLabel: 'Return to the path.'
  },
  'pump-window': {
    id: 'pump-window', site: 'pump', title: 'The view is upside down.', art: 'pump-window',
    cue: 'A narrow window shows a strip of sky beneath the crop.',
    label: 'Look through the dusty window',
    text: 'Through a dusty window, corn hangs upside down above a strip of dark sky. You wipe a patch of glass. The view stays upside down. A clear line spreads across the dust from the other side, then stops.',
    closeLabel: 'Return to the path.'
  }
};

export const SITE_POOLS = {
  pump: { nights: 3, required: ['cooking'], alternatives: ['pump-drips', 'pump-glass', 'pump-ledger', 'pump-keys', 'pump-thread', 'pump-window'] }
};

function shuffle(items, seed, key) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = storyDraw(seed, `${key}:${index}`) % (index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

export function freshSiteStories(seed) {
  return Object.fromEntries(Object.entries(SITE_POOLS).map(([site, pool]) => {
    const alternatives = shuffle(pool.alternatives, seed, `site:${site}:alternatives`)
      .slice(0, pool.nights - pool.required.length);
    return [site, shuffle([...pool.required, ...alternatives], seed, `site:${site}:nights`)];
  }));
}

export function siteScene(s, site) {
  const id = s.siteStories?.[site]?.[s.shift];
  const scene = id && SITE_SCENES[id];
  return scene?.site === site ? scene : null;
}

function moveScene(plan, id, night) {
  const original = plan.indexOf(id);
  if (original >= 0 && night >= 0 && night < plan.length) [plan[original], plan[night]] = [plan[night], plan[original]];
}

export function migrateSiteStories(s) {
  if (s.siteStories !== undefined) return;
  const seed = s.runId ?? s.rng;
  s.siteStories = freshSiteStories(seed);
  // Older builds offered cooking after every pump inspection. Keep a currently
  // offered meal available, including when its player has walked away already.
  const evidenceNight = ['ledger', 'sample', 'glove'].findIndex(id => s.evidence?.includes(id));
  if (s.ending === 'consumption' || (s.phase === 'field' && s.inspected?.includes('pump'))) {
    moveScene(s.siteStories.pump, 'cooking', s.shift);
  } else if (evidenceNight >= 0) {
    // The earliest recorded visit already supplied the old cooking opportunity.
    moveScene(s.siteStories.pump, 'cooking', evidenceNight);
  } else {
    // An unvisited older campaign must not draw its only opportunity in the past.
    const pool = SITE_POOLS.pump;
    const currentNightOpen = ['briefing', 'tower', 'decision', 'field'].includes(s.phase);
    const firstNight = Math.min(pool.nights - 1, Math.max(0, s.shift + (currentNightOpen ? 0 : 1)));
    const night = firstNight + storyDraw(seed, 'site:pump:migrate') % (pool.nights - firstNight);
    moveScene(s.siteStories.pump, 'cooking', night);
  }
}

export function validSiteStories(s) {
  const stories = s.siteStories, sites = Object.keys(SITE_POOLS);
  if (!stories || typeof stories !== 'object' || Array.isArray(stories) ||
      Object.keys(stories).length !== sites.length || Object.keys(stories).some(site => !Object.hasOwn(SITE_POOLS, site))) return false;
  return sites.every(site => {
    const pool = SITE_POOLS[site], plan = stories[site], allowed = [...pool.required, ...pool.alternatives];
    return Array.isArray(plan) && plan.length === pool.nights && new Set(plan).size === plan.length &&
      [...plan].every(id => typeof id === 'string' && allowed.includes(id) && SITE_SCENES[id]?.site === site) &&
      pool.required.every(id => plan.filter(value => value === id).length === 1);
  });
}
