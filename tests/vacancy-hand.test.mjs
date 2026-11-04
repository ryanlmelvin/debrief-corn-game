import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../docs/vendor/three/three.module.js';
import { VacancyHand, vacancyHandLayout, vacancyDealPose, vacancyDealDuration } from '../docs/vacancy-hand.js';
import { createVacancy, vacancyStatus } from '../docs/vacancy.js';

test('office paper fan fits narrow phone and desktop canvases, including the selected dossier tab', () => {
  for (const [width, height] of [[320, 210], [370, 230], [1024, 300], [660, 180]]) {
    for (const count of [1, 2, 5]) for (let selected = -1; selected < count; selected++) {
      const layout = vacancyHandLayout(count, selected, width / height);
      const camera = new THREE.OrthographicCamera(-layout.width / 2, layout.width / 2, layout.height / 2, -layout.height / 2, .1, 50);
      camera.position.set(0, 1.35, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      for (const pose of layout.cards) {
        const transform = new THREE.Matrix4().compose(new THREE.Vector3(pose.x, pose.y, pose.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rotationX, pose.rotationY, pose.rotationZ)), new THREE.Vector3(pose.scale, pose.scale, pose.scale));
        for (const x of [-1, 1]) for (const y of [-1.475, 1.635]) {
          const projected = new THREE.Vector3(x, y, .02).applyMatrix4(transform).project(camera);
          assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `${width}×${height}, ${count} cards, selected ${selected}: paper extends beyond canvas`);
        }
      }
    }
  }
});

test('selection lifts one memo forward while keeping the hand order stable', () => {
  const ordinary = vacancyHandLayout(5), selected = vacancyHandLayout(5, 2);
  assert.equal(selected.cards.length, 5);
  assert.deepEqual(selected.cards.map(card => card.x), ordinary.cards.map(card => card.x));
  assert.ok(selected.cards[2].z > Math.max(...ordinary.cards.map(card => card.z)));
  assert.ok(selected.cards[2].y > ordinary.cards[2].y);
  for (const index of [0, 1, 3, 4]) assert.deepEqual(selected.cards[index], ordinary.cards[index]);
  assert.ok(ordinary.cards[0].rotationZ > 0 && ordinary.cards[4].rotationZ < 0);
});

test('empty hands and unavailable dimensions produce finite repeatable layout', () => {
  for (const [count, ratio] of [[0, 0], [NaN, NaN], [5, Infinity], [-1, -5], [10, .3]]) {
    const layout = vacancyHandLayout(count, -1, ratio);
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
    assert.deepEqual(layout, vacancyHandLayout(count, -1, ratio));
    assert.ok(layout.cards.every(card => Object.values(card).every(Number.isFinite)));
  }
});

test('a new hand arrives one paper at a time and ends in the exact playable fan', () => {
  for (const count of [1, 3, 5]) {
    const layout = vacancyHandLayout(count, -1, 390 / 280), before = structuredClone(layout);
    const duration = vacancyDealDuration(count);
    assert.ok(duration > 0 && duration < 1000);
    for (let index = 0; index < count; index++) {
      const target = layout.cards[index], start = vacancyDealPose(target, index, 0, layout.width);
      assert.ok(start.x > layout.width / 2, 'New papers enter from outside the hand');
      assert.equal(start.rotationY, Math.PI, 'The paper starts with its back toward the player');
      const finish = vacancyDealPose(target, index, duration, layout.width);
      for (const key of Object.keys(target)) assert.ok(Math.abs(finish[key] - target[key]) < 1e-9, `${key} must settle on the original layout`);
    }
    if (count > 1) {
      assert.notDeepEqual(vacancyDealPose(layout.cards[0], 0, 50, layout.width), vacancyDealPose(layout.cards[0], 0, 0, layout.width));
      assert.deepEqual(vacancyDealPose(layout.cards[1], 1, 50, layout.width), vacancyDealPose(layout.cards[1], 1, 0, layout.width));
    }
    assert.deepEqual(layout, before, 'Presentation must not modify the hand layout');
  }
  assert.equal(vacancyDealDuration(0), 0);
});

test('reduced-motion and unavailable renderers skip dealing without scheduling animation', () => {
  for (const flags of [{ reducedMotion: true }, { _failed: true }, { disposed: true }]) {
    const hand = Object.assign(Object.create(VacancyHand.prototype), { entries: [{}], width: 390, height: 280, window: { requestAnimationFrame() { assert.fail('No animation should be scheduled'); } } }, flags);
    assert.equal(hand.deal(), 0);
    assert.equal(hand.dismiss(), 0);
  }
});

test('the hand texture prints the next-evidence approval bonus in full on its own line', () => {
  const state = createVacancy({ runId: 'effect-paper', evidence: ['badge'], reports: [{ shift: 0, choice: 'redact', answer: 'Nothing outside the expected growth pattern.' }] });
  const card = vacancyStatus(state).hand.find(entry => entry.id === 'answer-0-redact');
  const painted = [];
  const context = {
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(text) { return { width: text.length * parseInt(this.font.match(/(\d+)px/)[1], 10) * .61 }; },
    fillText(text, x, y) { painted.push({ text, x, y }); }
  };
  const canvas = { getContext: () => context };
  const hand = Object.assign(Object.create(VacancyHand.prototype), {
    document: { createElement: () => canvas }, scene: new THREE.Scene(), resources: new Set(),
    sharedShadow: new THREE.Texture(), renderer: { capabilities: { getMaxAnisotropy: () => 1 } }
  });
  const entry = hand.makeCard(card, 0);
  const rules = painted.filter(line => line.y >= 646 && line.y <= 702);
  assert.deepEqual(rules.map(line => line.text), ['+1 approval', '-4 scrutiny', 'next evidence: +2 approval']);
  assert.equal(entry.front.map.image, canvas, 'The checked text is used by the physical hand card');
  for (const resource of hand.resources) resource.dispose();
  hand.sharedShadow.dispose();
});
