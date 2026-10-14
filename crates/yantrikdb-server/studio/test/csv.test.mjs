import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../assets/js/ui/csv.js';

test('quotes fields containing commas, quotes and newlines', () => {
  const out = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }], ['a', 'b', 'c']);
  assert.equal(out, 'a,b,c\n"x,y","say ""hi""","l1\nl2"');
});
test('null becomes empty and objects are JSON-encoded', () => {
  assert.equal(toCsv([{ a: null, b: { k: 1 } }], ['a', 'b']), 'a,b\n,"{""k"":1}"');
});
