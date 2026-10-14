import test from 'node:test';
import assert from 'node:assert/strict';
import { highlight } from '../assets/js/ui/highlight.js';

test('wraps matches of words longer than two characters', () => {
  assert.equal(highlight('Deploy the server', 'deploy the').toString(), '<mark>Deploy</mark> <mark>the</mark> server');
});
test('markup in the text is escaped before highlighting', () => {
  assert.equal(highlight('<script>alert(1)</script>', 'alert').toString(), '&lt;script&gt;<mark>alert</mark>(1)&lt;/script&gt;');
});
test('regex metacharacters in the query are literal', () => {
  assert.doesNotThrow(() => highlight('a.b', '.*+?'));
});
test('short or empty queries leave text untouched', () => {
  assert.equal(highlight('hello', 'he').toString(), 'hello');
  assert.equal(highlight('hello', '').toString(), 'hello');
});
