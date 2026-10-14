import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, parseHash, resolve } from '../assets/js/core/router.js';

const routes = [
  { id: 'dashboard', path: 'dashboard', match: compile('dashboard') },
  { id: 'browse', path: 'db/:db/browse', match: compile('db/:db/browse') },
];

test('parseHash strips the #/ prefix and empty segments', () => {
  assert.deepEqual(parseHash('#/db/1/browse'), ['db', '1', 'browse']);
  assert.deepEqual(parseHash(''), []);
});
test('matches literal and parameter segments', () => {
  assert.deepEqual(compile('db/:db/browse')(['db', '7', 'browse']), { db: '7' });
  assert.equal(compile('db/:db/browse')(['db', '7', 'query']), null);
  assert.equal(compile('dashboard')(['dashboard', 'x']), null);
});
test('decodes parameters', () => {
  assert.deepEqual(compile('a/:x')(['a', 'hello%20world']), { x: 'hello world' });
});
test('resolve picks the matching route', () => {
  assert.equal(resolve(routes, '#/db/3/browse').route.id, 'browse');
  assert.equal(resolve(routes, '#/db/3/browse').params.db, '3');
});
test('empty hash and unknown paths fall back to the first route', () => {
  assert.equal(resolve(routes, '').route.id, 'dashboard');
  assert.equal(resolve(routes, '#/nope/nope').route.id, 'dashboard');
});
