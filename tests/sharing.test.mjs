import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENDINGS } from '../docs/engine.js';
import { ENDING_SHARES, endingShareData, shareEnding } from '../docs/sharing.js';

test('every ending has a distinct static link preview without ending prose', () => {
  assert.deepEqual(Object.keys(ENDING_SHARES).sort(), Object.keys(ENDINGS).sort());
  const urls = new Set();
  for (const [ending, card] of Object.entries(ENDING_SHARES)) {
    const data = endingShareData(ending);
    urls.add(data.url);
    const page = readFileSync(new URL(`../docs/share/${card.code}/index.html`, import.meta.url), 'utf8');
    assert.ok(page.includes(`<meta property="og:title" content="${data.title}">`));
    assert.ok(page.includes(`<meta property="og:url" content="${data.url}">`));
    assert.ok(page.includes(`<meta property="og:image" content="${data.url}preview.jpg">`));
    assert.match(page, /name="twitter:card" content="summary_large_image"/);
    assert.match(page, /href="\.\.\/\.\.\/">Find your own ending/);
    assert.doesNotMatch(page, /<script|http-equiv="refresh"/i);
    for (const e of Object.values(ENDINGS)) {
      assert.ok(!page.includes(e.text));
      assert.ok(!JSON.stringify(data).includes(e.text));
    }
    const jpg = readFileSync(new URL(`../docs/share/${card.code}/preview.jpg`, import.meta.url));
    assert.equal(jpg.readUInt16BE(0), 0xffd8);
    assert.ok(jpg.length < 1000000, 'preview should stay small enough to fetch quickly');
  }
  assert.equal(urls.size, Object.keys(ENDINGS).length);
  assert.equal(endingShareData('consumption').text, 'I ate the corn.');
});

test('native share runs synchronously from the click with only the teaser and public URL', async () => {
  let sent;
  const result = shareEnding('consumption', {
    share: data => { sent = data; return Promise.resolve(); },
    clipboard: { writeText: () => assert.fail('native success should not copy') }
  });
  assert.deepEqual(sent, endingShareData('consumption'));
  assert.equal(await result, 'shared');
});

test('cancelling the share sheet does not copy or open a fallback', async () => {
  const result = await shareEnding('witness', {
    share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); },
    clipboard: { writeText: () => assert.fail('cancel must not copy') }
  });
  assert.equal(result, 'cancelled');
});

test('unsupported or denied native sharing copies the caption and link', async () => {
  for (const share of [undefined, () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); }]) {
    let copied;
    const result = await shareEnding('breach', { share, clipboard: { writeText: async text => { copied = text; } } });
    const data = endingShareData('breach');
    assert.equal(result, 'copied');
    assert.equal(copied, `${data.text}\n${data.url}`);
  }
});

test('unavailable or blocked clipboard offers manual copying; invalid endings do nothing', async () => {
  assert.equal(await shareEnding('guide', {}), 'manual');
  assert.equal(await shareEnding('guide', { clipboard: { writeText: async () => { throw new Error(); } } }), 'manual');
  for (const ending of [null, 'unknown', '__proto__']) {
    assert.equal(endingShareData(ending), null);
    assert.equal(await shareEnding(ending, { share: () => assert.fail() }), 'unavailable');
  }
});

test('share progress counts unique discovered endings including the current ending', () => {
  assert.equal(endingShareData('consumption', []).text, "I ate the corn.\nI've found 1 of 7 endings.");
  const collected = ['witness', 'witness', 'compliance', 'unknown', '__proto__'];
  const data = endingShareData('consumption', collected);
  assert.equal(data.text, "I ate the corn.\nI've found 3 of 7 endings.");
  assert.equal(collected.length, 5, 'sharing must not change the saved collection');
  assert.match(endingShareData('witness', Object.keys(ENDINGS)).text, /7 of 7 endings/);
  assert.equal(data.url, endingShareData('consumption').url, 'collection progress belongs in the message');
});

test('native sharing and clipboard fallback both include collection progress', async () => {
  const collected = ['witness', 'consumption', 'breach'];
  let shared, copied;
  await shareEnding('witness', { share: async data => { shared = data; } }, collected);
  await shareEnding('witness', { clipboard: { writeText: async text => { copied = text; } } }, collected);
  assert.equal(shared.text, "I kept the receipts.\nI've found 3 of 7 endings.");
  assert.equal(copied, `${shared.text}\n${shared.url}`);
});
