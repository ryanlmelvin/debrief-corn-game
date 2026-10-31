import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, move, inspect, FIELD_SITES, beginDebrief, answer, startShift, restore, serialize, chooseFieldEncounter, continueFieldEncounter } from '../docs/engine.js';
import { currentEncounter, freshFieldEvents } from '../docs/encounters.js';
import { fieldSignals, signalAtPlayer, beginSignal, currentSignal, tuneSignal, finishSignal, expeditionStatus } from '../docs/expedition.js';
import { planFieldRoute } from '../docs/field.js';
import { FieldMap } from '../docs/field-ui.js';

const field = (mode = 'story') => ({ ...createGame(mode,42),phase: 'field',entered: true,departure: 'chosen',fieldEvents: freshFieldEvents() });
const controller = (selected,style = 'quiet') => Object.assign(Object.create(FieldMap.prototype),{ selected,style,travel: null,lastKey: '' });
function settleStory(s) {
  if (!s.fieldEvents.pending) return;
  assert.equal(chooseFieldEncounter(s,currentEncounter(s).choices[0].id),true);
  assert.equal(continueFieldEncounter(s),true);
}
function completeSignal(s) {
  for (let round = 0;round < 3 && !currentSignal(s).outcome;round++) {
    const signal = currentSignal(s);
    for (const channel of signal.sequence.slice(signal.entered.length)) assert.equal(tuneSignal(s,channel),true);
  }
  assert.equal(currentSignal(s).outcome.kind,'complete');
  assert.equal(finishSignal(s),true);
}

test('a pending encounter on the last signal step is deferred until the player leaves the signal', () => {
  const s = field(), signal = fieldSignals(s).find(p => p.id === 'signal-cache');
  s.player = { x: signal.x - 1,y: signal.y };s.fieldSteps = 2;
  const c = controller(signal.id);let arrivals = 0;
  assert.equal(c.start(s),true);
  c.tick(s,.4,(dx,dy) => move(s,dx,dy),() => { arrivals++;assert.equal(beginSignal(s,signal.id),true); });
  assert.equal(arrivals,1);assert.equal(s.fieldSteps,3);assert.equal(s.fieldEvents.pending,null);
  assert.equal(s.fieldEvents.seen.includes('first-call'),false);
  assert.equal(currentSignal(s).id,signal.id);assert.equal(s.fieldEvents.journey,null);
  completeSignal(s);
  assert.equal(move(s,-1,0),true);
  assert.equal(s.fieldEvents.pending.id,'first-call','the arrival postpones the scene without losing its story opportunity');
  assert.ok(restore(serialize(s)));
});

test('a route to a signal survives a story interruption and save before arriving once', () => {
  let s = field();const c = controller('signal-radio');let arrivals = 0,interruptions = 0;
  assert.equal(c.start(s),true);
  for (let tick = 0;tick < 100 && !arrivals;tick++) {
    c.tick(s,.4,(dx,dy) => move(s,dx,dy),() => {
      arrivals++;
      assert.equal(beginSignal(s,signalAtPlayer(s).id),true);
    });
    if (s.fieldEvents.pending) {
      interruptions++;
      assert.equal(c.travel,null);
      assert.equal(s.fieldEvents.journey.destination,'signal-radio');
      const position = { ...s.player };
      s = restore(serialize(s));assert.ok(s);assert.deepEqual(s.player,position);
      settleStory(s);assert.equal(c.start(s),true);
    }
  }
  assert.ok(interruptions > 0);assert.equal(arrivals,1);
  const first = currentSignal(s);s = restore(serialize(s));assert.ok(s);assert.deepEqual(currentSignal(s),first);
  assert.equal(tuneSignal(s,first.sequence[0]),true);
  const partial = currentSignal(s);assert.deepEqual(partial.entered,[first.sequence[0]]);
  assert.equal(partial.bank,0,'a partial call sign earns no reward');
  s = restore(serialize(s));assert.ok(s);assert.deepEqual(currentSignal(s),partial,'reload keeps the exact prefix and call sign');
  const corrupt = JSON.parse(serialize(s));corrupt.expedition.nights[0].active.entered[0] = (first.sequence[0] + 1) % 4;
  assert.equal(restore(JSON.stringify(corrupt)),null,'a forged correct prefix cannot be resumed');
  assert.equal(c.travel,null);assert.equal(s.fieldEvents.journey,null);
  c.tick(s,1,() => assert.fail('walking must remain stopped'),() => arrivals++);
  assert.equal(arrivals,1);
  completeSignal(s);
  s = restore(serialize(s));assert.ok(s);assert.equal(beginSignal(s,'signal-radio'),false);
  assert.equal(expeditionStatus(s).score,300);
});

test('all optional detours and main discoveries remain survivable across three nights', () => {
  for (const mode of ['story','hard']) for (const style of ['quiet','direct']) {
    let s = field(mode);
    for (let shift = 0;shift < 3;shift++) {
      assert.equal(s.shift,shift);
      for (const id of ['pump','signal-cache','signal-radio','corner','drain','signal-hide','tower']) {
        const destination = [...FIELD_SITES,...fieldSignals(s)].find(p => p.id === id);
        const route = planFieldRoute(s,destination,style);
        for (const point of route.steps) {
          assert.equal(move(s,point.x - s.player.x,point.y - s.player.y),true);
          settleStory(s);
          assert.equal(s.phase,'field',`${mode} ${style} night ${shift + 1}: exposure must stay survivable`);
        }
        if (id.startsWith('signal-')) {
          assert.equal(beginSignal(s,id),true);completeSignal(s);
        } else if (id !== 'tower') assert.ok(inspect(s));
        s = restore(serialize(s));assert.ok(s,'each completed stop remains a valid saved game');
      }
      assert.equal(expeditionStatus(s).found,3);assert.equal(expeditionStatus(s).score,900);
      assert.equal(beginDebrief(s),true);
      answer(s,'truth');answer(s,'field-notes');answer(s,'sign');
      if (shift < 2) { startShift(s);s.phase = 'field';s.entered = true; }
    }
    assert.equal(s.ending,'dissent');assert.equal(s.evidence.length,9);
    assert.equal(s.fieldEvents.journal.length,12,'optional detours preserve all canonical story encounters');
    assert.equal(expeditionStatus(s).totalScore,2700);assert.ok(restore(serialize(s)));
  }
});
