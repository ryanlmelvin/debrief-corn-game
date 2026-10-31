import { storyDraw } from './story-random.js';

// Optional expeditions never grant story evidence or change an ending's clues.
const SIGNALS = [
  { id: 'signal-cache', kind: 'cache', label: 'Supply tin', description: 'A sealed field tin ticks beneath the leaves. There is one grounding charge inside. Its receiver could help you find your bearings.', reward: '1 guaranteed charge · up to 12 relief', points: [[4,6],[5,6],[4,5]] },
  { id: 'signal-radio', kind: 'radio', label: 'Stray transmission', description: 'An abandoned receiver whispers your station number. Somewhere beneath the copies, a real signal is still getting through.', reward: 'Up to 12 relief + 1 charge', points: [[6,2],[5,2],[6,3]] },
  { id: 'signal-hide', kind: 'hide', label: 'Quiet hollow', description: 'The corn parts around a patch of bare earth. The static on your set falls away. You might be able to make this quiet last.', reward: 'Up to 12 relief + 1 charge', points: [[8,7],[7,7],[8,6]] }
];
const BANK = [0,2,6,12], SCORES = [0,50,150,300];
const CHANNELS = Array.from({ length: 4 }, (_,id) => ({ id, label: String(id + 1) }));
const freshNight = () => ({ searched: [], supplies: 1, score: 0, active: null, protectedEncounter: null });
export const freshExpedition = () => ({ version: 2, nights: Array.from({ length: 3 }, freshNight) });
export function migrateExpedition(s) {
  if (s.expedition === undefined) s.expedition = freshExpedition();
  // Keep every earned reward and completed round from the first local preview.
  // Its current round starts a new call sign; no progress or bank is forfeited.
  if (s.expedition?.version === 1) {
    if (Array.isArray(s.expedition.nights)) for (const n of s.expedition.nights) {
      if (n?.active && n.active.entered === undefined) n.active.entered = [];
    }
    s.expedition.version = 2;
  }
}
const night = s => s.expedition?.nights?.[s.shift];
const signalDefinition = id => SIGNALS.find(signal => signal.id === id);

export function fieldSignals(s) {
  const searched = night(s)?.searched || [];
  return SIGNALS.map(({ points, ...signal }) => {
    const [x,y] = points[(s.shift + storyDraw(s.runId, `${signal.id}:position`)) % points.length];
    return { ...signal, x, y, done: searched.includes(signal.id) };
  });
}
export function signalAtPlayer(s) {
  if (s.phase !== 'field') return null;
  return fieldSignals(s).find(signal => signal.x === s.player?.x && signal.y === s.player?.y) || null;
}
export function expeditionStatus(s) {
  const n = night(s) || freshNight();
  return { supplies: n.supplies, score: n.score, found: n.searched.length, total: SIGNALS.length,
    protected: !!n.protectedEncounter, totalScore: s.expedition?.nights.reduce((sum, entry) => sum + entry.score, 0) || 0 };
}
function sequence(s, active) {
  const round = Math.min(active.round,2), notes = [];
  for (let i = 0; i < round + 3; i++) {
    const draw = storyDraw(s.runId, `${s.shift}:${active.id}:${round}:call-sign:${i}`);
    const previous = notes.at(-1), candidate = draw % (i ? 3 : 4);
    notes.push(i && candidate >= previous ? candidate + 1 : candidate);
  }
  return notes;
}
const outcomeCopy = {
  complete: { title: 'A real voice. At last.', text: '“Station four, hold your bearing.” The voice is tired and ordinary. You repeat the words until they sound like words again. A sealed charge is tucked beneath the receiver.' },
  cashout: { title: 'Keep what you found.', text: 'You switch off before the voice can ask your name. The silence stays with you for a few rows.' },
  wrong: { title: 'That voice was too close.', text: 'The receiver says your next breath before you take it. You cut the power. Half the quiet you found is gone; you hold on to the rest.' },
  leave: { title: 'Leave the receiver silent.', text: 'You close the lid. Something beneath the soil clicks off a moment after you do.' }
};
export function currentSignal(s) {
  const active = night(s)?.active;
  if (s.phase !== 'field' || !active) return null;
  const signal = fieldSignals(s).find(item => item.id === active.id), notes = sequence(s,active);
  return { ...signal, round: Math.min(3,active.round + 1), channels: CHANNELS.map(channel => ({ ...channel })), sequence: notes, entered: [...active.entered],
    clue: `Watch the call sign. Repeat its ${notes.length} notes.`,
    bank: active.bank, scoreBank: active.scoreBank,
    outcome: active.outcome ? { ...outcomeCopy[active.outcome.kind], ...active.outcome } : null };
}
export function beginSignal(s,id) {
  if (s.phase !== 'field' || s.fieldEvents?.pending || !signalDefinition(id)) return false;
  migrateExpedition(s);
  const n = night(s), signal = signalAtPlayer(s);
  if (!n || n.active || n.protectedEncounter || n.searched.includes(id) || signal?.id !== id) return false;
  n.active = { id, round: 0, bank: 0, scoreBank: 0, entered: [], outcome: null };
  return true;
}
function settle(s,kind) {
  const n = night(s), active = n?.active;
  if (!active || active.outcome) return false;
  const fraction = kind === 'wrong' ? .5 : 1;
  const bank = Math.floor(active.bank * fraction), score = Math.floor(active.scoreBank * fraction);
  const relief = Math.min(s.exposure,bank);
  const reward = (active.id === 'signal-cache' ? 1 : 0) + (kind === 'complete' ? 1 : 0);
  const supplies = Math.min(3 - n.supplies,reward);
  s.exposure = Math.max(0,s.exposure - relief);
  n.score += score;n.supplies += supplies;n.searched.push(active.id);
  active.outcome = { kind, relief, score, supplies };
  return true;
}
export function tuneSignal(s,channel) {
  const active = night(s)?.active;
  if (s.phase !== 'field' || s.fieldEvents?.pending || !active || active.outcome || !Number.isInteger(channel) || channel < 0 || channel > 3) return false;
  const notes = sequence(s,active);
  if (notes[active.entered.length] !== channel) return settle(s,'wrong');
  active.entered.push(channel);
  if (active.entered.length < notes.length) return true;
  active.entered = [];
  active.round++;active.bank = BANK[active.round];active.scoreBank = SCORES[active.round];
  if (active.round === 3) settle(s,'complete');
  return true;
}
export function cashOutSignal(s) {
  const active = night(s)?.active;
  return s.phase === 'field' && !s.fieldEvents?.pending && active?.bank > 0 ? settle(s,'cashout') : false;
}
export function leaveSignal(s) {
  const active = night(s)?.active;
  return s.phase === 'field' && !s.fieldEvents?.pending && active ? settle(s,active.bank > 0 ? 'cashout' : 'leave') : false;
}
export function finishSignal(s) {
  const n = night(s);
  if (s.phase !== 'field' || !n?.active?.outcome) return false;
  n.active = null;
  return true;
}
export function protectEncounter(s) {
  const pending = s.fieldEvents?.pending;
  if (s.phase !== 'field' || !pending || pending.choice !== null) return false;
  migrateExpedition(s);
  const n = night(s);
  if (!n || n.active || n.protectedEncounter || n.supplies < 1) return false;
  n.supplies--;n.protectedEncounter = pending.id;
  return true;
}
export function encounterCost(s,delta) {
  return delta > 0 && night(s)?.protectedEncounter && night(s).protectedEncounter === s.fieldEvents?.pending?.id ? Math.max(0,delta - 5) : delta;
}
export function consumeProtection(s) {
  const n = night(s);
  if (!n?.protectedEncounter) return false;
  n.protectedEncounter = null;
  return true;
}

export function validExpedition(s) {
  const e = s.expedition;
  if (!e || e.version !== 2 || !Array.isArray(e.nights) || e.nights.length !== 3) return false;
  return e.nights.every((n,index) => {
    if (!n || !Array.isArray(n.searched) || n.searched.length > 3 || new Set(n.searched).size !== n.searched.length || !n.searched.every(signalDefinition)) return false;
    if (!Number.isInteger(n.supplies) || n.supplies < 0 || n.supplies > 3 || !Number.isInteger(n.score) || n.score < 0 || n.score > n.searched.length * 300) return false;
    if (n.protectedEncounter !== null && (typeof n.protectedEncounter !== 'string' || index !== s.shift || s.phase !== 'field' || s.fieldEvents?.pending?.id !== n.protectedEncounter || s.fieldEvents.pending.choice !== null || n.active)) return false;
    if (n.active === null) return true;
    const a = n.active;
    if (!a || index !== s.shift || s.phase !== 'field' || s.fieldEvents?.pending || !signalDefinition(a.id) || !Number.isInteger(a.round) || a.round < 0 || a.round > 3 || a.bank !== BANK[a.round] || a.scoreBank !== SCORES[a.round]) return false;
    const notes = sequence(s,a);
    if (!Array.isArray(a.entered) || a.entered.length >= notes.length || (a.round === 3 && a.entered.length) || !a.entered.every((channel,i) => channel === notes[i])) return false;
    const signal = fieldSignals(s).find(item => item.id === a.id);
    if (s.player?.x !== signal.x || s.player?.y !== signal.y) return false;
    if (a.outcome === null) return a.round < 3 && !n.searched.includes(a.id);
    const o = a.outcome;
    if (!o || !Object.hasOwn(outcomeCopy,o.kind) || !n.searched.includes(a.id)) return false;
    if (o.kind === 'complete' ? a.round !== 3 : o.kind === 'cashout' ? a.round < 1 || a.round > 2 : o.kind === 'leave' ? a.round !== 0 : a.round > 2) return false;
    const factor = o.kind === 'wrong' ? .5 : 1;
    const maxSupplies = (a.id === 'signal-cache' ? 1 : 0) + (o.kind === 'complete' ? 1 : 0);
    return Number.isFinite(o.relief) && o.relief >= 0 && o.relief <= Math.floor(a.bank * factor) && o.score === Math.floor(a.scoreBank * factor) && n.score >= o.score && Number.isInteger(o.supplies) && o.supplies >= 0 && o.supplies <= maxSupplies;
  });
}
