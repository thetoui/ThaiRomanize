#!/usr/bin/env node
/*
 * Writes the data files in scripts/data/ into assets/js/thai-romanize.js, so the
 * library stays a single dependency-free file.
 *
 *   node scripts/build-data.js
 *       scripts/data/exceptions.tsv -> EXCEPTIONS  (word <TAB> reading, e.g. ราชการ	rat2-cha3-kan0)
 *       scripts/data/words.txt      -> WORDS       (one word per line, most frequent first)
 *
 *   node scripts/build-data.js --words-from <word-freq.tsv> [count=6000]
 *       first regenerates scripts/data/words.txt from a "word<TAB>frequency" file, e.g.
 *       tnc_freq.txt (Thai National Corpus frequencies, CC0) from PyThaiNLP:
 *       pythainlp/corpus/tnc_freq.txt
 *
 * Reading format: syllables joined by "-", each ending in its tone digit
 * (0 mid, 1 low, 2 falling, 3 high, 4 rising). A key ending in "-" is a prefix
 * that only applies when more syllables follow (ราช-	rat2-cha3).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'assets', 'js', 'thai-romanize.js');
const EXCEPTIONS = path.join(__dirname, 'data', 'exceptions.tsv');
const WORDS = path.join(__dirname, 'data', 'words.txt');

const THAI_WORD = /^[ก-ฺเ-ๅ็-๎]{2,}$/;   // Thai letters only — no ๆ ฯ digits
const READING = /^([a-z]+[0-4])(-[a-z]+[0-4])*$/;

function die(msg) { console.error(msg); process.exit(1); }

function regenerateWords(src, count) {
  const seen = new Set();
  const words = [];
  fs.readFileSync(src, 'utf8').split('\n')
    .map(line => line.split('\t'))
    .filter(r => r.length >= 2 && THAI_WORD.test(r[0]) && !/^(.)\1+$/.test(r[0]))
    .map(r => [r[0], parseInt(r[1], 10) || 0])
    .sort((a, b) => b[1] - a[1])
    .forEach(([w]) => { if (words.length < count && !seen.has(w)) { seen.add(w); words.push(w); } });
  fs.writeFileSync(WORDS, words.join('\n') + '\n');
  console.log('wrote ' + words.length + ' words to ' + path.relative(ROOT, WORDS));
}

function jsString(s) { return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

function replaceBlock(src, name, body) {
  const re = new RegExp('(// @@' + name + '-BEGIN[^\\n]*\\n)[\\s\\S]*?(\\n[ \\t]*// @@' + name + '-END)');
  if (!re.test(src)) die('markers @@' + name + '-BEGIN / -END not found in ' + ENGINE);
  return src.replace(re, (m, a, b) => a + body + b);
}

const args = process.argv.slice(2);
if (args[0] === '--words-from') {
  if (!args[1]) die('usage: node scripts/build-data.js --words-from <word-freq.tsv> [count]');
  regenerateWords(args[1], parseInt(args[2] || '6000', 10));
}

// --- exceptions ---
const entries = new Map();
fs.readFileSync(EXCEPTIONS, 'utf8').split('\n').forEach((line, i) => {
  if (!line.trim() || line.startsWith('#')) return;
  const [word, reading] = line.split('\t').map(x => (x || '').trim());
  if (!word || !READING.test(reading || '')) die(`exceptions.tsv:${i + 1}: bad line: ${line}`);
  if (entries.has(word) && entries.get(word) !== reading) die(`exceptions.tsv:${i + 1}: ${word} listed twice`);
  entries.set(word, reading);
});
const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0], 'th'));
const exLines = [];
for (let i = 0; i < sorted.length; i += 4) {
  exLines.push('    ' + sorted.slice(i, i + 4).map(([w, r]) => jsString(w) + ': ' + jsString(r)).join(', '));
}
const exBlock = '  var EXCEPTIONS = {\n' + exLines.join(',\n') + '\n  };';

// --- words ---
const words = fs.readFileSync(WORDS, 'utf8').split('\n').map(w => w.trim()).filter(Boolean);
words.forEach((w, i) => { if (!THAI_WORD.test(w)) die(`words.txt:${i + 1}: not a Thai word: ${w}`); });
const wLines = [];
for (let i = 0; i < words.length; i += 20) wLines.push('    ' + jsString(words.slice(i, i + 20).join('|')));
const wBlock = '  var WORDS = [\n' + wLines.join(',\n') + '\n  ].join(\'|\');';

let src = fs.readFileSync(ENGINE, 'utf8');
src = replaceBlock(src, 'EXCEPTIONS', exBlock);
src = replaceBlock(src, 'WORDS', wBlock);
fs.writeFileSync(ENGINE, src);
console.log(`wrote ${entries.size} exceptions and ${words.length} words to ${path.relative(ROOT, ENGINE)}`);
