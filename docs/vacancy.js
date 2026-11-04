import { EVIDENCE, evidenceForState } from './evidence-scenes.js';
import { encounterForState } from './encounters.js';

// The interview owns its shuffle. Reading, playing, saving, or previewing it
// never advances the assignment's random stream or rewrites its evidence.
export const VACANCY = Object.freeze({ rounds: 3, turns: 3, actions: 2, hand: 5, scrutinyLimit: 7, approvalLimit: 3 });
const ROUNDS = Object.freeze([
  { title: 'The missing personnel', topic: 'personnel', goal: 7, prompt: '“People were seen in the field. Account for them without opening a personnel incident.”', objection: '“You have left room for another question. Close it.”' },
  { title: 'The treatment record', topic: 'treatment', goal: 9, prompt: '“The application amounts keep increasing. Explain why the treatment may continue.”', objection: '“That still sounds like a reason to stop the applications.”' },
  { title: 'The boundary', topic: 'boundary', goal: 11, prompt: '“Whatever happened here stays within this station’s jurisdiction. Make the report say so.”', objection: '“Someone outside this department could still read that differently.”' }
]);
const TOPICS = { dress: 'personnel', badge: 'personnel', teeth: 'personnel', glove: 'personnel', ledger: 'treatment', sample: 'treatment', roots: 'boundary', water: 'boundary', map: 'boundary' };
const TAPES = { 'first-call': 'First radio recording', 'future-call': 'Future interview recording' };
const MOVES = {
  comply: { title: 'Routine Movement', progress: 2, scrutiny: -1, description: 'Use the routine account to steady the report.' },
  redact: { title: 'Reclassify', progress: 1, scrutiny: -2, description: 'Remove an awkward implication. Your next evidence card gains 2 approval.', amendment: 2 },
  sign: { title: 'Prior Approval', progress: 3, scrutiny: 0, description: 'A report already carrying your signature is an accepted precedent.' },
  truth: { title: 'On Record', progress: 2, scrutiny: -1, description: 'Your recorded statement pins down what can still be disputed.' },
  evidence: { title: 'Documented Observation', progress: 2, scrutiny: -1, description: 'Refer to an observation you put on the record.' },
  'field-notes': { title: 'Private Notes', progress: 2, scrutiny: -1, description: 'Your notes establish which account the department has to answer.' },
  question: { title: 'Request Authority', progress: 1, scrutiny: -3, description: 'Make the supervisor answer for the order before he can question your wording.' }
};
const PROCEDURES = {
  scope: { title: 'Narrow Scope', progress: 4, scrutiny: -1, description: '“A report cannot be wrong about something it does not cover.”' },
  authority: { title: 'Delegated Authority', progress: 5, scrutiny: 1, description: '“Write the decision as an order. Someone else can explain it.”' },
  record: { title: 'Closed Session', progress: 2, scrutiny: -3, description: '“The objection can remain in the room.”' },
  precedent: { title: 'Standing Precedent', progress: 4, scrutiny: 0, description: '“The last approved report already settled this.”' }
};
// V4 makes authority costly and relief deliberately low in approval. Keep the
// earlier rule tables and source descriptions intact for validated old saves.
const V4_MOVES = {
  comply: { progress: 1, scrutiny: -3 },
  redact: { progress: 1, scrutiny: -4, amendment: 2 },
  sign: { progress: 3, scrutiny: 2 },
  truth: { progress: 3, scrutiny: 2 },
  evidence: { progress: 3, scrutiny: 2 },
  'field-notes': { progress: 3, scrutiny: 2 },
  question: { progress: 1, scrutiny: -3 }
};
const V4_PROCEDURES = { scope: { progress: 2, scrutiny: -4 }, precedent: { progress: 4, scrutiny: 2 } };
// Three claims now exceed the scrutiny limit even from zero. Relief must be
// timed between them; spending every calming card first is no longer a win.
const V5_MOVES = {
  comply: { progress: 1, scrutiny: -4 },
  redact: { progress: 1, scrutiny: -4, amendment: 2 },
  sign: { progress: 3, scrutiny: 3 },
  truth: { progress: 3, scrutiny: 3 },
  evidence: { progress: 3, scrutiny: 3 },
  'field-notes': { progress: 3, scrutiny: 3 },
  question: { progress: 1, scrutiny: -4 }
};
const V5_PROCEDURES = { scope: { progress: 2, scrutiny: -5 }, precedent: { progress: 4, scrutiny: 3 } };
const OFFERS = [['scope', 'authority'], ['record', 'precedent']];
const SOURCE_KEYS = ['id', 'kind', 'move', 'title', 'description', 'source', 'quote', 'topic'];
const STATE_KEYS = ['version', 'seed', 'cards', 'rng', 'stage', 'round', 'turn', 'actions', 'progress', 'scrutiny', 'amendment', 'deck', 'draw', 'discard', 'hand', 'awards', 'history', 'message'];
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const exactKeys = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === keys.length && keys.every(key => Object.hasOwn(obj, key));
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function seedFor(game) {
  let hash = 2166136261;
  for (const c of String(game?.runId ?? 'vacancy')) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash || 1;
}

export function vacancyStartingDeck(game) {
  const cards = [];
  for (const id of [...new Set(game?.evidence || [])]) {
    if (!Object.hasOwn(EVIDENCE, id)) continue;
    const exhibit = evidenceForState(game, id);
    cards.push({ id: `evidence-${id}`, kind: 'evidence', move: id, title: exhibit.canonicalTitle,
      description: 'An exhibit from your own investigation. Relevant evidence advances the report faster, but invites scrutiny.',
      source: `${exhibit.code} · ${exhibit.where}`, quote: exhibit.text, topic: TOPICS[id] });
  }
  if (!game?.resolution?.recordingsRelinquished) for (const [id, title] of Object.entries(TAPES)) {
    const receipt = game?.fieldEvents?.journal?.find(entry => entry.id === id && entry.choice === 'record');
    if (!receipt) continue;
    const encounter = encounterForState(game, id), recording = encounter?.choices.find(choice => choice.id === receipt.choice);
    if (!recording) continue;
    cards.push({ id: `evidence-${id}`, kind: 'evidence', move: id, title,
      description: 'A tape you actually recorded in the field. It supports your account, but invites scrutiny.',
      source: `Your field recording · Shift ${encounter.night + 1}`, quote: recording.result, topic: 'personnel' });
  }
  // Only the ordinary debrief belongs in the starting deck. Optional-route
  // transcripts and previous attempts must not manufacture extra cards.
  (game?.reports || []).filter(report => !report.kind && Object.hasOwn(MOVES, report.choice)).forEach((report, index) => {
    const move = MOVES[report.choice];
    cards.push({ id: `answer-${index}-${report.choice}`, kind: 'testimony', move: report.choice, title: move.title,
      description: move.description, source: `Your debrief · Shift ${report.shift + 1}`, quote: String(report.answer || ''), topic: '' });
  });
  return cards;
}
function random(r) { r.rng = (Math.imul(1664525, r.rng) + 1013904223) >>> 0; return r.rng / 4294967296; }
function shuffle(r, ids) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(r) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function cardFor(r, id) {
  if (id.startsWith('procedure-')) {
    const key = id.slice(10), move = PROCEDURES[key];
    return move ? { id, kind: 'procedure', move: key, title: move.title, description: move.description,
      source: 'Learned from the supervisor', quote: move.description, topic: '' } : null;
  }
  return r.cards.find(card => card.id === id) || null;
}
function drawHand(r, initial = false) {
  const desired = Math.min(VACANCY.hand, r.deck.length);
  while (r.hand.length < desired && (r.draw.length || r.discard.length)) {
    if (!r.draw.length) { r.draw = shuffle(r, r.discard); r.discard = []; }
    r.hand.push(r.draw.shift());
  }
  if (initial) {
    if (r.version >= 4) {
      // The real entry gate requires both signatures and at least two other
      // comply/redact receipts. No invented support card is necessary.
      const signatures = r.cards.filter(card => card.kind === 'testimony' && card.move === 'sign').slice(0, 2).map(card => card.id);
      const support = [...r.hand, ...r.draw].find(id => {
        const card = cardFor(r, id); return card.kind === 'testimony' && ['comply', 'redact'].includes(card.move);
      });
      const required = [...signatures, ...(support ? [support] : []), ...r.awards];
      // Constructive proof, independent of filler cards and every shuffle:
      // V5 file 1: signature, signature, support reaches 7 at scrutiny 2.
      // From any carried 0–6, scope -> signature -> support -> signature
      // closes file 2 at <=3. On file 3 insert precedent after support:
      // the same five-card argument closes at <=6. V4's gentler effects
      // also preserve these sequences; no randomized filler is needed.
      // All cards for those sequences are visible in each single opening hand.
      for (const id of required) {
        if (r.hand.includes(id)) continue;
        const from = r.draw.indexOf(id), slot = r.hand.findIndex(entry => !required.includes(entry));
        if (from >= 0 && slot >= 0) [r.draw[from], r.hand[slot]] = [r.hand[slot], r.draw[from]];
      }
      return;
    }
    if (r.version >= 2) {
      // The entry gate guarantees two actual signed reports and other ordinary
      // replies. Put a complete winning argument in the first hand, so its
      // execution never depends on a later shuffle.
      // R1: two signatures (6), then any other reply (>=1, no added scrutiny).
      // R2: the first procedure (>=4) plus both signatures (6).
      // R3: both procedures (>=6) plus both signatures (6).
      // V2 kept unused cards across its two exchanges. V3 has one hand per
      // file: scope and precedent are automatic, and the later winning
      // arguments add no scrutiny, even if the previous file closed at 6.
      const signatures = r.cards.filter(card => card.kind === 'testimony' && card.move === 'sign').slice(0, 2).map(card => card.id);
      const reply = r.cards.find(card => card.kind === 'testimony' && card.move !== 'sign')?.id
        || (r.version >= 3 ? r.cards.find(card => card.kind === 'evidence')?.id : undefined);
      const required = [...signatures, ...(r.round === 0 ? reply ? [reply] : [] : r.awards)];
      for (const id of required) {
        if (r.hand.includes(id)) continue;
        const from = r.draw.indexOf(id), slot = r.hand.findIndex(entry => !required.includes(entry));
        if (from >= 0 && slot >= 0) [r.draw[from], r.hand[slot]] = [r.hand[slot], r.draw[from]];
      }
      return;
    }
    // Version 1's original deal is retained solely to validate and migrate
    // existing saves through their real prior actions.
    const earned = r.awards.at(-1);
    if (earned && !r.hand.includes(earned)) swapIntoHand(r, earned);
    for (let n = r.hand.filter(id => cardFor(r, id).kind !== 'evidence').length; n < Math.min(2, r.deck.filter(id => cardFor(r, id).kind !== 'evidence').length); n++) {
      const id = r.draw.find(id => cardFor(r, id).kind !== 'evidence');
      if (!id) break;
      swapIntoHand(r, id);
    }
  }
}
function swapIntoHand(r, id) {
  const from = r.draw.indexOf(id), to = r.hand.findIndex(entry => cardFor(r, entry).kind === 'evidence');
  const slot = to < 0 ? r.hand.length - 1 : to;
  if (from >= 0 && slot >= 0) [r.draw[from], r.hand[slot]] = [r.hand[slot], r.draw[from]];
}
function startRound(r) {
  r.stage = 'play'; r.turn = 1; r.actions = r.version >= 3 ? 0 : VACANCY.actions; r.progress = 0;
  if (r.version < 3) r.scrutiny = 0;
  r.amendment = 0;
  r.draw = shuffle(r, r.deck); r.discard = []; r.hand = [];
  drawHand(r, true);
  r.message = r.round === 0 ? r.version >= 3
    ? 'Add cards to reach the approval target. Scrutiny carries across all three files; reaching 7 ends the interview.'
    : r.version >= 2
    ? 'Play up to two cards, then submit. Keep unused cards between exchanges. Reach the approval target with scrutiny at 3 or less.'
    : 'Play up to two cards, then submit. Reach the approval target with scrutiny at 3 or less. You have three exchanges per file.'
    : 'He slides the next file across the desk. The procedure you took is in your opening hand.';
}
function fresh(seed, cards, version = 5, legacyHistory = []) {
  if (version === 2 && legacyHistory.length) {
    const prior = fresh(seed, cards, 1);
    for (const action of legacyHistory) {
      if (!apply(prior, action)) return null;
      prior.history.push(action);
    }
    if (!['play', 'draft'].includes(prior.stage)) return null;
    prior.version = 2; prior.legacyHistory = [...legacyHistory]; prior.history = [];
    if (prior.stage === 'play') {
      startRound(prior);
      prior.message = 'Your unfinished file has been redealt. Completed files and learned procedures are kept. Unplayed cards now stay in your hand.';
    }
    return prior;
  }
  const r = { version, seed, cards: copy(cards), rng: seed, stage: 'play', round: 0, turn: 1, actions: VACANCY.actions,
    progress: 0, scrutiny: 0, amendment: 0, deck: cards.map(card => card.id), draw: [], discard: [], hand: [], awards: [], history: [], message: '' };
  if (version === 2) r.legacyHistory = [];
  startRound(r);
  return r;
}
export function createVacancy(game, version = 5) { return [1, 2, 3, 4, 5].includes(version) ? fresh(seedFor(game), vacancyStartingDeck(game), version) : null; }
function effectFor(r, card) {
  if (card.kind === 'evidence') return { progress: (card.topic === ROUNDS[r.round].topic ? 4 : 3) + r.amendment, scrutiny: r.version >= 5 ? 3 : 2 };
  if (r.version >= 5) return card.kind === 'procedure' ? V5_PROCEDURES[card.move] : V5_MOVES[card.move];
  if (r.version >= 4) return card.kind === 'procedure' ? V4_PROCEDURES[card.move] : V4_MOVES[card.move];
  return card.kind === 'procedure' ? PROCEDURES[card.move] : MOVES[card.move];
}
function apply(r, action) {
  if (r.stage === 'draft') {
    if (r.version >= 3) return false;
    if (!action.startsWith('draft:')) return false;
    const id = action.slice(6), key = id.replace(/^procedure-/, '');
    if (id !== `procedure-${key}` || !OFFERS[r.round]?.includes(key)) return false;
    r.deck.push(id); r.awards.push(id); r.round++; startRound(r); return true;
  }
  if (r.stage !== 'play') return false;
  if (action.startsWith('play:')) {
    const id = action.slice(5), index = r.hand.indexOf(id);
    if (r.version < 3 && r.actions <= 0 || index < 0) return false;
    const card = cardFor(r, id), effect = effectFor(r, card);
    r.hand.splice(index, 1); r.discard.push(id);
    if (r.version < 3) r.actions--;
    r.progress += effect.progress; r.scrutiny = Math.max(0, r.scrutiny + effect.scrutiny);
    if (card.kind === 'evidence') r.amendment = 0;
    if (effect.amendment) r.amendment = effect.amendment;
    r.message = card.kind === 'evidence' ? `You lay down ${card.title.toLowerCase()}. “And how will you keep that out of an inquiry?”` : `You use ${card.title.toLowerCase()}. He checks your wording against the page.`;
    if (r.scrutiny >= VACANCY.scrutinyLimit) {
      r.stage = 'failed'; r.message = '“You have given them enough to open an inquiry. You are not ready for this chair.” He takes back the release.';
    } else if (r.version >= 3 && r.progress >= ROUNDS[r.round].goal) {
      if (r.round === 2) {
        r.stage = 'complete'; r.message = 'Three stamps. He sets the keys beside the report. “Only your signature now.”';
      } else {
        const learned = r.round === 0 ? 'procedure-scope' : 'procedure-precedent';
        r.deck.push(learned); r.awards.push(learned); r.round++;
        startRound(r);
        r.message = `File approved. He adds ${cardFor(r, learned).title.toLowerCase()} to your papers and opens the next file. Scrutiny carries forward.`;
      }
    }
    return true;
  }
  if (r.version >= 3 || action !== 'end-turn') return false;
  if (r.progress >= ROUNDS[r.round].goal && r.scrutiny <= VACANCY.approvalLimit) {
    r.stage = r.round === 2 ? 'complete' : 'draft';
    r.message = r.stage === 'complete' ? 'Three stamps. He sets the keys beside the report. “Only your signature now.”' : 'He stamps the section. “Keep one of these. You will need it.”';
    return true;
  }
  r.scrutiny = Math.min(VACANCY.scrutinyLimit, r.scrutiny + 2);
  if (r.turn === VACANCY.turns || r.scrutiny >= VACANCY.scrutinyLimit) {
    r.stage = 'failed'; r.message = '“This report will not survive scrutiny. The handover stays unsigned.” He gathers the papers.';
    return true;
  }
  r.turn++; r.actions = VACANCY.actions;
  if (r.version === 1) { r.discard.push(...r.hand); r.hand = []; }
  drawHand(r);
  r.message = `${ROUNDS[r.round].objection} Scrutiny rises by 2. ${r.version >= 2 ? 'Keep your unplayed cards and draw back to five.' : 'You draw another hand.'}`;
  return true;
}
export function vacancyAction(r, action) {
  if (!validVacancy(r) || typeof action !== 'string' || r.history.length >= 64 || !apply(r, action)) return false;
  r.history.push(action);
  return true;
}
function sourceValid(card) {
  if (!exactKeys(card, SOURCE_KEYS) || !['evidence', 'testimony'].includes(card.kind) ||
      !['id','move','title','description','source','quote','topic'].every(key => typeof card[key] === 'string' && card[key].length <= 12000)) return false;
  if (card.kind === 'evidence') return card.id === `evidence-${card.move}` && (Object.hasOwn(EVIDENCE, card.move)
    ? card.title === EVIDENCE[card.move].title && card.topic === TOPICS[card.move]
    : Object.hasOwn(TAPES, card.move) && card.title === TAPES[card.move] && card.topic === 'personnel');
  return Object.hasOwn(MOVES, card.move) && new RegExp(`^answer-\\d+-${card.move}$`).test(card.id) && card.title === MOVES[card.move].title && card.description === MOVES[card.move].description && card.topic === '';
}
export function validVacancy(r, game) {
  const keys = r?.version === 2 ? [...STATE_KEYS, 'legacyHistory'] : STATE_KEYS;
  if (!exactKeys(r, keys) || ![1, 2, 3, 4, 5].includes(r.version) || !integer(r.seed, 1, 0xffffffff) || !Array.isArray(r.cards) || r.cards.length > 32 ||
      !r.cards.every(sourceValid) || new Set(r.cards.map(card => card.id)).size !== r.cards.length ||
      !Array.isArray(r.history) || r.history.length > 64 || !r.history.every(action => typeof action === 'string' && action.length < 100)) return false;
  if (r.version === 2 && (!Array.isArray(r.legacyHistory) || r.legacyHistory.length > 64 || !r.legacyHistory.every(action => typeof action === 'string' && action.length < 100))) return false;
  if (game && (r.seed !== seedFor(game) || !same(r.cards, vacancyStartingDeck(game)))) return false;
  // Replay the bounded real inputs (up to 29 per interview, plus an optional
  // legacy checkpoint). Progress, drafts, shuffle, and ending stages stay bound.
  const expected = fresh(r.seed, r.cards, r.version, r.legacyHistory);
  if (!expected) return false;
  for (const action of r.history) { if (!apply(expected, action)) return false; expected.history.push(action); }
  return same(r, expected);
}
export function migrateVacancy(r, game) {
  if (!validVacancy(r, game)) return false;
  if (r.version === 5 || ['complete', 'failed'].includes(r.stage)) return true;
  // Earlier previews use different balance/deal rules. A validated unfinished
  // preview restarts its interview, preserving the exact evidence/reply deck
  // and the surrounding assignment's history.
  const migrated = fresh(r.seed, r.cards, 5);
  delete r.legacyHistory;
  Object.assign(r, migrated);
  return validVacancy(r, game);
}
export function vacancyStatus(r) {
  if (!validVacancy(r)) return null;
  const round = ROUNDS[r.round];
  let intent = null;
  if (r.stage === 'play' && r.version < 3) {
    // Tell the player what the supervisor will actually do if they submit now.
    // Deal/shuffle effects run only on this copy; the live deck and RNG stay put.
    const submitted = copy(r);
    apply(submitted, 'end-turn');
    intent = ['draft', 'complete'].includes(submitted.stage)
      ? { kind: 'approve', label: 'Approve section', detail: submitted.stage === 'complete' ? 'Final signature available' : 'Section closed' }
      : submitted.stage === 'failed'
        ? { kind: 'reject', label: 'Withhold handover', detail: 'Interview ends' }
        : { kind: 'objection', label: 'Raise objection', detail: `+${submitted.scrutiny - r.scrutiny} scrutiny` };
  }
  const view = id => {
    const card = cardFor(r, id), effect = effectFor(r, card);
    const gain = effect.progress, scrutiny = Math.max(-r.scrutiny, effect.scrutiny);
    return { ...card, playable: r.stage === 'play' && (r.version >= 3 || r.actions > 0) && r.hand.includes(id), progressGain: gain, scrutinyChange: scrutiny,
      effect: `+${gain} approval · ${effect.scrutiny > 0 ? '+' : ''}${effect.scrutiny} scrutiny${effect.amendment ? ` · next evidence: +${effect.amendment} approval` : ''}` };
  };
  const common = { stage: r.stage, round: r.round + 1, totalRounds: VACANCY.rounds, title: round.title, prompt: round.prompt,
    supervisor: 'SUPERVISOR', message: r.message, goal: round.goal, progress: r.progress, scrutiny: r.scrutiny,
    scrutinyLimit: VACANCY.scrutinyLimit, hand: r.hand.map(view), deckSize: r.deck.length };
  return r.version >= 3 ? common : { ...common, approvalLimit: VACANCY.approvalLimit, turn: r.turn, maxTurns: VACANCY.turns,
    actions: r.actions, draft: r.stage === 'draft' ? OFFERS[r.round].map(key => view(`procedure-${key}`)) : [], canEndTurn: r.stage === 'play', intent };
}
