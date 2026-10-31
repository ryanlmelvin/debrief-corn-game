import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDINGS } from '../docs/engine.js';
import { REVIEWED_ENDING_HINTS, validateEndingHintCoverage } from '../scripts/check-ending-hints.mjs';

test('every shipped ending has an explicit hint safety review', () => {
  assert.equal(validateEndingHintCoverage(), true);
  assert.deepEqual(Object.keys(REVIEWED_ENDING_HINTS).sort(), Object.keys(ENDINGS).sort());
  for (const [id, review] of Object.entries(REVIEWED_ENDING_HINTS)) {
    assert.ok(['direct', 'recovery', 'conservative'].includes(review.coverage), `${id} needs a supported coverage policy`);
    assert.ok(review.rationale.trim(), `${id} needs a reason for its policy`);
  }
});

test('adding an ending fails the audit until its hint safety is deliberately reviewed', () => {
  const beforeReviews = structuredClone(REVIEWED_ENDING_HINTS), beforeEndings = structuredClone(ENDINGS);
  const future = { ...ENDINGS, synthetic_unreviewed: { code: '99', title: 'A future ending' } };
  assert.throws(() => validateEndingHintCoverage(future), /Unreviewed endings: synthetic_unreviewed/);
  assert.deepEqual(REVIEWED_ENDING_HINTS, beforeReviews, 'validation cannot silently approve a new ending');
  assert.deepEqual(ENDINGS, beforeEndings, 'the synthetic ending does not alter gameplay');
  assert.equal(validateEndingHintCoverage(), true);
});

test('removing or renaming an ending cannot leave a stale safety review', () => {
  const changed = { ...ENDINGS };
  delete changed.guide_interrupted;
  assert.throws(() => validateEndingHintCoverage(changed), /Stale ending reviews: guide_interrupted/);
  changed.replacement_interruption = ENDINGS.guide_interrupted;
  assert.throws(() => validateEndingHintCoverage(changed), /Unreviewed endings: replacement_interruption.*Stale ending reviews: guide_interrupted/);
});
