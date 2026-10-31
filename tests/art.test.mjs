import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame, EVIDENCE } from '../docs/engine.js';
import { notebookMarkup, interviewRecord, SPECIMENS } from '../docs/art.js';

test('notebook exposes only discovered exhibits and clamps page navigation', () => {
  const game=createGame();
  // Keep these exact-copy assertions on the original notebook presentation.
  game.evidenceScenes=Object.fromEntries(Object.keys(EVIDENCE).map(id=>[id,0]));
  assert.match(notebookMarkup(game), /No notes yet/);
  game.evidence=['dress','ledger'];
  const first=notebookMarkup(game,-10), last=notebookMarkup(game,100);
  assert.match(first,/Field sketch: White fabric/);
  assert.match(last,/Field sketch: Application record/);
  assert.doesNotMatch(first,/Field sketch: Application record/);
  for(const [id,e] of Object.entries(EVIDENCE))if(!game.evidence.includes(id))assert.ok(!first.includes(e.title));
  assert.match(last,/02 \/ 02/);
});

test('testimony pages keep reported text inert and preserve withheld observations', () => {
  const game=createGame();
  game.reports=[{shift:0,question:'<img src=x onerror=alert(1)>',answer:'A & B',supervisorReply:'<script>bad</script>',redacted:true}];
  const html=notebookMarkup(game);
  assert.match(html,/Observation withheld/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/A &amp; B/);
  assert.doesNotMatch(html,/<script>/);
});

test('every exhibit has a distinct illustration and all art ships in the offline cache', () => {
  assert.deepEqual(Object.keys(SPECIMENS).sort(),Object.keys(EVIDENCE).sort());
  assert.equal(new Set(Object.values(SPECIMENS).map(s=>s.cell)).size,9);
  const worker=readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8');
  for(const name of readdirSync(new URL('../docs/assets/',import.meta.url)).filter(n=>n.endsWith('.webp')))assert.ok(worker.includes(`'./assets/${name}'`),`${name} must work offline`);
  for(const name of ['art.js','art.css'])assert.ok(worker.includes(`'./${name}'`));
});

test('the interview tape shows only the latest completed answer from this shift', () => {
  const game=createGame();
  game.shift=1;
  game.evidence=['dress','ledger'];
  game.reports=[{shift:0,answer:'Previous night'}];
  assert.match(interviewRecord(game),/No statement on record/);
  assert.doesNotMatch(interviewRecord(game),/Previous night|White fabric|Application record/);
  game.reports.push({shift:1,answer:'First answer'},{shift:1,answer:'<b>My statement & nothing else</b>'});
  const html=interviewRecord(game);
  assert.match(html,/02 \/ 03 RECORDED/);
  assert.match(html,/&lt;b&gt;My statement &amp; nothing else&lt;\/b&gt;/);
  assert.doesNotMatch(html,/First answer|Previous night|<b>/);
});
