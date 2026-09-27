'use strict';
// Run with: npm test   (or: node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../assets/js/thai-romanize.js');
const CASES = require('./cases.js');

const reading = w => R.romanizeWord(w).map(s => s.r + s.t).join('-');

for (const [group, cases] of Object.entries(CASES)) {
  test(group, () => {
    for (const [thai, expected] of Object.entries(cases)) {
      assert.equal(reading(thai), expected, thai);
    }
  });
}

test('every exception in scripts/data/exceptions.tsv reads as written', () => {
  const file = path.join(__dirname, '..', 'scripts', 'data', 'exceptions.tsv');
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [word, expected] = line.split('\t');
    if (word.endsWith('-')) continue;               // prefixes need a following syllable
    assert.equal(reading(word), expected, word);
  }
});

test('prefix entries apply only when more syllables follow', () => {
  assert.equal(reading('ราชการ'), 'rat2-cha3-kan0');
  assert.equal(reading('มหาราช'), 'ma3-ha4-rat2');
  assert.equal(reading('สุรชัย'), 'su1-ra3-chai0');
  assert.equal(reading('สุรา'), 'su1-ra0');
  assert.equal(reading('อรุณ'), 'a1-run0');
});

test('default output: tone marks, hyphens, lower case', () => {
  assert.equal(R.romanize('สวัสดีครับ').text, 'sà-wàt-di-khráp');
  assert.equal(R.romanize('สวัสดีครับ ยินดีที่ได้รู้จัก').text, 'sà-wàt-di-khráp yin-di-thî-dâi-rú-chàk');
});

test('format options (README table)', () => {
  const r = opts => R.romanize('สวัสดี', opts).text;
  assert.equal(r({ tone: false, separator: 'join', case: 'lower' }), 'sawatdi');
  assert.equal(r({ tone: false, separator: 'join', case: 'sentence' }), 'Sawatdi');
  assert.equal(r({ tone: false, separator: 'join', case: 'title' }), 'SaWatDi');
  assert.equal(r({ tone: false, separator: 'space', case: 'lower' }), 'sa wat di');
  assert.equal(r({ tone: false, separator: 'space', case: 'sentence' }), 'Sa wat di');
  assert.equal(r({ tone: false, separator: 'space', case: 'title' }), 'Sa Wat Di');
  assert.equal(r({ tone: false, separator: 'hyphen', case: 'lower' }), 'sa-wat-di');
  assert.equal(r({ tone: false, separator: 'hyphen', case: 'sentence' }), 'Sa-wat-di');
  assert.equal(r({ tone: false, separator: 'hyphen', case: 'title' }), 'Sa-Wat-Di');
  assert.equal(r(), 'sà-wàt-di');
  assert.equal(r({ mode: 'plain' }), 'sawatdi');
  assert.equal(r({ mode: 'segmented' }), 'sa-wat-di');
  assert.equal(r({ mode: 'plain', tone: true }), 'sàwàtdi');
  assert.equal(R.romanize('กรุงเทพมหานคร', { mode: 'plain' }).text, 'krungthepmahanakhon');
});

test('non-Thai text is kept; Thai digits become Arabic digits', () => {
  assert.equal(R.romanize('Hello สวัสดี World 123').text, 'Hello sà-wàt-di World 123');
  assert.equal(R.romanize('๑๒๓').text, '123');
  assert.equal(R.romanize('ปี ๒๕๖๘').text, 'pi 2568');
  assert.equal(R.romanize('ราคา ๑,๒๐๐ บาท').text, 'ra-kha 1,200 bàt');
  assert.equal(R.romanize('').text, '');
  assert.equal(R.romanize(null).text, '');
});

test('ฯ and ฯลฯ', () => {
  assert.equal(R.romanize('กรุงเทพฯ').text, 'krung-thêp');
  assert.equal(reading('ฯลฯ'), 'lae3-uen1-uen1');
});

test('result shape: syllable count and per-token detail', () => {
  const res = R.romanize('สวัสดี ครับ');
  assert.equal(res.syllables, 4);
  assert.equal(res.detail.length, 2);
  assert.equal(res.detail[0].thai, 'สวัสดี');
  assert.deepEqual(res.detail[0].syls.map(s => s.r), ['sa', 'wat', 'di']);
});

test('romanizeWord returns fresh objects (internal cache is not exposed)', () => {
  const a = R.romanizeWord('ภาษาไทย');
  a[0].r = 'changed';
  a.push({ r: 'x', t: 0 });
  assert.equal(reading('ภาษาไทย'), 'pha0-sa4-thai0');
});

test('applyTone', () => {
  assert.equal(R.applyTone('a', 1), 'à');
  assert.equal(R.applyTone('khrap', 3), 'khráp');
  assert.equal(R.applyTone('suea', 4), 'sǔea');
  assert.equal(R.applyTone('ngan', 0), 'ngan');
});

test('common typing mistakes are tolerated', () => {
  assert.equal(reading('เเมว'), 'maeo0');       // เ + เ instead of แ
  assert.equal(reading('นํ้า'), 'nam3');         // ํ + ้ + า instead of ้ + ำ
  assert.equal(reading('ก่ิน'), 'kin1');         // tone mark typed before the vowel
});

test('garbage input never throws', () => {
  for (const s of ['ๆๆ', 'ฯฯ', '่', 'า', 'เ', '์', 'ั', 'ฤ', 'ฦๅ', 'กกกกกกกกกก', 'เเเ', '๏๚๛']) {
    assert.doesNotThrow(() => R.romanize(s), s);
  }
});

test('long text stays fast', () => {
  const para = 'ประเทศไทยมีประวัติศาสตร์อันยาวนานและวัฒนธรรมที่หลากหลาย';
  const start = Date.now();
  R.romanize(para.repeat(100));
  assert.ok(Date.now() - start < 2000);
});
