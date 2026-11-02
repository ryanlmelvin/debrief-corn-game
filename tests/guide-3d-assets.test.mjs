import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('the recovery renderer and all its Three.js dependencies resolve under a Pages subdirectory and are cached offline', () => {
  const origin = new URL('https://example.test/debrief-corn-game/');
  const docs = new URL('../docs/', import.meta.url);
  const worker = readFileSync(new URL('sw.js', docs), 'utf8');
  const queue = ['guide-3d-ui.js'], visited = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(existsSync(new URL(file, docs)), `${file} exists in the deployed files`);
    assert.ok(worker.includes(`'./${file}'`), `${file} is available offline`);
    const source = readFileSync(new URL(file, docs), 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"\n]+)\1/g)];
    for (const [, , specifier] of imports) {
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `${file} has no CDN or origin-root dependency: ${specifier}`);
      const url = new URL(specifier, new URL(file, origin));
      assert.ok(url.href.startsWith(origin.href));
      queue.push(url.href.slice(origin.href.length));
    }
  }
  assert.ok(visited.has('guide-world.js'));
  assert.ok(visited.has('guide-people.js'));
  assert.ok(visited.has('vendor/three/three.module.js'));
  assert.ok(visited.has('vendor/three/three.core.js'));
  assert.ok(existsSync(new URL('vendor/three/LICENSE', docs)));
  const world = readFileSync(new URL('guide-world.js', docs), 'utf8');
  assert.ok(world.includes('import.meta.url'), 'Artwork URLs resolve from the deployed module');
  assert.ok(!world.includes('/game/'), 'The renderer does not depend on the trial server');
});
