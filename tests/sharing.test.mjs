import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENDINGS } from '../docs/engine.js';
import { ENDING_SHARES, GUIDE_TEAM_SHARE, endingShareData, shareEnding } from '../docs/sharing.js';

test('every ending has a distinct static link preview without ending prose', () => {
  assert.deepEqual(Object.keys(ENDING_SHARES).sort(), Object.keys(ENDINGS).sort());
  for (const [id, card] of Object.entries(ENDING_SHARES)) assert.equal(ENDINGS[id].title, card.line);
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
  assert.equal(endingShareData('consumption', []).text, "I ate the corn.\nI've achieved 1 of 15 endings.");
  const collected = ['witness', 'witness', 'compliance', 'unknown', '__proto__'];
  const data = endingShareData('consumption', collected);
  assert.equal(data.text, "I ate the corn.\nI've achieved 3 of 15 endings.");
  assert.equal(collected.length, 5, 'sharing must not change the saved collection');
  assert.match(endingShareData('witness', Object.keys(ENDINGS)).text, /15 of 15 endings/);
  assert.equal(data.url, endingShareData('consumption').url, 'collection progress belongs in the message');
});

test('native sharing and clipboard fallback both include collection progress', async () => {
  const collected = ['witness', 'consumption', 'breach'];
  let shared, copied;
  await shareEnding('witness', { share: async data => { shared = data; } }, collected);
  await shareEnding('witness', { clipboard: { writeText: async text => { copied = text; } } }, collected);
  assert.equal(shared.text, "I kept the receipts.\nI've achieved 3 of 15 endings.");
  assert.equal(copied, `${shared.text}\n${shared.url}`);
});

test('only the full-team outcome gets the sheriff caption and its matching preview', async () => {
  const line = 'I shot the sheriff. And the deputy. And some third guy.';
  const full = endingShareData('guide', ['guide', 'consumption'], 'PERIMETER SECURED');
  assert.equal(full.text, `${line}\nI've achieved 2 of 15 endings.`);
  assert.equal(full.url, 'https://ryanlmelvin.github.io/debrief-corn-game/share/10/');
  assert.equal(endingShareData('guide', null, 'RECOVERY INCOMPLETE').text, ENDING_SHARES.guide.line);
  assert.equal(endingShareData('guide', null, 'PERSONNEL INCIDENT').text, ENDING_SHARES.guide_arrested.line);
  assert.equal(endingShareData('guide_shot').text, GUIDE_TEAM_SHARE.line);
  assert.equal(endingShareData('consumption', null, 'PERIMETER SECURED').text, 'I ate the corn.');
  let shared, copied;
  await shareEnding('guide', { share: async data => { shared = data; } }, ['guide', 'consumption'], 'PERIMETER SECURED');
  await shareEnding('guide', { clipboard: { writeText: async text => { copied = text; } } }, ['guide', 'consumption'], 'PERIMETER SECURED');
  assert.deepEqual(shared, full);
  assert.equal(copied, `${full.text}\n${full.url}`);
  const page = readFileSync(new URL(`../docs/share/${GUIDE_TEAM_SHARE.code}/index.html`, import.meta.url), 'utf8');
  assert.ok(page.includes(`<meta property="og:title" content="${full.title}">`));
  assert.ok(page.includes(`<meta property="og:image" content="${full.url}preview.jpg">`));
  assert.ok(page.includes(`<h1>${line}</h1>`));
  const jpg = readFileSync(new URL('../docs/share/10/preview.jpg', import.meta.url));
  assert.equal(jpg.readUInt16BE(0), 0xffd8);
});

test('an interrupted recovery interview shares its own ending without revealing the recording', () => {
  const data = endingShareData('guide_interrupted', ['guide', 'guide_shot', 'guide_arrested']);
  assert.equal(data.text, "I went off script.\nI've achieved 4 of 15 endings.");
  assert.equal(data.url, 'https://ryanlmelvin.github.io/debrief-corn-game/share/09/');
  const page = readFileSync(new URL('../docs/share/09/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /gunshot|struggle|\[static\]|rifle|interviewer/i);
});
