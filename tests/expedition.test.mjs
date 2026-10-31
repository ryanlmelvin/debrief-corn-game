import test from 'node:test';
import assert from 'node:assert/strict';
import { freshExpedition, migrateExpedition, validExpedition, expeditionStatus, fieldSignals, signalAtPlayer, beginSignal, currentSignal, tuneSignal, cashOutSignal, leaveSignal, finishSignal, protectEncounter, encounterCost, consumeProtection } from '../docs/expedition.js';
import { createGame, move, inspect, beginDebrief, serialize, restore, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { currentEncounter } from '../docs/encounters.js';
import { planFieldRoute } from '../docs/field.js';

const game = (shift = 0) => ({ runId: 'expedition-fixture', phase: 'field', shift, exposure: 40, player: { x: 1,y: 7 }, fieldEvents: { pending: null }, expedition: freshExpedition() });
function arrive(s,id = 'signal-radio') { const signal = fieldSignals(s).find(item => item.id === id);s.player = { x: signal.x,y: signal.y };assert.equal(beginSignal(s,id),true);return signal; }
function correct(s) { const signal = currentSignal(s);for (const channel of signal.sequence.slice(signal.entered.length)) assert.equal(tuneSignal(s,channel),true); }
const copy = s => JSON.parse(JSON.stringify(s));

test('three optional signals vary deterministically, stay away from exhibits, and never change state while previewing', () => {
  const s = game(), before = JSON.stringify(s), seen = [];
  for (let shift = 0;shift < 3;shift++) {
    const state = { ...s,shift }, signals = fieldSignals(state);
    assert.deepEqual(signals,fieldSignals(copy(state)));
    assert.deepEqual(signals.map(signal => signal.id),['signal-cache','signal-radio','signal-hide']);
    assert.equal(new Set(signals.map(signal => `${signal.x},${signal.y}`)).size,3);
    for (const signal of signals) assert.ok(!['1,7','3,3','7,5','9,1'].includes(`${signal.x},${signal.y}`));
    seen.push(signals.map(signal => `${signal.x},${signal.y}`).join(';'));
  }
  assert.equal(new Set(seen).size,3);assert.equal(JSON.stringify(s),before);
  assert.equal(signalAtPlayer(s),null);
});

test('radio call signs grow from three to five notes and preserve every partial response across a save', () => {
  let s = game();arrive(s);
  for (let round = 1;round <= 3;round++) {
    const signal = currentSignal(s);
    assert.equal(signal.round,round);
    assert.deepEqual(signal.channels.map(channel => channel.id),[0,1,2,3]);
    assert.equal(signal.sequence.length,round + 2);
    assert.ok(signal.sequence.every((channel,i) => Number.isInteger(channel) && channel >= 0 && channel <= 3 && (!i || channel !== signal.sequence[i - 1])));
    assert.equal(signal.clue,`Watch the call sign. Repeat its ${round + 2} notes.`);
    assert.equal(validExpedition(s),true);
    assert.equal(tuneSignal(s,signal.sequence[0]),true);
    assert.equal(currentSignal(s).round,round,'a single matching note cannot finish a round');
    assert.deepEqual(currentSignal(s).entered,[signal.sequence[0]]);
    assert.equal(expeditionStatus(s).score,0,'unbanked rounds have no applied reward');
    const before = currentSignal(s);s = copy(s);assert.deepEqual(currentSignal(s),before);
    assert.equal(validExpedition(s),true);
    correct(s);
  }
  assert.equal(s.exposure,28);assert.deepEqual(expeditionStatus(s),{ supplies: 2,score: 300,found: 1,total: 3,protected: false,totalScore: 300 });
  assert.deepEqual(currentSignal(s).outcome.relief,12);
  assert.equal(validExpedition(s),true);
  assert.equal(tuneSignal(s,0),false);assert.equal(cashOutSignal(s),false);assert.equal(leaveSignal(s),false);
  assert.equal(finishSignal(s),true);assert.equal(currentSignal(s),null);assert.equal(beginSignal(s,'signal-radio'),false);assert.equal(finishSignal(s),false);
});

test('cash out banks earned relief, a mistake halves the bank, and first-round mistakes cannot add exposure', () => {
  const cash = game();arrive(cash);correct(cash);correct(cash);
  assert.equal(cashOutSignal(cash),true);assert.equal(cash.exposure,34);assert.equal(currentSignal(cash).outcome.score,150);assert.equal(validExpedition(cash),true);
  const wrong = game();arrive(wrong);correct(wrong);correct(wrong);
  const wrongChannel = (currentSignal(wrong).sequence[0] + 1) % 4;
  tuneSignal(wrong,wrongChannel);assert.equal(wrong.exposure,37);assert.equal(currentSignal(wrong).outcome.score,75);assert.equal(validExpedition(wrong),true);
  const empty = game();arrive(empty);assert.equal(cashOutSignal(empty),false);
  tuneSignal(empty,(currentSignal(empty).sequence[0] + 1) % 4);
  assert.equal(empty.exposure,40);assert.equal(currentSignal(empty).outcome.relief,0);assert.equal(validExpedition(empty),true);
});

test('cache guarantees a charge, rewards cap at three, and leaving spends the signal instead of farming it', () => {
  const s = game();arrive(s,'signal-cache');assert.equal(leaveSignal(s),true);assert.equal(expeditionStatus(s).supplies,2);assert.equal(validExpedition(s),true);
  finishSignal(s);assert.equal(beginSignal(s,'signal-cache'),false);assert.equal(fieldSignals(s).find(signal => signal.id === 'signal-cache').done,true);
  for (const id of ['signal-radio','signal-hide']) { arrive(s,id);correct(s);correct(s);correct(s);assert.equal(validExpedition(s),true);finishSignal(s); }
  assert.equal(expeditionStatus(s).supplies,3);assert.equal(expeditionStatus(s).found,3);assert.equal(expeditionStatus(s).score,600);
  const calm = game();calm.exposure = 1;arrive(calm);correct(calm);cashOutSignal(calm);assert.equal(calm.exposure,0);assert.equal(currentSignal(calm).outcome.relief,1);
});

test('each night has its own stock and searches while the field record counts the campaign', () => {
  const s = game();
  for (let shift = 0;shift < 3;shift++) {
    s.shift = shift;assert.equal(expeditionStatus(s).supplies,1);assert.equal(expeditionStatus(s).found,0);
    arrive(s,'signal-cache');correct(s);cashOutSignal(s);finishSignal(s);
    assert.equal(expeditionStatus(s).supplies,2);assert.equal(expeditionStatus(s).found,1);assert.equal(validExpedition(s),true);
  }
  assert.equal(expeditionStatus(s).totalScore,150);
});

test('one grounding charge reduces only its pending encounter and cannot be spent twice', () => {
  const s = game();assert.equal(protectEncounter(s),false);
  s.fieldEvents.pending = { id: 'first-call',choice: null };
  assert.equal(protectEncounter(s),true);assert.equal(protectEncounter(s),false);assert.equal(expeditionStatus(s).supplies,0);assert.equal(expeditionStatus(s).protected,true);
  assert.equal(encounterCost(s,7),2);assert.equal(encounterCost(s,3),0);assert.equal(encounterCost(s,0),0);assert.equal(encounterCost(s,-3),-3);
  assert.equal(validExpedition(copy(s)),true);assert.equal(consumeProtection(s),true);assert.equal(consumeProtection(s),false);assert.equal(encounterCost(s,7),7);
  assert.equal(protectEncounter(s),false);s.fieldEvents.pending.choice = 'answer';assert.equal(protectEncounter(s),false);
});

test('invalid locations, targets, competing interactions and malformed saves are rejected', () => {
  const s = game();assert.equal(beginSignal(s,'signal-radio'),false);assert.equal(beginSignal(s,'missing'),false);arrive(s);
  for (const channel of [-1,4,5,1.5,'2',null]) assert.equal(tuneSignal(s,channel),false);
  assert.equal(beginSignal(s,'signal-radio'),false);assert.equal(finishSignal(s),false);
  const bad = modify => { const state = copy(s);modify(state);assert.equal(validExpedition(state),false); };
  bad(state => { state.expedition.version = 3; });
  bad(state => { state.expedition.nights.pop(); });
  bad(state => { state.expedition.nights[0].supplies = 4; });
  bad(state => { state.expedition.nights[0].searched = ['signal-cache','signal-cache']; });
  bad(state => { state.expedition.nights[0].active.bank = 12; });
  bad(state => { state.expedition.nights[0].active.id = 'missing'; });
  bad(state => { state.expedition.nights[0].active.entered = [(currentSignal(state).sequence[0] + 1) % 4]; });
  bad(state => { state.expedition.nights[0].active.entered = currentSignal(state).sequence; });
  bad(state => { state.expedition.nights[0].active.entered = [4]; });
  bad(state => { delete state.expedition.nights[0].active.entered; });
  bad(state => { state.expedition.nights[0].active.outcome = { kind: 'complete',score: 300,relief: 12,supplies: 1 }; });
  bad(state => { state.phase = 'debrief'; });
  bad(state => { state.player.x++; });
  bad(state => { state.fieldEvents.pending = { id: 'first-call',choice: null }; });
  bad(state => { state.expedition.nights[1].active = state.expedition.nights[0].active; });
  bad(state => { state.expedition.nights[0].protectedEncounter = 'first-call'; });
  const blocked = game();blocked.player = fieldSignals(blocked)[0];blocked.fieldEvents.pending = { id: 'first-call',choice: null };assert.equal(beginSignal(blocked,'signal-cache'),false);
});

test('older saves acquire an independent optional expedition without changing story progress', () => {
  const s = game(2);delete s.expedition;const before = copy(s);migrateExpedition(s);
  assert.equal(validExpedition(s),true);const { expedition,...rest } = s;assert.deepEqual(rest,before);
  const same = s.expedition;migrateExpedition(s);assert.equal(s.expedition,same);
  assert.notEqual(expedition.nights[0],expedition.nights[1]);assert.notEqual(expedition.nights[0].searched,expedition.nights[1].searched);
});

test('the first local preview migrates its current bank, finished outcomes and supplies without a replay', () => {
  for (const completed of [false,true]) {
    let s = { ...createGame('story',971),phase: 'field',entered: true };
    arrive(s,'signal-cache');correct(s);correct(s);
    if (completed) cashOutSignal(s);
    s.expedition.version = 1;delete s.expedition.nights[0].active.entered;
    const before = copy(s.expedition.nights[0]);
    s = restore(serialize(s));assert.ok(s);assert.equal(s.expedition.version,2);
    const { entered,...active } = s.expedition.nights[0].active;
    assert.deepEqual(active,before.active);assert.deepEqual(entered,[]);
    assert.equal(s.expedition.nights[0].supplies,before.supplies);assert.equal(s.expedition.nights[0].score,before.score);
    assert.equal(currentSignal(s).bank,6);
    if (completed) { assert.equal(cashOutSignal(s),false);finishSignal(s);assert.equal(beginSignal(s,'signal-cache'),false); }
    else { correct(s);assert.equal(currentSignal(s).outcome.kind,'complete');assert.equal(currentSignal(s).outcome.score,300); }
  }
});

test('real walks and engine saves preserve optional destinations, rewards, and protected story choices', () => {
  let s = { ...createGame('story',971),phase: 'field',entered: true };
  const signal = fieldSignals(s).find(item => item.id === 'signal-radio');
  s.fieldEvents.journey = { destination: signal.id,style: 'quiet' };
  assert.ok(restore(serialize(s)),'optional destination is a valid saved journey');
  for (const step of planFieldRoute(s,signal).steps) {
    assert.equal(move(s,step.x - s.player.x,step.y - s.player.y),true);
    if (s.fieldEvents.pending) {
      const event = currentEncounter(s), risky = event.choices.find(choice => choice.delta > 0);
      if (risky && expeditionStatus(s).supplies) {
        assert.equal(protectEncounter(s),true);
        s = restore(serialize(s));assert.ok(s);
        const exposure = s.exposure;
        assert.equal(chooseFieldEncounter(s,risky.id),true);
        assert.ok(Math.abs(s.exposure - exposure - Math.max(0,risky.delta - 5)) < 1e-9);
        assert.equal(expeditionStatus(s).protected,false);
      } else chooseFieldEncounter(s,event.choices[0].id);
      assert.equal(continueFieldEncounter(s),true);
    }
  }
  assert.equal(beginSignal(s,signal.id),true);
  assert.equal(move(s,1,0),false);assert.equal(inspect(s),null);assert.equal(beginDebrief(s),false);
  correct(s);s = restore(serialize(s));assert.ok(s);assert.equal(currentSignal(s).round,2);
  correct(s);correct(s);s = restore(serialize(s));assert.ok(s);assert.equal(currentSignal(s).outcome.kind,'complete');
  const score = expeditionStatus(s).score;finishSignal(s);
  s = restore(serialize(s));assert.ok(s);assert.equal(expeditionStatus(s).score,score);assert.equal(beginSignal(s,signal.id),false);
});
