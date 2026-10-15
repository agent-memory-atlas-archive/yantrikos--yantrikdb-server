/**
 * Static integrity checks over the whole app — the guard that replaces
 * "open it in a browser and see if it breaks":
 *   1. every relative import / dynamic import / CSS @import resolves to a file
 *   2. every literal data-action / data-on-* name used in markup has a handler
 *   3. every route's lazy view file exists and exports render()
 *   4. index.html only references assets that exist
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const jsFiles = walk(path.join(assets, 'js')).filter((f) => f.endsWith('.js'));
const cssFiles = walk(path.join(assets, 'css')).filter((f) => f.endsWith('.css'));
const read = (f) => fs.readFileSync(f, 'utf8');

test('relative JS imports resolve', () => {
  const importRe = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const file of jsFiles) {
    for (const m of read(file).matchAll(importRe)) {
      const target = path.resolve(path.dirname(file), m[1]);
      assert.ok(fs.existsSync(target), `${path.relative(root, file)} imports missing ${m[1]}`);
    }
  }
});

test('CSS @imports resolve', () => {
  for (const file of cssFiles) {
    for (const m of read(file).matchAll(/@import url\("\/admin\/assets\/([^"]+)"\)/g)) {
      assert.ok(fs.existsSync(path.join(assets, m[1])), `${path.relative(root, file)} imports missing ${m[1]}`);
    }
  }
});

test('every literal action used in markup is registered', () => {
  const registered = new Set();
  const used = new Map();
  for (const file of jsFiles) {
    const src = read(file);
    for (const block of src.matchAll(/actions\(\{([\s\S]*?)\n\}\);/g)) {
      for (const k of block[1].matchAll(/^\s{2}(?:'([\w.]+)'|([a-z]\w*))\s*:/gm)) registered.add(k[1] || k[2]);
    }
    // single-line registrations: actions({ 'a.b': fn, c: fn })
    for (const line of src.matchAll(/actions\(\{([^\n]*)\}\);/g)) {
      for (const k of line[1].matchAll(/(?:^\s*|,\s*)(?:'([\w.]+)'|([a-z]\w*))\s*:/g)) registered.add(k[1] || k[2]);
    }
    for (const m of src.matchAll(/data-(?:action|on-input|on-change|on-enter|on-ctrl-enter)="([\w.]+)"/g)) {
      used.set(m[1], path.relative(root, file));
    }
  }
  // segmented() receives its action name as an argument.
  for (const file of jsFiles) {
    for (const m of read(file).matchAll(/segmented\([^;]*?,\s*'([\w.]+)'\)/g)) used.set(m[1], path.relative(root, file));
  }
  const html = read(path.join(root, 'index.html'));
  for (const m of html.matchAll(/data-(?:action|on-change)="([\w.]+)"/g)) used.set(m[1], 'index.html');

  const missing = [...used].filter(([name]) => !registered.has(name));
  assert.deepEqual(missing, [], `actions with no handler: ${missing.map(([n, f]) => `${n} (${f})`).join(', ')}`);
});

test('every route view exists and exports render()', async () => {
  const routes = read(path.join(assets, 'js/app/routes.js'));
  const names = [...routes.matchAll(/view:\s*v\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(names.length >= 10, 'route table parsed');
  for (const n of names) {
    const file = path.join(assets, 'js/views', `${n}.js`);
    assert.ok(fs.existsSync(file), `view ${n}.js missing`);
    assert.match(read(file), /export default\s*\{[\s\S]*render\s*\(/, `${n}.js must export default { render }`);
  }
});

test('index.html references only existing assets', () => {
  const html = read(path.join(root, 'index.html'));
  for (const m of html.matchAll(/(?:href|src)="\/admin\/assets\/([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(assets, m[1])), `index.html references missing ${m[1]}`);
  }
});

test('no inline event handlers or inline scripts (strict CSP)', () => {
  const html = read(path.join(root, 'index.html'));
  assert.ok(!/\son\w+\s*=/.test(html), 'index.html has an inline on* handler');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'index.html has an inline <script>');
  for (const file of jsFiles) {
    assert.ok(!/\son(click|input|change|keydown|submit)\s*=\s*"/.test(read(file)), `${path.relative(root, file)} emits an inline handler`);
  }
});
