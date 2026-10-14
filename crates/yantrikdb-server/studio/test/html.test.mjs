import test from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, join, escape } from '../assets/js/core/html.js';

test('interpolations are escaped by default', () => {
  const evil = '<img src=x onerror=alert(1)>"\'`&';
  assert.equal(html`<p>${evil}</p>`.toString(), '<p>&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;&amp;</p>');
});

test('nested html passes through unescaped, once', () => {
  const inner = html`<b>${'<i>'}</b>`;
  assert.equal(html`<p>${inner}</p>`.toString(), '<p><b>&lt;i&gt;</b></p>');
});

test('arrays are flattened and each item escaped', () => {
  assert.equal(html`<ul>${['<a>', html`<li>x</li>`]}</ul>`.toString(), '<ul>&lt;a&gt;<li>x</li></ul>');
});

test('null, undefined, true and false render nothing; 0 renders', () => {
  assert.equal(html`[${null}${undefined}${false}${true}${0}]`.toString(), '[0]');
});

test('raw() opts out of escaping', () => {
  assert.equal(html`${raw('<hr>')}`.toString(), '<hr>');
});

test('attribute context is safe against quote breakout', () => {
  const v = '" onmouseover="alert(1)';
  assert.ok(!html`<a title="${v}">`.toString().includes('" onmouseover'));
});

test('join() joins with a separator', () => {
  assert.equal(join(['a', html`<b>`], ', ').toString(), 'a, <b>');
});

test('escape() handles non-strings', () => {
  assert.equal(escape(5), '5');
  assert.equal(escape(null), '');
});
