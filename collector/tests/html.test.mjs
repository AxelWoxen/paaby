// html.test.mjs — ren logikktest av stripHtml() (core/html.js).
//
// Kjør: cd collector && node --test tests/html.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml } from '../core/html.js';

test('fjerner tagger og beholder tekstinnhold', () => {
  assert.equal(stripHtml('<p>Monthly Jazz &amp; Jam!</p><p>19:00-23:00</p>'), 'Monthly Jazz & Jam! 19:00-23:00');
});

test('dekoder vanlige HTML-entiteter', () => {
  assert.equal(stripHtml('Fisk &amp; vilt &lt;3 &quot;bra&quot; &#039;ting&#039;'), 'Fisk & vilt <3 "bra" \'ting\'');
});

test('kollapser whitespace fra flere tagger/linjeskift', () => {
  assert.equal(stripHtml('<p>A</p>\n\n<p>B</p>   <p>C</p>'), 'A B C');
});

test('tom/kun-tagger streng → null', () => {
  assert.equal(stripHtml('<p></p>'), null);
  assert.equal(stripHtml(''), null);
});

test('ikke-streng input → null, kaster ikke', () => {
  assert.equal(stripHtml(null), null);
  assert.equal(stripHtml(undefined), null);
  assert.equal(stripHtml(123), null);
});

test('ren tekst uten HTML uendret (bortsett fra whitespace-kollaps)', () => {
  assert.equal(stripHtml('Helt vanlig tekst.'), 'Helt vanlig tekst.');
});

test('dobbelt-enkodet entitet dekodes kun én gang (trygt, ikke rekursivt)', () => {
  // Tikkio sin ekte data har av og til &amp;lt; i stedet for &lt; — én
  // dekode-runde gir "&lt;" (literal tekst), ikke "<" — dette er korrekt og
  // trygt (rekursiv dekoding kan feiltolke legitim tekst).
  assert.equal(stripHtml('a &amp;lt;3 b'), 'a &lt;3 b');
});
