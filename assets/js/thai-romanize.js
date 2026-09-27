/*!
 * thai-romanize.js
 * ตัวแปลงอักษรไทยเป็นอักษรโรมัน (RTGS) + เครื่องหมายวรรณยุกต์
 * Rule-based Thai -> Latin transliteration engine, no dependencies.
 *
 * Output modes:
 *   'plain'     -> RTGS style, syllables joined      : sawatdi
 *   'segmented' -> syllables separated by hyphen     : sa-wat-di
 *   'tones'     -> segmented + tone diacritics       : sà-wàt-di
 *
 * How it works (short version):
 *   1. normalise the spelling (ตัวการันต์, ฤ/ฦ, ร หัน, typing-order fixes)
 *   2. list every way a syllable could start at each position — explicit
 *      vowel patterns, dictionary words, implicit vowels (สระอะ/โอะ ลดรูป),
 *      a leading vowel that belongs to the 2nd consonant (เสนอ, แสดง) ...
 *   3. pick the cheapest path through the whole string (dynamic programming),
 *      so one greedy mistake can no longer wreck the rest of the word
 *   4. work out each syllable's tone from its consonant class, tone mark,
 *      live/dead ending and vowel length (plus อักษรนำ)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ThaiRomanizer = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Character data
   * ------------------------------------------------------------------ */

  var MID  = 'กจฎฏดตบปอ';
  var HIGH = 'ขฃฉฐถผฝศษสห';
  var LOW  = 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮฤฦ';

  var CLASS = {};
  MID.split('').forEach(function (c) { CLASS[c] = 'mid'; });
  HIGH.split('').forEach(function (c) { CLASS[c] = 'high'; });
  LOW.split('').forEach(function (c) { CLASS[c] = 'low'; });

  // เสียงพยัญชนะต้น
  var INIT = {
    'ก': 'k',  'ข': 'kh', 'ฃ': 'kh', 'ค': 'kh', 'ฅ': 'kh', 'ฆ': 'kh',
    'ง': 'ng', 'จ': 'ch', 'ฉ': 'ch', 'ช': 'ch', 'ซ': 's',  'ฌ': 'ch',
    'ญ': 'y',  'ฎ': 'd',  'ฏ': 't',  'ฐ': 'th', 'ฑ': 'th', 'ฒ': 'th',
    'ณ': 'n',  'ด': 'd',  'ต': 't',  'ถ': 'th', 'ท': 'th', 'ธ': 'th',
    'น': 'n',  'บ': 'b',  'ป': 'p',  'ผ': 'ph', 'ฝ': 'f',  'พ': 'ph',
    'ฟ': 'f',  'ภ': 'ph', 'ม': 'm',  'ย': 'y',  'ร': 'r',  'ล': 'l',
    'ว': 'w',  'ศ': 's',  'ษ': 's',  'ส': 's',  'ห': 'h',  'ฬ': 'l',
    'อ': '',   'ฮ': 'h',  'ฤ': 'r',  'ฦ': 'l'
  };

  // เสียงตัวสะกด
  var FIN = {
    'ก': 'k',  'ข': 'k',  'ค': 'k',  'ฆ': 'k',  'ง': 'ng',
    'จ': 't',  'ช': 't',  'ซ': 't',  'ฌ': 't',  'ฎ': 't', 'ฏ': 't',
    'ฐ': 't',  'ฑ': 't',  'ฒ': 't',  'ด': 't',  'ต': 't', 'ถ': 't',
    'ท': 't',  'ธ': 't',  'ศ': 't',  'ษ': 't',  'ส': 't',
    'ญ': 'n',  'ณ': 'n',  'น': 'n',  'ร': 'n',  'ล': 'n', 'ฬ': 'n',
    'บ': 'p',  'ป': 'p',  'พ': 'p',  'ฟ': 'p',  'ภ': 'p',
    'ม': 'm',  'ย': 'y',  'ว': 'o'
  };

  // อักษรควบ + อักษรนำ (ห นำ / อ นำ)
  var CLUSTER = {
    // ควบแท้
    'กร': 'kr',  'กล': 'kl',  'กว': 'kw',
    'ขร': 'khr', 'ขล': 'khl', 'ขว': 'khw',
    'คร': 'khr', 'คล': 'khl', 'คว': 'khw',
    'ตร': 'tr',
    'ปร': 'pr',  'ปล': 'pl',
    'ผล': 'phl',
    'พร': 'phr', 'พล': 'phl',
    // ควบไม่แท้: ทร อ่าน ซ, ร ไม่ออกเสียงหลัง จ ศ ส ซ
    'ทร': 's',   'ศร': 's',   'สร': 's',   'ซร': 's',
    // ฤ ควบกล้ำ (normalize เติมสระ ิ / ึ ให้แล้ว เช่น อังกฤษ ทฤษฎี พฤษภาคม)
    'กฤ': 'kr',  'ตฤ': 'tr',  'ทฤ': 'thr', 'ปฤ': 'pr',  'พฤ': 'phr',
    // ห นำ (อ นำ ย มีแค่ 4 คำ: อย่า อยู่ อย่าง อยาก — อยู่ในพจนานุกรม)
    'หง': 'ng',  'หญ': 'y',  'หน': 'n',  'หม': 'm',  'หย': 'y',
    'หร': 'r',   'หล': 'l',  'หว': 'w',  'หฬ': 'l',
    // อักษรควบในคำยืม (ฟรี บล็อก ดราม่า แบรนด์)
    'บร': 'br',  'บล': 'bl', 'ดร': 'dr', 'ฟร': 'fr', 'ฟล': 'fl'
  };
  // คู่ที่ไม่ใช่อักษรควบภาษาไทยแท้ — ไม่ได้แต้มต่อเวลาเลือกวิธีตัดพยางค์
  var WEAK_CLUSTER = { 'บร': 1, 'บล': 1, 'ดร': 1, 'ฟร': 1, 'ฟล': 1 };

  function clusterClass(pair) {
    if (pair.charAt(0) === 'ห') return 'high';
    return CLASS[pair.charAt(0)] || 'low';
  }

  var CONS_RE  = /[ก-ฮ]/;
  var TONE_RE  = /[่-๋]/;
  // สระ/เครื่องหมายที่ต้องเกาะหลังพยัญชนะ (ถ้าตามหลังตัวไหน ตัวนั้นเป็นตัวสะกดไม่ได้)
  var BOUND_RE = /[ะ-ฺๅ็-๎]/;
  var LEAD_RE  = /[เ-ไ]/;
  // อักษรไทยที่ประมวลผลเป็นคำอ่าน (ไม่รวม ฿ เลขไทย ๏ ๚ ๛)
  var THAI_RE  = /[ก-ฺเ-๎]/;
  var THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

  function isCons(c) { return !!c && CONS_RE.test(c); }
  function isBound(c) { return !!c && BOUND_RE.test(c); }

  var SONORANT = 'งญณนมยรลวฬ'; // พยัญชนะเสียงก้องที่รับการนำได้

  /* ------------------------------------------------------------------ *
   * 2. Tone rules  (0=สามัญ 1=เอก 2=โท 3=ตรี 4=จัตวา)
   * ------------------------------------------------------------------ */

  function toneOf(cls, mark, isDead, isLong) {
    if (mark === '่') return cls === 'low' ? 2 : 1;   // ไม้เอก
    if (mark === '้') return cls === 'low' ? 3 : 2;   // ไม้โท
    if (mark === '๊') return 3;                        // ไม้ตรี
    if (mark === '๋') return 4;                        // ไม้จัตวา
    if (!isDead) return cls === 'high' ? 4 : 0;             // คำเป็น
    if (cls === 'mid' || cls === 'high') return 1;          // คำตาย อักษรกลาง/สูง
    return isLong ? 2 : 3;                                  // คำตาย อักษรต่ำ
  }

  var TONE_MARKS = {
    'a': ['a', 'à', 'â', 'á', 'ǎ'],
    'e': ['e', 'è', 'ê', 'é', 'ě'],
    'i': ['i', 'ì', 'î', 'í', 'ǐ'],
    'o': ['o', 'ò', 'ô', 'ó', 'ǒ'],
    'u': ['u', 'ù', 'û', 'ú', 'ǔ']
  };

  function applyTone(roman, tone) {
    if (!tone) return roman;
    for (var i = 0; i < roman.length; i++) {
      var ch = roman.charAt(i);
      if (TONE_MARKS[ch]) {
        return roman.slice(0, i) + TONE_MARKS[ch][tone] + roman.slice(i + 1);
      }
    }
    return roman;
  }

  /* ------------------------------------------------------------------ *
   * 3. Syllable patterns
   * ------------------------------------------------------------------ */

  var I = '\u0001';            // ช่องพยัญชนะต้น (แทนที่ตอนสร้าง regex)
  var T = '([่-๋]?)';
  // ตัวสะกด — ไม่รวม ย ว เพราะ ย/ว ท้ายสระมีรูปแบบสระประสมของมันเองด้านล่าง
  // (ไม่งั้น "นิยม" จะถูกอ่านเป็น นิย-ม)
  var F = '([กขคฆงจชซฌฎฏฐฑฒดตถทธศษสญณนรลฬบปพฟภม])';

  // [pattern, vowel, isLong, hasFinal]
  var RAW_PATTERNS = [
    ['เ' + I + 'ี' + T + 'ยว', 'iao', true,  false],
    ['เ' + I + 'ื' + T + 'อย', 'ueai', true, false],
    [I + 'ั' + T + 'วย',       'uai', true,  false],
    [I + T + 'วย',             'uai', true,  false],

    ['เ' + I + 'ี' + T + 'ยะ', 'ia',  false, false],
    ['เ' + I + 'ี' + T + 'ย' + F, 'ia', true, true],
    ['เ' + I + 'ี' + T + 'ย',  'ia',  true,  false],

    ['เ' + I + 'ื' + T + 'อะ', 'uea', false, false],
    ['เ' + I + 'ื' + T + 'อ' + F, 'uea', true, true],
    ['เ' + I + 'ื' + T + 'อ',  'uea', true,  false],

    [I + 'ั' + T + 'วะ',       'ua',  false, false],
    [I + 'ั' + T + 'ว',        'ua',  true,  false],
    [I + T + 'ว' + F,          'ua',  true,  true],

    ['เ' + I + T + 'อะ',       'oe',  false, false],
    ['เ' + I + 'ิ' + T + F,    'oe',  true,  true],
    ['เ' + I + T + 'อ' + F,    'oe',  true,  true],
    ['เ' + I + T + 'อ',        'oe',  true,  false],

    ['เ' + I + T + 'าะ',       'o',   false, false],
    ['เ' + I + T + 'า',        'ao',  true,  false],

    ['เ' + I + '็' + T + 'ว',  'eo',  false, false],
    ['เ' + I + '็' + T + F,    'e',   false, true],
    ['เ' + I + '็' + T,        'e',   false, false],
    ['เ' + I + T + 'ะ',        'e',   false, false],
    ['เ' + I + T + 'ย',        'oei', true,  false],
    ['เ' + I + T + 'ว',        'eo',  true,  false],
    ['เ' + I + T + F,          'e',   true,  true],
    ['เ' + I + T,              'e',   true,  false],

    ['แ' + I + '็' + T + 'ว',  'aeo', false, false],
    ['แ' + I + '็' + T + F,    'ae',  false, true],
    ['แ' + I + T + 'ะ',        'ae',  false, false],
    ['แ' + I + T + 'ว',        'aeo', true,  false],
    ['แ' + I + T + F,          'ae',  true,  true],
    ['แ' + I + T,              'ae',  true,  false],

    ['โ' + I + T + 'ะ',        'o',   false, false],
    ['โ' + I + T + 'ย',        'oi',  true,  false],
    ['โ' + I + T + F,          'o',   true,  true],
    ['โ' + I + T,              'o',   true,  false],

    ['ใ' + I + T,              'ai',  false, false],
    ['ไ' + I + T + 'ย',        'ai',  false, false],
    ['ไ' + I + T,              'ai',  false, false],

    [I + 'ั' + T + 'ย',        'ai',  false, false],
    [I + 'ั' + T + F,          'a',   false, true],

    [I + T + 'ะ',              'a',   false, false],
    [I + T + 'าย',             'ai',  true,  false],
    [I + T + 'าว',             'ao',  true,  false],
    [I + T + 'า' + F,          'a',   true,  true],
    [I + T + 'า',              'a',   true,  false],
    [I + T + 'ำ',              'am',  false, false],

    [I + 'ิ' + T + 'ว',        'io',  false, false],
    [I + 'ิ' + T + F,          'i',   false, true],
    [I + 'ิ' + T,              'i',   false, false],

    [I + 'ี' + T + F,          'i',   true,  true],
    [I + 'ี' + T,              'i',   true,  false],

    [I + 'ึ' + T + F,          'ue',  false, true],
    [I + 'ึ' + T,              'ue',  false, false],

    [I + 'ื' + T + 'อ',        'ue',  true,  false],
    [I + 'ื' + T + F,          'ue',  true,  true],

    [I + 'ุ' + T + 'ย',        'ui',  false, false],
    [I + 'ุ' + T + F,          'u',   false, true],
    [I + 'ุ' + T,              'u',   false, false],

    [I + 'ู' + T + F,          'u',   true,  true],
    [I + 'ู' + T,              'u',   true,  false],

    [I + T + '็อ' + F,         'o',   false, true],
    [I + T + '็อย',            'oi',  false, false],
    [I + T + 'อย',             'oi',  true,  false],
    [I + T + 'อ' + F,          'o',   true,  true],
    [I + T + 'อ',              'o',   true,  false],

    // สระ โอะ ลดรูป ที่มีรูปวรรณยุกต์กำกับ เช่น ส่ง ต้น
    [I + '([่-๋])' + F,        'o',   false, true],

    // ร หัน: รร + ตัวสะกด = อะ + ตัวสะกด (ธรรม พรรค), รร เปล่า = อัน (บรร-จบ สวรรค์)
    [I + T + 'รร' + F,         'a',   false, true],
    [I + T + 'รร',             'a',   false, 'น'],

    // สระท้ายคำที่ไม่ออกเสียง ตัวหน้ากลายเป็นตัวสะกด:
    // ประวัติ บัญญัติ สมบัติ / ชาติ ญาติ / เหตุ
    [I + 'ั' + T + F + '[ิุ]', 'a',   false, true],
    [I + T + 'า(ต)ิ',          'a',   true,  true],
    ['เ' + I + T + '(ต)ุ',     'e',   true,  true]
  ];

  // ตัวสุดท้ายของพยางค์ต้องไม่มีสระ/วรรณยุกต์ตามหลัง (ไม่งั้นมันคือพยัญชนะต้นของพยางค์ถัดไป)
  var NF = '(?![ะ-ฺๅ็-๎])';

  var I_CLUSTER = '(' + Object.keys(CLUSTER).join('|') + ')';
  var I_SINGLE  = '([ก-ฮ])';

  // fin: true = ตัวสะกดอยู่ใน capture group ที่ 3, string = ตัวสะกดตายตัว (รร = น)
  function compile(p, initial) {
    return {
      re: new RegExp('^(?:' + p[0].split(I).join(initial) + ')' + NF),
      v: p[1], long: p[2], fin: p[3]
    };
  }
  var PATTERNS_CLUSTER = RAW_PATTERNS.map(function (p) { return compile(p, I_CLUSTER); });
  var PATTERNS_SINGLE  = RAW_PATTERNS.map(function (p) { return compile(p, I_SINGLE); });

  // ตัวสะกดที่มักตามด้วย ร ไม่ออกเสียง: บัตร มิตร เพชร สมุทร จักร สมัคร
  var SILENT_R_AFTER = 'ตทชกค';

  /* ------------------------------------------------------------------ *
   * 4. Exception dictionary  (word -> "syl<tone>-syl<tone>")
   *    A key ending in "-" is a prefix: it only applies when another
   *    syllable follows (ราช- -> ราชการ, but มหาราช still ends in "rat").
   * ------------------------------------------------------------------ */

  var DICT = {
    'ก็': 'ko2', 'ก็ได้': 'ko2-dai2', 'ณ': 'na3', 'ธ': 'tho0', 'บ่': 'bo1',
    'ฯลฯ': 'lae3-uen1-uen1',
    'จริง': 'ching0', 'จริงๆ': 'ching0-ching0',
    'ปรากฏ': 'pra0-kot1', 'ผลิต': 'pha1-lit1', 'ผลไม้': 'phon4-la3-mai3',
    'ผลงาน': 'phon4-ngan0', 'ผลิตภัณฑ์': 'pha1-lit1-ta1-phan0',
    'บริ-': 'bo0-ri3',
    'บริษัท': 'bo0-ri3-sat1', 'บริการ': 'bo0-ri3-kan0', 'บริเวณ': 'bo0-ri3-wen0',
    'บริหาร': 'bo0-ri3-han4', 'บริสุทธิ์': 'bo0-ri3-sut1',
    'ทรมาน': 'tho0-ra3-man0', 'ทรัพย์': 'sap3', 'ทราบ': 'sap2', 'ทราย': 'sai0',
    'เศร้า': 'sao2', 'ศรี': 'si4', 'สร้าง': 'sang2', 'สระ': 'sa1',
    'สรุป': 'sa1-rup1', 'เสร็จ': 'set1',
    'อังกฤษ': 'ang0-krit1', 'ฤดู': 'rue3-du0', 'ฤทธิ์': 'rit3',
    'พฤษภาคม': 'phruet3-sa1-pha0-khom0', 'พฤหัสบดี': 'pha3-rue3-hat1-sa1-bo0-di0',
    'สวัสดี': 'sa1-wat1-di0', 'สวัสดีครับ': 'sa1-wat1-di0-khrap3',
    'ขอบคุณ': 'khop1-khun0', 'ขอโทษ': 'kho4-thot2',
    'ครับ': 'khrap3', 'ค่ะ': 'kha2', 'คะ': 'kha3', 'ค่ะ/ครับ': 'kha2-khrap3',
    'นะ': 'na3', 'จ้า': 'cha2', 'ฮะ': 'ha3',
    'อะไร': 'a1-rai0', 'ทำไม': 'tham0-mai0', 'เท่าไหร่': 'thao2-rai1',
    'เท่าไร': 'thao2-rai0', 'อย่างไร': 'yang1-rai0', 'ยังไง': 'yang0-ngai0',
    'ที่ไหน': 'thi2-nai4', 'เมื่อไหร่': 'muea2-rai1', 'ใคร': 'khrai0',
    'ประเทศ': 'pra1-thet2', 'ประเทศไทย': 'pra1-thet2-thai0',
    'ประชาชน': 'pra1-cha0-chon0', 'ประชุม': 'pra1-chum0', 'ประมาณ': 'pra1-man0',
    'ประวัติ': 'pra1-wat1', 'ประสบการณ์': 'pra1-sop1-kan0',
    'ภาษา': 'pha0-sa4', 'ภาษาไทย': 'pha0-sa4-thai0',
    'มหาวิทยาลัย': 'ma3-ha4-wit3-tha3-ya0-lai0',
    'วิทยาลัย': 'wit3-tha3-ya0-lai0', 'วิทยาศาสตร์': 'wit3-tha3-ya0-sat1',
    'โรงเรียน': 'rong0-rian0', 'นักเรียน': 'nak3-rian0', 'นักศึกษา': 'nak3-suek1-sa4',
    'โรงพยาบาล': 'rong0-pha3-ya0-ban0', 'พยาบาล': 'pha3-ya0-ban0',
    'อาหาร': 'a0-han4', 'อาหารไทย': 'a0-han4-thai0', 'ร้านอาหาร': 'ran3-a0-han4',
    'ขนม': 'kha1-nom4', 'สนุก': 'sa1-nuk1', 'สบาย': 'sa1-bai0',
    'สบายดี': 'sa1-bai0-di0', 'สถานี': 'sa1-tha4-ni0', 'สถานที่': 'sa1-than4-thi2',
    'สถาบัน': 'sa1-tha4-ban0', 'สถานการณ์': 'sa1-tha4-na3-kan0',
    'ตำรวจ': 'tam0-ruat1', 'รัฐบาล': 'rat3-tha1-ban0', 'รัฐ': 'rat3',
    'เศรษฐกิจ': 'set1-tha1-kit1', 'เศรษฐี': 'set1-thi4',
    'วัฒนธรรม': 'wat3-tha3-na3-tham0', 'ธรรมชาติ': 'tham0-ma3-chat2',
    'ธรรมดา': 'tham0-ma3-da0', 'ธุรกิจ': 'thu3-ra3-kit1',
    'ปัญหา': 'pan0-ha4', 'สำคัญ': 'sam4-khan0', 'สามารถ': 'sa4-mat2',
    'โทรศัพท์': 'tho0-ra3-sap1', 'คอมพิวเตอร์': 'khom0-phio0-toe2',
    'อินเทอร์เน็ต': 'in0-thoe0-net3', 'อีเมล': 'i0-men0',
    'กรุงเทพ': 'krung0-thep2', 'กรุงเทพฯ': 'krung0-thep2',
    'กรุงเทพมหานคร': 'krung0-thep2-ma3-ha4-na3-khon0',
    'เชียงใหม่': 'chiang0-mai1', 'ภูเก็ต': 'phu0-ket1', 'อยุธยา': 'a1-yut3-tha3-ya0',
    'หนังสือ': 'nang4-sue4', 'ผู้หญิง': 'phu2-ying4', 'ผู้ชาย': 'phu2-chai0',
    'เด็ก': 'dek1', 'ครอบครัว': 'khrop2-khrua0', 'เพื่อน': 'phuean2',
    'ตลาด': 'ta1-lat1', 'ตลอด': 'ta1-lot1', 'ถนน': 'tha1-non4',
    'มนุษย์': 'ma3-nut3', 'ศิลปะ': 'sin4-la3-pa1', 'ประโยชน์': 'pra1-yot1',
    'อุณหภูมิ': 'un0-ha1-phum0', 'เกษตร': 'ka1-set1', 'กษัตริย์': 'ka1-sat1',
    'สัปดาห์': 'sap1-da0', 'ปฏิบัติ': 'pa1-ti1-bat1', 'ปกติ': 'pok1-ka1-ti1',
    'มกราคม': 'ma3-ka1-ra0-khom0', 'กุมภาพันธ์': 'kum0-pha0-phan0',
    'มีนาคม': 'mi0-na0-khom0', 'เมษายน': 'me0-sa4-yon0',
    'มิถุนายน': 'mi3-thu1-na0-yon0', 'กรกฎาคม': 'ka1-ra3-ka1-da0-khom0',
    'สิงหาคม': 'sing4-ha4-khom0', 'กันยายน': 'kan0-ya0-yon0',
    'ตุลาคม': 'tu1-la0-khom0', 'พฤศจิกายน': 'phruet3-sa1-chi1-ka0-yon0',
    'ธันวาคม': 'than0-wa0-khom0',
    'สาธารณะ': 'sa4-tha0-ra3-na3', 'สาธารณสุข': 'sa4-tha0-ra3-na3-suk1',
    'มหานคร': 'ma3-ha4-na3-khon0', 'มหา': 'ma3-ha4', 'มหาสมุทร': 'ma3-ha4-sa1-mut1',
    'อาจารย์': 'a0-chan0', 'พาหนะ': 'pha0-ha1-na3', 'ยานพาหนะ': 'yan0-pha0-ha1-na3',
    'ชนะ': 'cha3-na3', 'คณะ': 'kha3-na3', 'สภาพ': 'sa1-phap2',
    'สภา': 'sa1-pha0', 'อนาคต': 'a1-na0-khot3', 'ปัจจุบัน': 'pat1-chu1-ban0',
    'อดีต': 'a1-dit1', 'ทันที': 'than0-thi0', 'เทคโนโลยี': 'thek3-no0-lo0-yi0',
    'วัตถุ': 'wat3-thu1', 'สัตว์': 'sat1', 'ปรัชญา': 'prat1-ya0',
    'จิตใจ': 'chit1-chai0', 'ร่างกาย': 'rang2-kai0', 'สุขภาพ': 'suk1-kha1-phap2',
    'ประกาศ': 'pra1-kat1', 'ประโยค': 'pra1-yok1', 'ประสิทธิภาพ': 'pra1-sit1-thi3-phap2',

    /* คำที่พบบ่อย — ช่วยให้ตัวตัดพยางค์หาขอบเขตคำได้แม่นขึ้น */
    'อยาก': 'yak1', 'อยู่': 'yu1', 'อย่าง': 'yang1', 'อย่า': 'ya1',
    'ไปรษณีย์': 'prai0-sa1-ni0', 'ไป': 'pai0',
    'ที่': 'thi2', 'นี้': 'ni3', 'นั้น': 'nan3', 'นั่น': 'nan2', 'นี่': 'ni2',
    'แล้ว': 'laeo3', 'เมื่อ': 'muea2', 'ก่อน': 'kon1', 'หลัง': 'lang4',
    'ยัง': 'yang0', 'ต้อง': 'tong2', 'แห่ง': 'haeng1', 'หนึ่ง': 'nueng1',
    'จังหวัด': 'chang0-wat1', 'บ้าน': 'ban2', 'การ': 'kan0', 'ความ': 'khwam0',
    'ผม': 'phom4', 'ฉัน': 'chan4', 'เขา': 'khao4', 'เธอ': 'thoe0', 'เรา': 'rao0',
    'คุณ': 'khun0', 'มาก': 'mak2', 'ของ': 'khong4', 'กับ': 'kap1', 'จาก': 'chak1',
    'เป็น': 'pen0', 'ว่า': 'wa2', 'ไม่': 'mai2', 'ได้': 'dai2', 'ให้': 'hai2',
    'และ': 'lae3', 'หรือ': 'rue4', 'แต่': 'tae1', 'ถ้า': 'tha2', 'เพราะ': 'phro3',
    'ทำ': 'tham0', 'งาน': 'ngan0', 'คน': 'khon0', 'วัน': 'wan0', 'เดือน': 'duean0',
    'น้ำ': 'nam3', 'ข้าว': 'khao2', 'กิน': 'kin0', 'เวลา': 'we0-la0',
    'ห้อง': 'hong2', 'ห้องน้ำ': 'hong2-nam3', 'ร้าน': 'ran3', 'เงิน': 'ngoen0',
    'รัก': 'rak3', 'ชอบ': 'chop2', 'เก่ง': 'keng1', 'สอง': 'song4', 'สาม': 'sam4',

    /* คำนำหน้า "สุร-" (มาจากบาลี-สันสกฤต "สุระ" แปลว่ากล้าหาญ/เทวดา) อ่านว่า สุ-ระ
       ไม่ใช่ สุน — ตัวตัดพยางค์ทั่วไปจะเข้าใจผิดว่า ร เป็นตัวสะกดของ สุ */
    'สุร-': 'su1-ra3', 'สุระ': 'su1-ra3',
    'สุรวุฒิ': 'su1-ra3-wut3', 'สุรชัย': 'su1-ra3-chai0', 'สุรยุทธ์': 'su1-ra3-yut3',
    'สุรเดช': 'su1-ra3-det2', 'สุรพล': 'su1-ra3-phon0', 'สุรศักดิ์': 'su1-ra3-sak1',

    /* คำนำหน้าชื่อที่ลงท้ายด้วย ร เดี่ยว (ไม่มีรูปสระ) แล้วตามด้วยพยัญชนะอีกตัว
       เช่น วร-, อร-, พีร-, วีร- อ่านแยกเป็น 2 พยางค์ (...-ระ) เสมอ ไม่ใช่ปิดพยางค์ด้วย ร */
    'วร-': 'wo0-ra3', 'อร-': 'o0-ra3', 'พีร-': 'phi0-ra3', 'วีร-': 'wi0-ra3',
    'วรนุช': 'wo0-ra3-nut3', 'อรนุช': 'o0-ra3-nut3',
    'พีรพล': 'phi0-ra3-phon0', 'วีรพล': 'wi0-ra3-phon0',
    'อมรรัตน์': 'a1-mon0-rat3'
  };

  // คำยกเว้นที่ได้จากการไล่ตรวจคำที่พบบ่อยที่สุดในคลังข้อมูลภาษาไทยทีละคำ
  // (รูปแบบเดียวกับ DICT) — แก้ที่ scripts/data/exceptions.tsv แล้วรัน scripts/build-data.js
  // @@EXCEPTIONS-BEGIN
  var EXCEPTIONS = {
    'กตัญญู': 'ka1-tan0-yu0', 'กมลา': 'ka1-ma3-la0', 'กรกฎ': 'ko0-ra3-kot1', 'กรณี': 'ko0-ra3-ni0',
    'กรมธรรม์': 'krom0-ma3-than0', 'กรรมกร': 'kam0-ma3-kon0', 'กรรมการ': 'kam0-ma3-kan0', 'กรรมฐาน': 'kam0-ma3-than4',
    'กรรมพันธุ์': 'kam0-ma3-phan0', 'กรรมวิธี': 'kam0-ma3-wi3-thi0', 'กรรมวิบาก': 'kam0-ma3-wi3-bak1', 'กรรมสิทธิ์': 'kam0-ma3-sit1',
    'กระดี๊กระด๊า': 'kra1-di3-kra1-da3', 'กระปรี้กระเปร่า': 'kra1-pri2-kra1-prao1', 'กราฟ': 'krap3', 'กรุณา': 'ka1-ru3-na0',
    'กฤษฎีกา': 'krit1-sa1-di0-ka0', 'กฤษณา': 'krit1-sa1-na4', 'กลเม็ด': 'kon0-la3-met3', 'กลยุทธ์': 'kon0-la3-yut3',
    'กลวิธี': 'kon0-la3-wi3-thi0', 'กลศาสตร์': 'kon0-la3-sat1', 'กลับตาลปัตร': 'klap1-ta0-la3-pat1', 'กลาโหม': 'ka1-la0-hom4',
    'กวี': 'ka1-wi0', 'กอปร': 'kop1', 'กัมปนาท': 'kam0-pa1-nat2', 'กัมมันตรังสี': 'kam0-man0-ta1-rang0-si4',
    'กัลยา': 'kan0-la3-ya0', 'กัลยาณมิตร': 'kan0-la3-ya0-na3-mit3', 'กากบาท': 'ka0-ka1-bat1', 'กาญจน-': 'kan0-cha1-na3',
    'กาญจน์': 'kan0', 'กาญจนบุรี': 'kan0-cha1-na3-bu1-ri0', 'กามโรค': 'kam0-ma3-rok2', 'กายกรรม': 'kai0-ya3-kam0',
    'กายภาพ': 'kai0-ya3-phap2', 'กายสิทธิ์': 'kai0-ya3-sit1', 'การ์ด': 'kat3', 'การบูร': 'ka0-ra3-bun0',
    'กาลกิณี': 'ka0-la3-ki1-ni0', 'กาลเทศะ': 'ka0-la3-the0-sa1', 'กาลสมัย': 'ka0-la3-sa1-mai4', 'กาฬสินธุ์': 'ka0-la3-sin4',
    'กำเนิด': 'kam0-noet1', 'กำแหง': 'kam0-haeng4', 'กิจกรรม': 'kit1-cha1-kam0', 'กิจการ': 'kit1-cha1-kan0',
    'กิจวัตร': 'kit1-cha1-wat3', 'กิตติมศักดิ์': 'kit1-ti1-ma3-sak1', 'กิเลส': 'ki1-let1', 'กิโลเมตร': 'ki1-lo0-met3',
    'กีรติ': 'ki0-ra3-ti1', 'กุลบุตร': 'kun0-la3-but1', 'กุลสตรี': 'kun0-la3-sa1-tri0', 'กุศลกรรม': 'ku1-son4-la3-kam0',
    'กุศโลบาย': 'ku1-sa1-lo0-bai0', 'เกษตรกร': 'ka1-set1-ta1-kon0', 'เกษตรกรรม': 'ka1-set1-ta1-kam0', 'เกียรติ': 'kiat1',
    'เกียรติยศ': 'kiat1-ti1-yot3', 'เกียรติศักดิ์': 'kiat1-ti1-sak1', 'โกฏิ': 'kot1', 'ขนอน': 'kha1-non4',
    'ขนัด': 'kha1-nat1', 'ข่มเหง': 'khom1-heng4', 'ขมา': 'kha1-ma0', 'ขมีขมัน': 'kha1-mi4-kha1-man4',
    'ขโมย': 'kha1-moi0', 'ขยาย': 'kha1-yai4', 'ขรม': 'kha1-rom4', 'ขรุขระ': 'khru1-khra1',
    'ขัดสมาธิ': 'khat1-sa1-mat1', 'ข้าพเจ้า': 'kha2-pha3-chao2', 'ขีปนาวุธ': 'khi4-pa1-na0-wut3', 'เขย่า': 'kha1-yao1',
    'โขยง': 'kha1-yong4', 'คณบดี': 'kha3-na3-bo0-di0', 'คณิต': 'kha3-nit3', 'คณิตศาสตร์': 'kha3-nit3-ta1-sat1',
    'คมนาคม': 'kha3-ma3-na0-khom0', 'ครหา': 'kho0-ra3-ha4', 'ครุภัณฑ์': 'kha3-ru3-phan0', 'ครุศาสตร์': 'kha3-ru3-sat1',
    'คฤหบดี': 'kha3-rue3-ha1-bo0-di0', 'คลินิก': 'khli3-nik1', 'คหบดี': 'kha3-ha1-bo0-di0', 'คอมพิวเตอร์': 'khom0-phio0-toe2',
    'คึกฤทธิ์': 'khuek3-rit3', 'คุณธรรม': 'khun0-na3-tham0', 'คุณภาพ': 'khun0-na3-phap2', 'คุณลักษณะ': 'khun0-na3-lak3-sa1-na1',
    'คุณวุฒิ': 'khun0-na3-wut3', 'คุณศัพท์': 'khun0-na3-sap1', 'คุณสมบัติ': 'khun0-na3-som4-bat1', 'คุณูปการ': 'khu3-nu0-pa1-kan0',
    'เคหสถาน': 'khe0-ha1-sa1-than4', 'เคาน์เตอร์': 'khao0-toe2', 'ฆาตกร': 'khat2-ta1-kon0', 'ฆาตกรรม': 'khat2-ta1-kam0',
    'โฆษณา': 'kho0-sa1-na0', 'งูสวัด': 'ngu0-sa1-wat1', 'จรวด': 'cha1-ruat1', 'จระเข้': 'cho0-ra3-khe2',
    'จริยธรรม': 'cha1-ri3-ya3-tham0', 'จริยวัตร': 'cha1-ri3-ya3-wat3', 'จริยศาสตร์': 'cha1-ri3-ya3-sat1', 'จักจั่น': 'chak1-ka1-chan1',
    'จั๊กจี้': 'chak3-ka1-chi2', 'จักรพรรดิ': 'chak1-kra1-phat3', 'จักรภพ': 'chak1-kra1-phop3', 'จักรยาน': 'chak1-kra1-yan0',
    'จักรราศี': 'chak1-kra1-ra0-si4', 'จักรวรรดิ': 'chak1-kra1-wat1', 'จักรวาล': 'chak1-kra1-wan0', 'จักรี': 'chak1-kri0',
    'จัตวา': 'chat1-ta1-wa0', 'จัตุรัส': 'chat1-tu1-rat1', 'จันทน์': 'chan0', 'จันทรคติ': 'chan0-thra3-kha3-ti1',
    'จันทรุปราคา': 'chan0-thrup3-pa1-ra0-kha0', 'จารกรรม': 'cha0-ra3-kam0', 'จำรัส': 'cham0-rat1', 'จิตนิยม': 'chit1-ta1-ni3-yom0',
    'จิตบำบัด': 'chit1-ta1-bam0-bat1', 'จิตแพทย์': 'chit1-ta1-phaet2', 'จิตรกร': 'chit1-tra1-kon0', 'จิตรกรรม': 'chit1-tra1-kam0',
    'จิตรลดา': 'chit1-tra1-la3-da0', 'จิตรา': 'chit1-tra0', 'จิตวิทยา': 'chit1-ta1-wit3-tha3-ya0', 'จิตวิสัย': 'chit1-ta1-wi3-sai4',
    'จิตเวช': 'chit1-ta1-wet2', 'จุลจอมเกล้า': 'chun0-la3-chom0-klao2', 'จุลทรรศน์': 'chun0-la3-that3', 'จุลภาค': 'chun0-la3-phak2',
    'จุลศักราช': 'chun0-la3-sak1-ka1-rat1', 'เจตนา': 'chet1-ta1-na0', 'เจตนารมณ์': 'chet1-ta1-na0-rom0', 'เจรจา': 'che0-ra3-cha0',
    'เจษฎา': 'chet1-sa1-da0', 'โจรกรรม': 'cho0-ra3-kam0', 'ฉนวน': 'cha1-nuan4', 'ฉมวก': 'cha1-muak1',
    'ฉันทาคติ': 'chan4-tha0-kha3-ti1', 'ชนนี': 'chon0-na3-ni0', 'ชนบท': 'chon0-na3-bot1', 'ชนวน': 'cha3-nuan0',
    'ชลประทาน': 'chon0-la3-pra1-than0', 'ชันสูตร': 'chan0-na3-sut1', 'ชัยภูมิ': 'chai0-ya3-phum0', 'ชาติพันธุ์': 'chat2-ti1-phan0',
    'ชินวัตร': 'chin0-na3-wat3', 'ชีพจร': 'chip2-pha3-chon0', 'ชุลมุน': 'chun0-la3-mun0', 'เชาวน์': 'chao0',
    'โชติ': 'chot2', 'เซ็นเตอร์': 'sen0-toe2', 'เซอร์': 'soe2', 'ฌาปนกิจ': 'cha0-pa1-na3-kit1',
    'ดรรชนี': 'dat1-cha3-ni0', 'ดรุณี': 'da1-ru3-ni0', 'ดัชนี': 'dat1-cha3-ni0', 'ดำริ': 'dam0-ri1',
    'ดุริยางคศิลป์': 'du1-ri3-yang0-kha3-sin4', 'ดุษฎี': 'dut1-sa1-di0', 'ดุษฎีบัณฑิต': 'dut1-sa1-di0-ban0-dit1', 'เดวิด': 'de0-wit3',
    'ตกลง': 'tok1-long0', 'ตรรก': 'tak1-ka1', 'ตรรกะ': 'tak1-ka1', 'ตรัสรู้': 'trat1-sa1-ru3',
    'ตริตรอง': 'tri1-trong0', 'ตั๊กแตน': 'tak3-ka1-taen0', 'ตุ๊กตา': 'tuk3-ka1-ta0', 'ตุรกี': 'tu1-ra3-ki0',
    'เต็นท์': 'ten3', 'ถลอก': 'tha1-lok1', 'เถรวาท': 'the4-ra3-wat2', 'เถระ': 'the4-ra3',
    'เถลไถล': 'tha1-le4-tha1-lai4', 'ทรยศ': 'tho0-ra3-yot3', 'ทรรศนะ': 'that3-sa1-na3', 'ทรราช': 'tho0-ra3-rat2',
    'ทรหด': 'tho0-ra3-hot1', 'ทรัพยากร': 'sap3-pha3-ya0-kon0', 'ทฤษฎี': 'thrit3-sa1-di0', 'ทว่า': 'tha3-wa2',
    'ทศนิยม': 'thot3-sa1-ni3-yom0', 'ทศพิธราชธรรม': 'thot3-sa1-phit3-rat2-cha3-tham0', 'ทศวรรษ': 'thot3-sa1-wat3', 'ทัณฑสถาน': 'than0-tha3-sa1-than4',
    'ทันตแพทย์': 'than0-ta1-phaet2', 'ทัศน-': 'that3-sa1-na3', 'ทัศนคติ': 'that3-sa1-na3-kha3-ti1', 'ทัศนะ': 'that3-sa1-na3',
    'ทัศนา': 'that3-sa1-na0', 'ทัศนาจร': 'that3-sa1-na0-chon0', 'ทัศนียภาพ': 'that3-sa1-ni0-ya3-phap2', 'ทินกร': 'thin0-na3-kon0',
    'ทุจริต': 'thut3-cha1-rit1', 'ทุพพลภาพ': 'thup3-phon0-la3-phap2', 'ทุรกันดาร': 'thu3-ra3-kan0-dan0', 'เทค': 'thek3',
    'เทคนิค': 'thek3-nik1', 'เทป': 'thep3', 'เทพเจ้า': 'thep2-pha3-chao2', 'เทพยดา': 'thep2-pha3-ya3-da0',
    'เทรด': 'thret1', 'เทรนด์': 'tren0', 'เทว-': 'the0-wa3', 'เทวดา': 'the0-wa3-da0',
    'เทศกาล': 'thet2-sa1-kan0', 'เทศนา': 'thet2-sa1-na4', 'เทศบาล': 'thet2-sa1-ban0', 'เทศมนตรี': 'thet2-sa1-mon0-tri0',
    'โทมนัส': 'thom0-ma3-nat3', 'โทร': 'tho0', 'โทร-': 'tho0-ra3', 'โทรทรรศน์': 'tho0-ra3-that3',
    'โทรทัศน์': 'tho0-ra3-that3', 'ธนบัตร': 'tha3-na3-bat1', 'ธรณี': 'tho0-ra3-ni0', 'ธรรมจักร': 'tham0-ma3-chak1',
    'ธรรมนูญ': 'tham0-ma3-nun0', 'ธรรมราช': 'tham0-ma3-rat2', 'ธรรมศาสตร์': 'tham0-ma3-sat1', 'ธรรมะ': 'tham0-ma3',
    'ธัญบุรี': 'than0-ya3-bu1-ri0', 'ธัญพืช': 'than0-ya3-phuet2', 'ธาตุ': 'that2', 'ธุร-': 'thu3-ra3',
    'ธุรกรรม': 'thu3-ra3-kam0', 'ธุรการ': 'thu3-ra3-kan0', 'นครินทร์': 'na3-kha3-rin0', 'นพคุณ': 'nop3-pha3-khun0',
    'นพรัตน์': 'nop3-pha3-rat3', 'นมัสการ': 'na3-mat3-sa1-kan0', 'นวัตกรรม': 'na3-wat3-ta1-kam0', 'นักขัตฤกษ์': 'nak3-khat1-ta1-roek2',
    'นันทนาการ': 'nan0-tha3-na0-kan0', 'นาคราช': 'nak2-kha3-rat2', 'นาฏกรรม': 'nat2-ta1-kam0', 'นาฏศิลป์': 'nat2-ta1-sin4',
    'นานัปการ': 'na0-nap3-pa1-kan0', 'นามธรรม': 'nam0-ma3-tham0', 'นายก': 'na0-yok3', 'นายกเทศมนตรี': 'na0-yok3-thet2-sa1-mon0-tri0',
    'นารถ': 'nat2', 'นาวิกโยธิน': 'na0-wik3-ka1-yo0-thin0', 'นิตยสาร': 'nit3-ta1-ya3-san4', 'นิทรรศการ': 'ni3-that3-sa1-kan0',
    'นิทรา': 'nit3-tra0', 'นิร-': 'ni3-ra3', 'เนรคุณ': 'ne0-ra3-khun0', 'เนรเทศ': 'ne0-ra3-thet2',
    'เนรมิต': 'ne0-ra3-mit3', 'บดินทร์': 'bo0-din0', 'บดี': 'bo0-di0', 'บพิตร': 'bo0-phit3',
    'บรม': 'bo0-rom0', 'บรมวงศ์': 'bo0-rom0-ma3-wong0', 'บรรพ-': 'ban0-pha3', 'บรรพชา': 'ban0-pha3-cha0',
    'บรรพชิต': 'ban0-pha3-chit3', 'บรรพบุรุษ': 'ban0-pha3-bu1-rut3', 'บวร': 'ba1-won0', 'บวรนิเวศ': 'bo0-won0-ni3-wet2',
    'บัญญัติ': 'ban0-yat1', 'บัณฑิต': 'ban0-dit1', 'บารมี': 'ba0-ra3-mi0', 'บุคลากร': 'buk1-kha3-la0-kon0',
    'บุคลิก': 'buk1-kha3-lik3', 'บุคลิกภาพ': 'buk1-kha3-lik3-ka1-phap2', 'บุตรี': 'but1-tri0', 'บุพการี': 'bup1-pha3-ka0-ri0',
    'บุพบท': 'bup1-pha3-bot1', 'บุษกร': 'but1-sa1-kon0', 'บุษบก': 'but1-sa1-bok1', 'บุษบา': 'but1-sa1-ba0',
    'บูรณะ': 'bu0-ra3-na3', 'บูรณาการ': 'bu0-ra3-na0-kan0', 'บูรพา': 'bu0-ra3-pha0', 'เบญจ-': 'ben0-cha1',
    'ปฏิปทา': 'pa1-ti1-pa1-tha0', 'ปฐพี': 'pa1-tha1-phi0', 'ปฐมนิเทศ': 'pa1-thom4-ma3-ni3-thet2', 'ปฐมภูมิ': 'pa1-thom4-ma3-phum0',
    'ปฐมฤกษ์': 'pa1-thom4-ma3-roek2', 'ปฐมวัย': 'pa1-thom4-ma3-wai0', 'ปฐวี': 'pa1-tha1-wi0', 'ปรกติ': 'prok1-ka1-ti1',
    'ปรนัย': 'po0-ra3-nai0', 'ปรมาจารย์': 'po0-ra3-ma0-chan0', 'ปรมาณู': 'po0-ra3-ma0-nu0', 'ปรมาภิไธย': 'po0-ra3-ma0-phi3-thai0',
    'ปรโลก': 'po0-ra3-lok2', 'ปรสิต': 'pa1-ra3-sit1', 'ปรอท': 'pa1-rot1', 'ประกาศนียบัตร': 'pra1-kat1-sa1-ni0-ya3-bat1',
    'ประชาธิปไตย': 'pra1-cha0-thip3-pa1-tai0', 'ประชามติ': 'pra1-cha0-ma3-ti1', 'ประดิษฐาน': 'pra1-dit1-sa1-than4', 'ประทุษร้าย': 'pra1-thut3-sa1-rai3',
    'ประพฤติ': 'pra1-phruet3', 'ประมาท': 'pra1-mat1', 'ประวัติการ': 'pra1-wat1-ti1-kan0', 'ประวัติศาสตร์': 'pra1-wat1-ti1-sat1',
    'ประสูติ': 'pra1-sut1', 'ปรัมปรา': 'pa1-ram0-pa1-ra0', 'ปรารถนา': 'prat1-tha1-na4', 'ปราศจาก': 'prat1-sa1-chak1',
    'ปริ-': 'pa1-ri3', 'ปริญญา': 'pa1-rin0-ya0', 'ปริปาก': 'pri1-pak1', 'ปริมณฑล': 'pa1-ri3-mon0-thon0',
    'ปริมาณ': 'pa1-ri3-man0', 'ปริยาย': 'pa1-ri3-yai0', 'ปริศนา': 'prit1-sa1-na4', 'ปลัด': 'pa1-lat1',
    'ปัจเจก': 'pat1-chek1', 'ปัจเจกบุคคล': 'pat1-chek1-ka1-buk1-khon0', 'ปาฐกถา': 'pa0-tha1-ka1-tha4', 'ปาณาติบาต': 'pa0-na0-ti1-bat1',
    'ปีเตอร์': 'pi0-toe2', 'ปูชนียบุคคล': 'pu0-cha3-ni0-ya3-buk1-khon0', 'เปรียญ': 'pa1-rian0', 'โปสเตอร์': 'pot1-toe2',
    'ผรุสวาท': 'pha1-ru3-sa1-wat2', 'ผลิตผล': 'pha1-lit1-ta1-phon4', 'ผลึก': 'pha1-luek1', 'ผอบ': 'pha1-op1',
    'ผักตบชวา': 'phak1-top1-cha3-wa0', 'ผู้สมัคร': 'phu2-sa1-mak1', 'พงศาวดาร': 'phong0-sa4-wa3-dan0', 'พจนานุกรม': 'phot3-cha1-na0-nu3-krom0',
    'พจนีย์': 'phot3-cha1-ni0', 'พจมาน': 'phot3-cha1-man0', 'พยาธิ': 'pha3-yat2', 'พรรณนา': 'phan0-na3-na0',
    'พรสวรรค์': 'phon0-sa1-wan4', 'พรหม': 'phrom0', 'พรหมลิขิต': 'phrom0-ma3-li3-khit1', 'พราหมณ์': 'phram0',
    'พฤกษ-': 'phruek3-sa1', 'พฤกษา': 'phruek3-sa4', 'พฤติกรรม': 'phruet3-ti1-kam0', 'พฤติการณ์': 'phruet3-ti1-kan0',
    'พฤตินัย': 'phruet3-ti1-nai0', 'พลเมือง': 'phon0-la3-mueang0', 'พลเรือน': 'phon0-la3-ruean0', 'พลวัต': 'phon0-la3-wat3',
    'พลศึกษา': 'pha3-la3-suek1-sa4', 'พลัง': 'pha3-lang0', 'พลานามัย': 'pha3-la0-na0-mai0', 'พสกนิกร': 'pha3-sok1-ni3-kon0',
    'พัฒนา': 'phat3-tha3-na0', 'พัทลุง': 'phat3-tha3-lung0', 'พัลวัน': 'phan0-la3-wan0', 'พัศดี': 'phat3-sa1-di0',
    'พัสดุ': 'phat3-sa1-du1', 'พาณิชยกรรม': 'pha0-nit3-cha3-ya3-kam0', 'พิจารณา': 'phi3-cha0-ra3-na0', 'พิทยา': 'phit3-tha3-ya0',
    'พิพิธภัณฑ์': 'phi3-phit3-tha3-phan0', 'พิพิธภัณฑสถาน': 'phi3-phit3-tha3-phan0-tha3-sa1-than4', 'พิศดาร': 'phit3-sa1-dan0', 'พิศวง': 'phit3-sa1-wong0',
    'พิศวาส': 'phit3-sa1-wat2', 'พิษณุโลก': 'phit3-sa1-nu3-lok2', 'พิสดาร': 'phit3-sa1-dan0', 'พิสมัย': 'phit3-sa1-mai4',
    'พุทธ': 'phut3', 'พุทธ-': 'phut3-tha3', 'พุทธศักราช': 'phut3-tha3-sak1-ka1-rat1', 'พุทรา': 'phut3-sa0',
    'เพชฌฆาต': 'phet3-cha3-khat2', 'เพชร': 'phet3', 'เพชรบุรี': 'phet3-cha3-bu1-ri0', 'เพชรบูรณ์': 'phet3-cha3-bun0',
    'แพทยศาสตร์': 'phaet2-tha3-ya3-sat1', 'แพศยา': 'phaet2-sa1-ya4', 'เฟอร์นิเจอร์': 'foe0-ni3-choe2', 'ภยันตราย': 'pha3-yan0-ta1-rai0',
    'ภาชนะ': 'pha0-cha3-na3', 'ภาพยนตร์': 'phap2-pha3-yon0', 'ภารกิจ': 'pha0-ra3-kit1', 'ภาวนา': 'pha0-wa3-na0',
    'ภูติ': 'phut2', 'ภูมิ': 'phum0', 'ภูมิใจ': 'phum0-chai0', 'ภูมิประเทศ': 'phu0-mi3-pra1-thet2',
    'ภูมิปัญญา': 'phu0-mi3-pan0-ya0', 'ภูมิภาค': 'phu0-mi3-phak2', 'ภูมิศาสตร์': 'phu0-mi3-sat1', 'ภูมิอากาศ': 'phu0-mi3-a0-kat1',
    'เภตรา': 'phe0-tra0', 'เภสัช-': 'phe0-sat1-cha3', 'โภคทรัพย์': 'phok2-kha3-sap3', 'โภชนา': 'pho0-cha3-na0',
    'โภชนาการ': 'pho0-cha3-na0-kan0', 'มนุษย-': 'ma3-nut3-sa1-ya3', 'มร-': 'mo0-ra3', 'มรดก': 'mo0-ra3-dok1',
    'มฤตยู': 'ma3-ruet3-ta1-yu0', 'มหรสพ': 'ma3-ho4-ra3-sop1', 'มหัศจรรย์': 'ma3-hat1-sa1-chan0', 'มหาดไทย': 'ma3-hat1-thai0',
    'มหาดเล็ก': 'ma3-hat1-lek3', 'มหาสารคาม': 'ma3-ha4-sa4-ra3-kham0', 'มอเตอร์': 'mo0-toe2', 'มอเตอร์ไซค์': 'mo0-toe2-sai0',
    'มะเขือพวง': 'ma3-khuea4-phuang0', 'มัณฑนศิลป์': 'man0-tha3-na3-sin4', 'มัธยฐาน': 'mat3-tha3-ya3-than4', 'มัธยม': 'mat3-tha3-yom0',
    'มันแกว': 'man0-kaeo0', 'มัสมั่น': 'mat3-sa1-man1', 'มัสยิด': 'mat3-sa1-yit3', 'มัสลิน': 'mat3-sa1-lin0',
    'มาฆบูชา': 'ma0-kha3-bu0-cha0', 'มาตรการ': 'mat2-tra1-kan0', 'มาตรฐาน': 'mat2-tra1-than4', 'มาตรา': 'mat2-tra0',
    'มานุษยวิทยา': 'ma0-nut3-sa1-ya3-wit3-tha3-ya0', 'มารยาท': 'ma0-ra3-yat2', 'มิตรภาพ': 'mit3-tra1-phap2', 'มิสเตอร์': 'mit3-toe2',
    'มุสลิม': 'mut3-sa1-lim0', 'เมขลา': 'mek2-kha1-la4', 'เมเจอร์': 'me0-choe2', 'เมตร': 'met3',
    'เมทริกซ์': 'me0-thrik3', 'เมรุ': 'men0', 'ยมทูต': 'yom0-ma3-thut2', 'ยมบาล': 'yom0-ma3-ban0',
    'ยมราช': 'yom0-ma3-rat2', 'ยาสลบ': 'ya0-sa1-lop1', 'ยีราฟ': 'yi0-rap3', 'ยุทธ': 'yut3',
    'ยุทธ-': 'yut3-tha3', 'ยุทโธปกรณ์': 'yut3-tho0-pa1-kon0', 'ยุพราช': 'yup3-pha3-rat2', 'เยอรมนี': 'yoe0-ra3-ma3-ni0',
    'เยอรมัน': 'yoe0-ra3-man0', 'รณรงค์': 'ron0-na3-rong0', 'ระเหย': 'ra3-hoei4', 'รัช-': 'rat3-cha3',
    'รัชกาล': 'rat3-cha3-kan0', 'รัฐธรรมนูญ': 'rat3-tha1-tham0-ma3-nun0', 'รัฐบุรุษ': 'rat3-tha1-bu1-rut3', 'รัฐประศาสนศาสตร์': 'rat3-tha1-pra1-sat1-sa1-na3-sat1',
    'รัฐประหาร': 'rat3-tha1-pra1-han4', 'รัฐมนตรี': 'rat3-tha1-mon0-tri0', 'รัฐวิสาหกิจ': 'rat3-tha1-wi3-sa4-ha1-kit1', 'รัฐศาสตร์': 'rat3-tha1-sat1',
    'รัฐสภา': 'rat3-tha1-sa1-pha0', 'รัตน-': 'rat3-ta1-na3', 'รัตนะ': 'rat3-ta1-na3', 'รัตนา': 'rat3-ta1-na0',
    'รัศมี': 'rat3-sa1-mi4', 'รัษฎากร': 'rat3-sa1-da0-kon0', 'ราช-': 'rat2-cha3', 'ราชบัณฑิตยสถาน': 'rat2-cha3-ban0-dit1-ta1-ya3-sa1-than4',
    'ราชสมบัติ': 'rat2-cha3-som4-bat1', 'ราชินูปถัมภ์': 'ra0-chi3-nu0-pa1-tham4', 'ราชูปถัมภ์': 'ra0-chu0-pa1-tham4', 'รามเกียรติ์': 'ram0-ma3-kian0',
    'ราษฎร': 'rat2-sa1-don0', 'รูปธรรม': 'rup2-pa1-tham0', 'รูปพรรณ': 'rup2-pa1-phan0', 'รูปร่าง': 'rup2-rang2',
    'เรียกร้อง': 'riak2-rong3', 'ฤา': 'rue0', 'ลัคนา': 'lak3-kha3-na0', 'ลิขสิทธิ์': 'lik3-kha1-sit1',
    'เลเซอร์': 'le0-soe2', 'โลกทัศน์': 'lok2-ka1-that3', 'วนอุทยาน': 'wa3-na3-ut1-tha3-yan0', 'วรรณกรรม': 'wan0-na3-kam0',
    'วรรณคดี': 'wan0-na3-kha3-di0', 'วรรณยุกต์': 'wan0-na3-yuk3', 'วรรณศิลป์': 'wan0-na3-sin4', 'วัชพืช': 'wat3-cha3-phuet2',
    'วัชระ': 'wat3-cha3-ra3', 'วัฏจักร': 'wat3-ta1-chak1', 'วัฏสงสาร': 'wat3-ta1-song4-san4', 'วัฒนะ': 'wat3-tha3-na3',
    'วัฒนา': 'wat3-tha3-na0', 'วัตรปฏิบัติ': 'wat3-tra1-pa1-ti1-bat1', 'วัยวุฒิ': 'wai0-ya3-wut3', 'วัสดุ': 'wat3-sa1-du1',
    'วาติกัน': 'wa0-ti1-kan0', 'วาทกรรม': 'wa0-tha3-kam0', 'วารสาร': 'wa0-ra3-san4', 'วาสนา': 'wat2-sa1-na4',
    'วิกฤตการณ์': 'wi3-krit1-ta1-kan0', 'วิกฤติ': 'wi3-krit1', 'วิกฤติการณ์': 'wi3-krit1-ti1-kan0', 'วิกลจริต': 'wi3-kon0-cha1-rit1',
    'วิจารณญาณ': 'wi3-cha0-ra3-na3-yan0', 'วิตถาร': 'wit3-ta1-than4', 'วิทยฐานะ': 'wit3-tha3-ya3-tha4-na3', 'วิทยา': 'wit3-tha3-ya0',
    'วิทยากร': 'wit3-tha3-ya0-kon0', 'วิทยุ': 'wit3-tha3-yu3', 'วินาศกรรม': 'wi3-nat2-sa1-kam0', 'วินาศภัย': 'wi3-nat2-sa1-phai0',
    'วิปโยค': 'wip3-pa1-yok2', 'วิปริต': 'wi3-pa1-rit1', 'วิปัสสนา': 'wi3-pat1-sa1-na0', 'วิพากษ์': 'wi3-phak2',
    'วิวัฒนาการ': 'wi3-wat3-tha3-na0-kan0', 'วิศว-': 'wit3-sa1-wa3', 'วิษณุ': 'wit3-sa1-nu3', 'วิสัชนา': 'wi3-sat1-cha3-na0',
    'วิสาขบูชา': 'wi3-sa4-kha1-bu0-cha0', 'วุฒิ': 'wut3-thi3', 'เวกเตอร์': 'wek2-toe2', 'เวชกรรม': 'wet2-cha3-kam0',
    'เวทนา': 'wet2-tha3-na0', 'แวดวง': 'waet2-wong0', 'ศตวรรษ': 'sa1-ta1-wat3', 'ศรีสัชนาลัย': 'si4-sat1-cha3-na0-lai0',
    'ศักยภาพ': 'sak1-ka1-ya3-phap2', 'ศักราช': 'sak1-ka1-rat1', 'ศัตรู': 'sat1-tru0', 'ศากยมุนี': 'sak1-ka1-ya3-mu3-ni0',
    'ศาสดา': 'sat1-sa1-da0', 'ศาสน-': 'sat1-sa1-na3', 'ศาสนา': 'sat1-sa1-na4', 'ศิริ': 'si1-ri1',
    'ศิลป-': 'sin4-la3-pa1', 'ศิลปากร': 'sin4-la3-pa0-kon0', 'ศิลปิน': 'sin4-la3-pin0', 'ศีรษะ': 'si4-sa1',
    'ศีลธรรม': 'sin4-la3-tham0', 'ศุลกากร': 'sun4-la3-ka0-kon0', 'เศรษฐ-': 'set1-tha1', 'โศกนาฏกรรม': 'sok1-ka1-nat2-ta1-kam0',
    'สกปรก': 'sok1-ka1-prok1', 'สกรีน': 'sa1-krin0', 'สตรี': 'sa1-tri0', 'สถานภาพ': 'sa1-tha4-na3-phap2',
    'สถาปนา': 'sa1-tha4-pa1-na0', 'สถาปนิก': 'sa1-tha4-pa1-nik3', 'สถาปัตยกรรม': 'sa1-tha4-pat1-ta1-ya3-kam0', 'สนทนา': 'son4-tha3-na0',
    'สนน': 'sa1-non4', 'สมการ': 'sa1-ma3-kan0', 'สมณะ': 'sa1-ma3-na3', 'สมถะ': 'sa1-ma3-tha1',
    'สมนาคุณ': 'som4-ma3-na0-khun0', 'สมบูรณาญาสิทธิราชย์': 'som4-bu0-ra3-na0-ya0-sit1-thi3-rat2', 'สมมติ': 'som4-mot3', 'สมมติฐาน': 'som4-mot3-ti1-than4',
    'สมมุติ': 'som4-mut3', 'สมมุติฐาน': 'som4-mut3-ti1-than4', 'สมรภูมิ': 'sa1-mo4-ra3-phum0', 'สมรรถนะ': 'sa1-mat1-tha1-na3',
    'สมรรถภาพ': 'sa1-mat1-tha1-phap2', 'สมัชชา': 'sa1-mat3-cha0', 'สมัญญา': 'sa1-man0-ya0', 'สมาคม': 'sa1-ma0-khom0',
    'สมาชิก': 'sa1-ma0-chik3', 'สมาชิกภาพ': 'sa1-ma0-chik3-ka1-phap2', 'สมาธิ': 'sa1-ma0-thi3', 'สมานฉันท์': 'sa1-man0-chan4',
    'สมาบัติ': 'sa1-ma0-bat1', 'สมาพันธรัฐ': 'sa1-ma0-phan0-tha3-rat3', 'สโมสร': 'sa1-mo0-son4', 'สรณะ': 'sa1-ra3-na3',
    'สรรพ-': 'sap1-pha3', 'สรรพสิ่ง': 'sap1-pha3-sing1', 'สระบุรี': 'sa1-ra1-bu1-ri0', 'สรีรวิทยา': 'sa1-ri0-ra3-wit3-tha3-ya0',
    'สรีระ': 'sa1-ri0-ra3', 'สฤษดิ์': 'sa1-rit1', 'สลักเสลา': 'sa1-lak1-sa1-lao4', 'สวรรคต': 'sa1-wan4-na3-khot3',
    'สวรรคโลก': 'sa1-wan4-kha3-lok2', 'สห-': 'sa1-ha1', 'สหรัฐ': 'sa1-ha1-rat3', 'สหัสวรรษ': 'sa1-hat1-sa1-wat3',
    'สักวา': 'sak1-ka1-wa0', 'สักหลาด': 'sak1-ka1-lat1', 'สังคายนา': 'sang4-kha0-ya3-na0', 'สัจธรรม': 'sat1-cha1-tham0',
    'สัจนิยม': 'sat1-cha1-ni3-yom0', 'สัญชาตญาณ': 'san4-chat2-ta1-yan0', 'สัญลักษณ์': 'san4-ya3-lak3', 'สัตยาบัน': 'sat1-ta1-ya0-ban0',
    'สัตวแพทย์': 'sat1-ta1-wa3-phaet2', 'สัตหีบ': 'sat1-ta1-hip1', 'สันสกฤต': 'san4-sa1-krit1', 'สัปดน': 'sap1-pa1-don0',
    'สัปหงก': 'sap1-pa1-ngok1', 'สัปเหร่อ': 'sap1-pa1-roe1', 'สัพยอก': 'sap1-pha3-yok2', 'สัมฤทธิ์': 'sam4-rit3',
    'สัสดี': 'sat1-sa1-di0', 'สาทร': 'sa4-thon0', 'สาธยาย': 'sat1-tha3-yai0', 'สาธารณ-': 'sa4-tha0-ra3-na3',
    'สาธารณรัฐ': 'sa4-tha0-ra3-na3-rat3', 'สาธารณูปการ': 'sa4-tha0-ra3-nu0-pa1-kan0', 'สาธารณูปโภค': 'sa4-tha0-ra3-nu0-pa1-phok2', 'สามเณร': 'sam4-ma3-nen0',
    'สายสิญจน์': 'sai4-sin4', 'สารคาม': 'sa4-ra3-kham0', 'สารถี': 'sa4-ra3-thi4', 'สารท': 'sat1',
    'สารทุกข์สุกดิบ': 'sa4-ra3-thuk3-suk1-dip1', 'สารนิเทศ': 'sa4-ra3-ni3-thet2', 'สารบบ': 'sa4-ra3-bop1', 'สารบรรณ': 'sa4-ra3-ban0',
    'สารบัญ': 'sa4-ra3-ban0', 'สารพัด': 'sa4-ra3-phat3', 'สารพัน': 'sa4-ra3-phan0', 'สารภาพ': 'sa4-ra3-phap2',
    'สารภี': 'sa4-ra3-phi0', 'สารวัตร': 'sa4-ra3-wat3', 'สารสนเทศ': 'sa4-ra3-son4-thet2', 'สารีริกธาตุ': 'sa4-ri0-rik3-ka1-that2',
    'สาวิตรี': 'sa4-wit3-tri0', 'สำรวจ': 'sam4-ruat1', 'สำเร็จ': 'sam4-ret1', 'สิงคโปร์': 'sing4-kha3-po0',
    'สิงสถิต': 'sing4-sa1-thit1', 'สิทธิมนุษยชน': 'sit1-thi3-ma3-nut3-sa1-ya3-chon0', 'สิริ': 'si1-ri1', 'สุขภัณฑ์': 'suk1-kha1-phan0',
    'สุขลักษณะ': 'suk1-kha1-lak3-sa1-na1', 'สุขศึกษา': 'suk1-kha1-suek1-sa4', 'สุคติ': 'su1-kha3-ti1', 'สุจริต': 'sut1-cha1-rit1',
    'สุนทรพจน์': 'sun4-tho0-ra3-phot3', 'สุนทรี': 'sun4-tha3-ri0', 'สุนทรียภาพ': 'sun4-tha3-ri0-ya3-phap2', 'สุนทรียะ': 'sun4-tha3-ri0-ya3',
    'สุรัสวดี': 'su1-rat3-sa1-wa3-di0', 'สุริยคติ': 'su1-ri3-ya3-kha3-ti1', 'สุริยุปราคา': 'su1-ri3-yup3-pa1-ra0-kha0', 'สุลต่าน': 'sun4-la3-tan1',
    'สุวรรณภูมิ': 'su1-wan0-na3-phum0', 'เสถียรภาพ': 'sa1-thian4-ra3-phap2', 'เสลด': 'sa1-let1', 'เสลา': 'sa1-lao4',
    'เสวนา': 'se4-wa3-na0', 'เสียสละ': 'sia4-sa1-la1', 'แสม': 'sa1-mae4', 'โสน': 'sa1-no4',
    'โสมนัส': 'som4-ma3-nat3', 'โสร่ง': 'sa1-rong1', 'ไสยศาสตร์': 'sai4-ya3-sat1', 'หฤทัย': 'ha1-rue3-thai0',
    'หลอกลวง': 'lok1-luang0', 'หวงแหน': 'huang4-haen4', 'หิมพานต์': 'him4-ma3-phan0', 'แหน': 'haen4',
    'แหม': 'mae4', 'โหน': 'hon4', 'โหม': 'hom4', 'โหมโรง': 'hom4-rong0',
    'โหร': 'hon4', 'โหระพา': 'ho4-ra3-pha0', 'โหล': 'lo4', 'อกตัญญู': 'a1-ka1-tan0-yu0',
    'อกุศลกรรม': 'a1-ku1-son4-la3-kam0', 'อคติ': 'a1-kha3-ti1', 'องครักษ์': 'ong0-kha3-rak3', 'องุ่น': 'a1-ngun1',
    'อดีตกาล': 'a1-dit1-ta1-kan0', 'อดีตชาติ': 'a1-dit1-ta1-chat2', 'อธิปไตย': 'a1-thip3-pa1-tai0', 'อนาถ': 'a1-nat1',
    'อนาทร': 'a1-na0-thon0', 'อนาธิปไตย': 'a1-na0-thip3-pa1-tai0', 'อนารยชน': 'a1-na0-ra3-ya3-chon0', 'อนิจกรรม': 'a1-nit3-cha1-kam0',
    'อนึ่ง': 'a1-nueng1', 'อนุโมทนา': 'a1-nu3-mo0-tha3-na0', 'อนุรักษนิยม': 'a1-nu3-rak3-sa1-ni3-yom0', 'อนุสาวรีย์': 'a1-nu3-sa4-wa3-ri0',
    'อเนก': 'a1-nek1', 'อเนกประสงค์': 'a1-nek1-pra1-song4', 'อบรม': 'op1-rom0', 'อบายภูมิ': 'a1-bai0-ya3-phum0',
    'อบายมุข': 'a1-bai0-ya3-muk3', 'อพยพ': 'op1-pha3-yop3', 'อภัยโทษ': 'a1-phai0-ya3-thot2', 'อมตะ': 'a1-ma3-ta1',
    'อมนุษย์': 'a1-ma3-nut3', 'อมรินทร์': 'a1-ma3-rin0', 'อมฤต': 'a1-ma3-rit3', 'อยุติธรรม': 'a1-yut3-ti1-tham0',
    'อรรถ': 'at1', 'อรรถ-': 'at1-tha1', 'อรรถกถา': 'at1-tha1-ka1-tha4', 'อร่อย': 'a1-roi1',
    'อรัญประเทศ': 'a1-ran0-ya3-pra1-thet2', 'อร่าม': 'a1-ram1', 'อลวน': 'on0-la3-won0', 'อลเวง': 'on0-la3-weng0',
    'อลหม่าน': 'on0-la3-man1', 'อวัยวะ': 'a1-wai0-ya3-wa3', 'อสัญกรรม': 'a1-san4-ya3-kam0', 'อหิวาตกโรค': 'a1-hi1-wa0-ta1-ka1-rok2',
    'อะลุ้มอล่วย': 'a1-lum3-a1-luai1', 'อักขรวิธี': 'ak1-kha1-ra1-wi3-thi0', 'อักขระ': 'ak1-kha1-ra1', 'อัคนี': 'ak1-kha3-ni0',
    'อัครมเหสี': 'ak1-kha3-ra3-ma3-he4-si4', 'อัครราชทูต': 'ak1-kha3-ra3-rat2-cha3-thut2', 'อัจฉรา': 'at1-cha1-ra0', 'อัจฉริยภาพ': 'at1-cha1-ri3-ya3-phap2',
    'อัจฉริยะ': 'at1-cha1-ri3-ya3', 'อัญมณี': 'an0-ya3-ma3-ni0', 'อัฐิ': 'at1-thi1', 'อัฒจันทร์': 'at1-tha1-chan0',
    'อัต-': 'at1-ta1', 'อัตโนมัติ': 'at1-ta1-no0-mat3', 'อัตรา': 'at1-tra0', 'อัธยาศัย': 'at1-tha3-ya0-sai4',
    'อันตรธาน': 'an0-ta1-ra3-than0', 'อันตราย': 'an0-ta1-rai0', 'อัป-': 'ap1-pa1', 'อัปรีย์': 'ap1-pri0',
    'อัปลักษณ์': 'ap1-pa1-lak3', 'อัปสร': 'ap1-son4', 'อัฟกานิสถาน': 'af1-ka0-ni3-sa1-than4', 'อัมพฤกษ์': 'am0-ma3-phruek3',
    'อัมพาต': 'am0-ma3-phat2', 'อัยการ': 'ai0-ya3-kan0', 'อัลบั้ม': 'an0-la3-bam2', 'อัศจรรย์': 'at1-sa1-chan0',
    'อัศวิน': 'at1-sa1-win0', 'อัสดง': 'at1-sa1-dong0', 'อัสนี': 'at1-sa1-ni0', 'อากาศยาน': 'a0-kat1-sa1-yan0',
    'อาคเนย์': 'a0-kha3-ne0', 'อาตมภาพ': 'at1-ta1-ma3-phap2', 'อาตมา': 'at1-ta1-ma0', 'อาถรรพณ์': 'a0-than4',
    'อาทร': 'a0-thon0', 'อายุรเวช': 'a0-yu3-ra3-wet2', 'อายุรเวท': 'a0-yu3-ra3-wet2', 'อายุรศาสตร์': 'a0-yu3-ra3-sat1',
    'อารย-': 'a0-ra3-ya3', 'อารยธรรม': 'a0-ra3-ya3-tham0', 'อารยัน': 'a0-ra3-yan0', 'อาราธนา': 'a0-rat2-tha3-na0',
    'อาศรม': 'a0-som4', 'อาสนะ': 'a0-sa1-na3', 'อาสาฬหบูชา': 'a0-san4-ha1-bu0-cha0', 'อำมาตย์': 'am0-mat1',
    'อินทผลัม': 'in0-tha3-pha1-lam0', 'อินเทอร์เน็ต': 'in0-thoe0-net3', 'อิเล็กทรอนิกส์': 'i1-lek3-thro0-nik1', 'อิสรภาพ': 'it1-sa1-ra1-phap2',
    'อิสระ': 'it1-sa1-ra1', 'อิสราเอล': 'it1-sa1-ra0-en0', 'อิสริยยศ': 'it1-sa1-ri3-ya3-yot3', 'อิสลาม': 'it1-sa1-lam4',
    'อียิปต์': 'i0-yip1', 'อึกทึก': 'uek1-ka1-thuek3', 'อุดมคติ': 'u1-dom0-kha3-ti1', 'อุตรดิตถ์': 'ut1-ta1-ra3-dit1',
    'อุตริ': 'ut1-ta1-ri1', 'อุตลุด': 'ut1-ta1-lut1', 'อุทกภัย': 'u1-thok3-ka1-phai0', 'อุทยาน': 'u1-tha3-yan0',
    'อุบัติภัย': 'u1-bat1-ti1-phai0', 'อุบัติเหตุ': 'u1-bat1-ti1-het1', 'อุป-': 'u1-pa1', 'อุปกรณ์': 'u1-pa1-kon0',
    'อุปการะ': 'u1-pa1-ka0-ra3', 'อุปถัมภ์': 'u1-pa1-tham4', 'อุปทาน': 'u1-pa1-than0', 'อุปนิสัย': 'u1-pa1-ni3-sai4',
    'อุปโภค': 'u1-pa1-phok2', 'อุปราช': 'u1-pa1-rat2', 'อุปโลกน์': 'u1-pa1-lok1', 'อุปสรรค': 'u1-pa1-sak1',
    'เอก-': 'ek1-ka1', 'เอกชน': 'ek1-ka1-chon0', 'เอกภาพ': 'ek1-ka1-phap2', 'เอกราช': 'ek1-ka1-rat2',
    'เอกลักษณ์': 'ek1-ka1-lak3', 'เอกสาร': 'ek1-ka1-san4', 'เอกอัครราชทูต': 'ek1-ak1-khra3-rat2-cha3-thut2', 'เอร็ด': 'a1-ret1',
    'เอิกเกริก': 'oek1-ka1-roek1', 'แอฟริกา': 'ae0-fri3-ka0', 'ไอยรา': 'ai0-ya3-ra0', 'ไอศกรีม': 'ai0-sa1-krim0',
    'เฮลิคอปเตอร์': 'he0-li3-khop2-toe2', 'ไฮโดรเจน': 'hai0-dro0-chen0'
  };
  // @@EXCEPTIONS-END

  /* ------------------------------------------------------------------ *
   * 4b. Word list — only tells the syllable search where words begin and
   *     end; the reading itself still comes from the rules above.
   * ------------------------------------------------------------------ */

  // คำที่พบบ่อยที่สุด 6,000 คำจากคลังข้อมูลภาษาไทยแห่งชาติ (TNC) เรียงตามความถี่
  // แก้ที่ scripts/data/words.txt แล้วรัน scripts/build-data.js — อย่าแก้ตรงนี้ด้วยมือ
  // @@WORDS-BEGIN
  var WORDS = [
    'ที่|การ|เป็น|ใน|ของ|มี|จะ|และ|ไม่|ได้|ให้|ว่า|ไป|มา|ก็|ความ|คน|กับ|แล้ว|อยู่',
    'หรือ|จาก|กัน|นี้|แต่|อย่าง|ต้อง|ด้วย|ขึ้น|เขา|นั้น|ผู้|ซึ่ง|ตาม|มาก|โดย|ใช้|ทาง|เรื่อง|เรา',
    'ยัง|ทำ|เพื่อ|ผม|อีก|หนึ่ง|เมื่อ|ถึง|เข้า|เพราะ|ดี|ออก|ฉัน|เกิด|คือ|เห็น|จึง|ทำให้|กว่า|ไทย',
    'ไว้|ตัว|ปี|เธอ|คุณ|ต่อ|ทั้ง|มัน|เลย|ถ้า|อะไร|เวลา|ลง|ต่าง|ส่วน|ประเทศ|อาจ|แบบ|ถูก|ทุก',
    'วัน|ก่อน|เช่น|อื่น|ดู|ครั้ง|รู้|เอา|สอง|นำ|งาน|สามารถ|นาย|นะ|หน้า|บอก|กลับ|แห่ง|บาง|ได้รับ',
    'จน|ด้าน|คิด|เด็ก|ชีวิต|สิ่ง|พระ|เหมือน|รับ|หลาย|พูด|บ้าน|ใหม่|เคย|นี่|กลุ่ม|ปัญหา|สังคม|ใคร|หา',
    'คำ|อยาก|ใด|เสียง|คง|มอง|ระหว่าง|สำหรับ|น้ำ|ผล|ใช่|แสดง|กำลัง|สร้าง|ท่าน|เงิน|โลก|ช่วย|กำหนด|จริง',
    'ขอ|ทำงาน|ระบบ|ใหญ่|ลูก|เอง|อัน|พอ|ที่สุด|แม่|พบ|บน|เสีย|แก่|ควร|เมือง|น้อย|เดิน|สี|น่า',
    'พี่|ร่วม|พัฒนา|ใจ|หาก|มาตรา|สูง|กิน|ส่ง|เดียว|แรก|กรณี|ระดับ|ตัวเอง|กฎหมาย|กล่าว|อาหาร|เกี่ยวกับ|ดังกล่าว|นัก',
    'จัด|ช่วง|ฝ่าย|เพียง|ลักษณะ|หลัง|จำนวน|ข้อ|พวก|ตน|รวม|เริ่ม|สาว|เพื่อน|บุคคล|ถาม|ครับ|บ้าง|พิจารณา|อำนาจ',
    'รัก|วันที่|ภาพ|ตา|ค่า|ผ่าน|ห้อง|หนังสือ|ข้อมูล|ยิ่ง|ดัง|เพิ่ม|ทรง|ตั้งแต่|พ่อ|ต่อไป|สำคัญ|เปิด|เศรษฐกิจ|ไหน',
    'กระทำ|ตั้ง|เข้าใจ|ชอบ|ภาษา|ตรง|เรียน|ตอน|รัฐ|การศึกษา|ก็ได้|รู้สึก|ขนาด|เท่านั้น|นั่ง|ชื่อ|เดือน|ชาติ|ผิด|รัฐบาล',
    'หลัก|นาน|รถ|จีน|ฟัง|เล็ก|ภายใน|แต่ละ|ละ|ต้องการ|ตาย|มือ|หญิง|เรียก|รูป|บาท|ประชาชน|ยา|มนุษย์|สาม',
    'ลด|ผลิต|เล่น|ซื้อ|หมด|การเมือง|ขาย|เสนอ|ปฏิบัติ|ชาว|พร้อม|มัก|รักษา|เลือก|อ่าน|อย่างไร|เขียน|ก็คือ|ล่ะ|ระยะ',
    'ค่ะ|ตลอด|สู่|ความคิด|หรือไม่|หน้าที่|ราคา|ประชุม|ผู้หญิง|ติด|ใส่|ศึกษา|เก็บ|ชั้น|เดียวกัน|สิทธิ|ประโยชน์|คณะกรรมการ|แค่|เปลี่ยน',
    'ปัจจุบัน|เจ้า|พื้นที่|คะ|วิธี|ตำแหน่ง|ทำไม|ประจำ|พยายาม|เนื่องจาก|โอกาส|แม้|สมัย|อย่า|สัมพันธ์|ประเภท|เหตุ|ตอบ|วัฒนธรรม|ตนเอง',
    'นั่น|สัก|สินค้า|เดิม|จำเป็น|เปลี่ยนแปลง|ถือ|เล่า|ประกอบ|ชนิด|กระทรวง|ปรากฏ|แล้วก็|ชาย|ดำเนินการ|รอบ|บริษัท|จังหวัด|ใบ|นอน',
    'ทั้งหมด|เกิน|สุข|รู้จัก|ครู|โดยเฉพาะ|ดังนั้น|ร้าน|บริการ|ทราบ|ประมาณ|จุด|ง่าย|โครงการ|ตัวอย่าง|ข้าง|ภาค|เรียกว่า|คืน|หรอก',
    'โรค|อาการ|อายุ|เหล่านี้|พา|แก|แตกต่าง|วิธีการ|น้อง|หมอ|ความรู้สึก|แทน|ที่อยู่|เชื่อ|ล้าน|ยาว|ราชการ|ครอบครัว|ไหม|เดินทาง',
    'นา|โรงเรียน|คณะ|สภา|สภาพ|ที|พรรค|วัด|ประกาศ|นาง|หัว|กลาง|แรง|คู่|ตลาด|กลายเป็น|จับ|วิจัย|แนว|ข้าว',
    'หัน|ไม่ว่า|เฉพาะ|ยก|อาศัย|ย่อม|ชุด|หนู|นโยบาย|น่ะ|เท่า|ความรู้|ยอม|ราย|ควบคุม|ธรรมชาติ|วาง|ส่วนใหญ่|ปกติ|ยืน',
    'ประการ|บริหาร|สัญญา|สมาชิก|นิยม|รอ|หลังจาก|ต้น|สิ|อนุญาต|ร่าง|สอน|ญี่ปุ่น|ทางการ|เปล่า|ใกล้|สิบ|แก้ไข|เพลง|พิเศษ',
    'จัดการ|ปาก|เป็นต้น|ความหมาย|บริเวณ|ยิ้ม|ทั้งนี้|ยุค|สัตว์|บท|รวมทั้ง|เขต|ดูแล|หาย|นอก|ไม้|บังคับ|ยาก|สาย|อัตรา',
    'ได้แก่|เชิง|ตรวจ|วันนี้|สำนักงาน|จบ|สัมภาษณ์|ทันที|เจอ|ยอมรับ|เจ้าของ|ผู้ชาย|นอกจาก|ชุมชน|ทั่ว|ขาด|ยังไง|อา|ไง|สวย',
    'เจ้าหน้าที่|รายงาน|ข่าว|ฉบับ|ฐานะ|มิ|สถาบัน|ประธาน|ปรับ|สนับสนุน|โต|เกี่ยวข้อง|แพทย์|ดังนี้|เสมอ|หล่อน|ตอนนี้|เครื่อง|แก้|ทหาร',
    'เหลือ|ระเบียบ|วิเคราะห์|แดง|อารมณ์|จิต|ช่วยเหลือ|ยังคง|รีบ|ปล่อย|ขาว|เหตุผล|ปลา|ต่างประเทศ|สั่ง|มิได้|ร้อน|แบ่ง|ปกครอง|เน้น',
    'ถือว่า|ประตู|รูปแบบ|ความสำคัญ|เรือ|หมายถึง|เต็ม|ธุรกิจ|ชัดเจน|หยุด|นับ|อังกฤษ|โอ|แยก|ร่างกาย|หัวใจ|สนใจ|อาจารย์|ทั่วไป|คุย',
    'ศาล|ต่ำ|ความผิด|มหาวิทยาลัย|พัก|ดิฉัน|ปิด|สุดท้าย|ต่อมา|จำ|มากมาย|สาร|แรงงาน|กลัว|ดำ|เหนือ|ใต้|เหตุการณ์|สี่|รายได้',
    'ถนน|วิ่ง|ไอ้|กระบวนการ|ได้ยิน|อธิบาย|ตก|วัย|ทอง|นึก|กรุงเทพ|แจ้ง|เหมาะสม|ดาว|ที่สำคัญ|เส้น|ธรรม|จ่าย|ป่า|แน่',
    'ร้อง|ป้องกัน|เหรอ|สุด|กรรมการ|ปัจจัย|ทำการ|เย็น|ตัดสินใจ|อุตสาหกรรม|คดี|สายตา|เร็ว|คำถาม|ชน|ค้า|หัวเราะ|นอกจากนี้|ทะเล|ห้า',
    'พระราชบัญญัติ|ศรี|ที่ดิน|รุ่น|ตำรวจ|ซี|จนถึง|ที่ผ่านมา|พฤติกรรม|กรม|ทิ้ง|โครงสร้าง|แหล่ง|ขณะที่|เสร็จ|เลี้ยง|เก่า|เพิ่ง|ที่มา|ตรวจสอบ',
    'ไม่ค่อย|ร้อย|ราช|ค่อย|ระบุ|แก้ว|เลิก|รายการ|ผู้นำ|คุณภาพ|ความจริง|ศาสนา|กิจกรรม|ร้อยละ|อดีต|เช่นนี้|หนุ่ม|ส่งเสริม|กิจการ|แน่นอน',
    'ขั้น|อาชีพ|ข้าพเจ้า|ตัด|หน่วยงาน|ผ้า|เกือบ|ก็ตาม|บทบาท|สถานที่|ชาวบ้าน|หนัง|หน่อย|เพศ|พระองค์|ความสามารถ|ทฤษฎี|สหรัฐ|พวกเขา|เกษตร',
    'ภาษี|นักเรียน|โทษ|ไกล|ตกลง|ถูกต้อง|รอง|แทบ|หมู่บ้าน|ปลาย|หน่วย|ไฟ|ยื่น|เตรียม|ประเด็น|คำสั่ง|หนี|มาตรฐาน|ติดต่อ|เจริญ',
    'สังเกต|วิชา|หนัก|จิตใจ|สำนัก|อย่างไรก็ตาม|อากาศ|ประสบ|เจตนา|เรื่อย|เลือด|องค์กร|ชา|ดำเนิน|แสน|คอย|คนใน|ข้าราชการ|ขยาย|สรุป',
    'ลอง|เสื้อ|น้ำมัน|แข่งขัน|หมายความ|ห้าม|มั้ย|สบาย|งบประมาณ|สื่อสาร|ช่าง|เนื้อ|ในขณะที่|สา|ทีม|คล้าย|ขา|ทรัพย์สิน|ภาวะ|วรรค',
    'เอ|ดิน|สวน|ยาย|มุม|ฟ้า|สงสัย|ลา|ผิว|กว้าง|เบา|สงบ|สั้น|สื่อ|บ้า|เล่ม|หลักฐาน|ชม|แปลก|ทุกข์',
    'พัน|จำกัด|สาเหตุ|รา|นิติกรรม|กล้า|ลำดับ|แนวทาง|ชวน|ศพ|อันเป็น|บ่อย|พลัง|ลืม|บัญชี|ธรรมดา|แม้แต่|ยอด|ทั้งหลาย|นายกรัฐมนตรี',
    'เมืองไทย|เกินไป|ย้าย|เอกสาร|ทำหน้าที่|บันทึก|คราว|พื้น|เอกชน|ดำรง|ปริมาณ|เที่ยว|แนวคิด|กรรม|ไหล|เช้า|โดน|นก|หนี้|โต๊ะ',
    'ทุน|พ่อแม่|ศูนย์|กา|ช้า|กี่|หวัง|เรียบร้อย|ไร้|ลุก|กล่าวถึง|สถาน|องค์|รายละเอียด|เดี๋ยว|เรียนรู้|ชิ้น|สถานการณ์|รัฐธรรมนูญ|คำตอบ',
    'ค่อนข้าง|งาม|อันตราย|ประกอบด้วย|โน้ต|วง|พิมพ์|พื้นฐาน|อ่อน|สุ|เทคโนโลยี|สม|กอง|ป้า|ดวง|มั่นคง|เท่ากับ|ฝน|ตะวันตก|ความต้องการ',
    'นคร|ซ้ำ|หลวง|ชั่วโมง|ฆ่า|สามี|อิทธิพล|พร้อมกับ|ประสบการณ์|ภายใต้|ลึก|ยาม|ครึ่ง|ศิลปะ|สิ่งแวดล้อม|งั้น|เป้าหมาย|กาย|สุขภาพ|นิ่ง',
    'แฟน|ส่งผล|อี|ชี้|ครบ|ชายหนุ่ม|พระเจ้า|ผู้ใหญ่|ฯลฯ|ตั้งใจ|แผน|แต่ง|อย่างยิ่ง|เกาะ|เงื่อนไข|ปลอดภัย|มหา|แท้จริง|อนาคต|แต่งตั้ง',
    'ประสิทธิภาพ|เปิดเผย|สมบูรณ์|ประวัติศาสตร์|เปรียบเทียบ|สาขา|ชัย|พ้น|เงียบ|ผู้คน|แต่งงาน|เยอะ|อะ|ฝัน|กรุง|ปลูก|ลม|ฐาน|ซะ|มติ',
    'โทรศัพท์|ฝึก|ละคร|ก้าว|ภายนอก|ภาพยนตร์|แม้ว่า|แปล|พลังงาน|นั่นเอง|ผลงาน|สูงสุด|ผลกระทบ|ท้องถิ่น|ต่อเนื่อง|ขณะ|อาคาร|ชัด|พอใจ|ญาติ',
    'ส่วนตัว|ข้าม|ตี|รวดเร็ว|ท่า|เหล่านั้น|สมเด็จ|สอบ|นาที|ให้การ|อ้าง|รับรู้|ข้า|บุญ|ปรับปรุง|ซา|โรง|ข้อความ|ทำลาย|สนิท',
    'แถว|เรื่องราว|เข้าสู่|กระจาย|เถอะ|พวกเรา|เพชร|ดอก|โรงพยาบาล|ความสำเร็จ|ประโยค|ความเชื่อ|กลิ่น|พืช|ก่อให้เกิด|นักศึกษา|ห่าง|ดา|แนะนำ|ต่อไปนี้',
    'เพิ่มเติม|ระ|บัญญัติ|แถม|หลักการ|เท้า|ล้วน|แผ่นดิน|ประ|ตลอดจน|ภัย|สัมผัส|วิชาชีพ|ที่ไหน|วัตถุ|แง่|ยัย|หู|สมอง|แขน',
    'เติบโต|ธนาคาร|หัวหน้า|เพียงแต่|ดนตรี|เก่ง|โบราณ|ลูกค้า|ทำนอง|หิน|ไอ|หลับ|ต่อสู้|หมู่|สะดวก|พนักงาน|แสง|เอ่ย|กระแส|ยืนยัน',
    'ออกแบบ|สำเร็จ|ลูกจ้าง|เนี่ย|บางที|บรรดา|รุนแรง|ก่อ|หลักเกณฑ์|คาด|จากนั้น|ติดตาม|หายใจ|คุณสมบัติ|นำเข้า|หวาน|สมควร|ดูเหมือน|อาทิตย์|กระทบ',
    'โดยที่|คัน|ประชาธิปไตย|เรียกร้อง|ภรรยา|ห่วง|เกษตรกร|ราว|มิใช่|กระเป๋า|อิสระ|โรงแรม|คอ|พันธุ์|ชำระ|เสด็จ|ฝรั่ง|มุ่ง|อิน|การเงิน',
    'สำรวจ|ยึด|ย่อย|เริ่มต้น|เครื่องมือ|สนุก|ท้าย|ปฏิเสธ|ภายหลัง|อุปกรณ์|วิทยาศาสตร์|รับรอง|โดยตรง|โรงงาน|มาตรการ|โกรธ|รัฐมนตรี|ผลประโยชน์|ตื่น|บิน',
    'ขั้นตอน|ทา|ยิง|สงคราม|องค์การ|จัดทำ|ดึง|พยาบาล|วิ|คุ้มครอง|หยิบ|ท่องเที่ยว|กรอบ|เชียง|กะ|สหรัฐอเมริกา|ยุโรป|คะแนน|เจ็บ|พลาง',
    'กล่าวคือ|ผู้เขียน|คำพูด|คุณค่า|ประเมิน|วา|ปรึกษา|พอดี|จัดตั้ง|กฎ|แล|จ้าง|บทบัญญัติ|ม้า|หอม|อย่างน้อย|ช่อง|วัตถุประสงค์|คา|เหมือนกับ',
    'เชิญ|นิด|จังหวะ|มองเห็น|สะท้อน|หนังสือพิมพ์|รอย|อำเภอ|ตาราง|ดอกไม้|แตก|เสื้อผ้า|รึ|พุทธ|ขน|แหละ|ชนบท|วิชาการ|จำเลย|ค่าใช้จ่าย',
    'เล็กน้อย|นาม|เคลื่อนไหว|เนื้อหา|เค|ถอน|ที่ตั้ง|ล้าง|จนกระทั่ง|พี|ส่งออก|แผ่น|ความสนใจ|ก็ดี|นิ้ว|ระวัง|รางวัล|สะอาด|ชนชั้น|คุณแม่',
    'บรรยากาศ|พูดถึง|แท้|ผลิตภัณฑ์|นัด|เขียว|ไม่ทัน|ล่า|โร|ขนส่ง|ชั่ว|ฝรั่งเศส|หน้าตา|อันดับ|ล่าง|ท้อง|ลอย|น้ำหนัก|ร้าย|ปัญญา',
    'ลับ|เสี่ยง|การเลือกตั้ง|ใส|ต้นไม้|แม่น้ำ|ผัก|ที่นั่ง|หก|สถานี|ชนะ|ฝาก|พิสูจน์|ดิ|เต็มที่|เลขาธิการ|พลอย|สด|หมา|คึกฤทธิ์',
    'ว่าง|สัญญาณ|สอดคล้อง|หลากหลาย|ริม|บา|ตัน|ดัน|นายก|ข้างต้น|แอบ|ประชากร|เทียบ|ผู้ป่วย|ฝีมือ|ไหว|ฉะนั้น|สิ้น|เช่นเดียว|สมาคม',
    'หลง|ท่าทาง|ใบหน้า|มอบ|ขณะนี้|รถยนต์|คิดถึง|พิธี|ไฟฟ้า|กด|รี|ทีเดียว|จี|ข่าวสาร|พาณิชย์|หมื่น|อก|ลูกสาว|ถิ่น|ลงโทษ',
    'พล|ทั้งสิ้น|ผี|จำหน่าย|เทคนิค|ฝั่ง|วงศ์|เชื้อ|กู|เมีย|บริโภค|ลูกชาย|คอร์ด|เทพ|องค์ประกอบ|ผสม|ดื่ม|ตอนนั้น|สติ|เซ',
    'ราวกับ|สอบสวน|กำเนิด|ปืน|ดวงตา|ขัด|เรือน|นั่นแหละ|รส|นับแต่|ขึ้นอยู่กับ|เลื่อน|ริ|รับผิดชอบ|หนาว|ฤทธิ์|ศึก|ติ|ซ้าย|ประกัน',
    'เสริม|ลาย|เส้นทาง|อเมริกัน|โทรทัศน์|ประธานาธิบดี|ละเอียด|เค้า|ลุง|วินิจฉัย|ผูกพัน|ตัวแทน|เตอร์|เช่นนั้น|บิดา|ผู้แทน|พิษ|คิดเห็น|คุรุ|เฝ้า',
    'กระดาษ|สมรส|ตะวันออก|ทั้งที่|ประสงค์|นิ|อินเดีย|โอน|ต้นทุน|ใกล้ชิด|ลิ|กองทุน|น่าสนใจ|ทน|สาระ|หลาน|กระตุ้น|ไร่|ศักดิ์|ไท',
    'ขอบคุณ|นั่นคือ|เมตร|บุตร|กีฬา|มารดา|แล้วแต่|ทะเบียน|วิญญาณ|คณะรัฐมนตรี|สนาม|ยกเว้น|การลงทุน|แสดงออก|ขับรถ|มูลค่า|กลับบ้าน|วาด|เพียงพอ|จัง',
    'โฆษณา|ทิศ|แผนที่|แทนที่|ความขัดแย้ง|ดังที่|สัปดาห์|เอเชีย|แน่ใจ|เช่า|ตีความ|วี|คนเรา|หุ่น|น้า|สวยงาม|เลือกตั้ง|บรรจุ|เยี่ยม|รวบรวม',
    'รัชกาล|บรรยาย|ปา|ถ่าย|ไล่|เห็นด้วย|ซิ|ทรัพย์|กร|เหนื่อย|ความร่วมมือ|ฟิลิปปินส์|ทิศทาง|ไก่|ภูมิภาค|พระมหากษัตริย์|คำนึง|ต่างหาก|ทดลอง|รับประทาน',
    'บัตร|ตัดสิน|จิ|หลบ|อเมริกา|น่ารัก|ปฏิบัติงาน|สร้างสรรค์|เหมาะ|ถวาย|คนไข้|แพง|ลงทุน|เร่ง|ระบอบ|เกณฑ์|ยู|ผลผลิต|ข้างหน้า|อิ',
    'จง|น้ำท่วม|ข้อเท็จจริง|ถุง|สตรี|เรียง|แพ้|โด|ความเสียหาย|เยาวชน|วิทยา|ทรัพยากร|พี่น้อง|บ้านเมือง|ปฏิบัติการ|อาวุธ|หุ้น|แข็งแรง|ก้าวหน้า|ประเพณี',
    'เจรจา|นัย|พร|สืบ|โค|ขนม|สู้|สมาธิ|นึกถึง|นับถือ|ตึก|คำนวณ|จอด|ศิลปิน|ทำเป็น|ฟัน|ตกใจ|วางแผน|สมัยใหม่|เท่าไหร่',
    'นอกจากนั้น|พุทธศาสนา|โดยทั่วไป|นิสัย|น้ำตาล|ฉาก|กุ้ง|ปรารถนา|ชาวนา|สยาม|คลื่น|เวที|เห็นชอบ|สวม|อนุมัติ|เศร้า|ปวด|โปรด|ลำ|ตรงนี้',
    'เสรีภาพ|โม|ฟ้อง|โครง|สัน|เรียบ|ขยายตัว|เตือน|ประมวล|ทุกวันนี้|เกม|ความเป็นจริง|ปฏิรูป|อด|มอบหมาย|ช้าง|เต้น|เงินเดือน|นายจ้าง|ทั้งนั้น',
    'ประสาน|อาญา|ฉาย|เตียง|ผู้นั้น|น้ำเสียง|คอมพิวเตอร์|ทราย|วงการ|ยินดี|ขอบ|ตู้|วะ|คำพิพากษา|ดำเนินงาน|ทาน|เฉย|ยุติธรรม|ทำร้าย|ทดสอบ',
    'โน|วิทยุ|ชิ|ถ้าหาก|แต่งตัว|ทศวรรษ|รี่|โจทก์|ศีรษะ|ตัวเลข|สว่าง|ผู้อำนวยการ|สีหน้า|เร|ภาระ|เสรี|สหกรณ์|แลกเปลี่ยน|ลบ|อธิบดี',
    'หมาย|ร้องไห้|วัง|ผู้บริหาร|ต่อต้าน|เจ|พึง|ราม|ประวัติ|จาน|อร่อย|จริงจัง|เพราะว่า|เม็ด|ท่อ|ปรับตัว|กล่าวหา|สาธารณะ|มั่นใจ|ก่อสร้าง',
    'ปู|หลังจากนั้น|แห้ง|เหลือง|กลไก|เพราะฉะนั้น|ไหว้|จันทร์|เคารพ|สัญลักษณ์|กษัตริย์|พยัก|ก้ม|รูปร่าง|สะสม|ลี|ใช้งาน|สัดส่วน|แนวโน้ม|ขวา',
    'หลักสูตร|การคลัง|อยุธยา|ตอบแทน|ดอกเบี้ย|พม่า|พยาน|ยินยอม|ทัน|บุรี|ชัก|ไข่|บุคลากร|หมู|ชื่อเสียง|โท|บ่น|เอก|เผา|ตำนาน',
    'มิให้|ฟื้นฟู|ส่วนร่วม|ที่แล้ว|ข้อตกลง|ตัวละคร|ถ่ายทอด|เบื้องต้น|นาฬิกา|แน่น|สูญเสีย|ลำบาก|ลาน|ดับ|สมัคร|กระ|ยิ่งใหญ่|ก๊าซ|มีอายุ|นิทาน',
    'ตระหนัก|โทร|ภูมิ|แสวงหา|มืด|ดีใจ|พี่ชาย|ฤดู|แย่|ตรงข้าม|แต่ว่า|รอยยิ้ม|นี|เฉลี่ย|อาทิ|ระเบิด|บันได|รองเท้า|กังวล|เชื่อมโยง',
    'หลุด|ขับ|เหลือเกิน|ชิน|ได้ที่|แปลง|ยากจน|มหานคร|คุม|ปรากฏการณ์|ผู้ปกครอง|โซ|ผู้ใช้|รัฐสภา|วัยรุ่น|สื่อมวลชน|ถัด|เผยแพร่|คลอง|ตื่นเต้น',
    'ยกเลิก|หัก|เก้าอี้|อักษร|ย่า|ปฏิวัติ|แปด|ป่วย|ซัก|ถึงกับ|แขก|นิตยสาร|ปู่|ประสาท|เกียรติ|ทอด|น้ำตา|ปราศจาก|กว้างขวาง|กำจัด',
    'โชคดี|ตุลาคม|ผู้จัดการ|จดหมาย|ผู้บริโภค|พระยา|ขยับ|พูดคุย|เจ็ด|เสียก่อน|ดินแดน|ศูนย์กลาง|เสือ|สนทนา|ล้ม|ตกเป็น|เด็ดขาด|ขี้|เซลล์|ตรา',
    'ตะ|ประกอบการ|ลาว|เอส|ยะ|กางเกง|วาระ|ภาคใต้|รถไฟ|เบื่อ|ใกล้เคียง|ชาติไทย|สิ้นสุด|ขอโทษ|โล|วรรณคดี|รอด|เดี๋ยวนี้|ตำบล|ซอย',
    'แผล|เครือข่าย|บุหรี่|หนา|เติม|โก|เข้ม|หัวข้อ|คว้า|กิ|ศีลธรรม|เศษ|จารึก|ใช้ได้|หล่อ|ลักษณ์|ผลไม้|หญ้า|คอมมิวนิสต์|แถบ',
    'หลีกเลี่ยง|เท|สภาวะ|ล่วงหน้า|จดทะเบียน|โย|เล|รู้ตัว|เชื่อม|ระบาย|หมายเลข|บาดเจ็บ|ข้อบังคับ|ปลัด|ทั้งคู่|ตะโกน|เม|อบรม|แข็ง|กองทัพ',
    'หมวด|บี|ค้าง|ท่ามกลาง|อาเซียน|กอด|เหล้า|ตัวแปร|หารือ|ริน|สวรรค์|ธิ|จา|ทำท่า|คุณหมอ|ปัก|กันและกัน|พรรคการเมือง|ชิง|เดือดร้อน',
    'ถัง|เหล็ก|ออกเสียง|สั่น|ก้อน|คัดเลือก|อุปสรรค|แต่อย่างใด|โปรแกรม|มิติ|โมง|เหรียญ|เจ้านาย|ตอบสนอง|ปรกติ|ราชอาณาจักร|อนุรักษ์|รายจ่าย|บวก|เศรษฐศาสตร์',
    'เครื่องหมาย|ฉลาด|เด่น|สิทธิ์|ที่จริง|ขอบเขต|ประพฤติ|เอ็ม|คม|จมูก|คนงาน|จนกว่า|ศตวรรษ|พระพุทธเจ้า|นับว่า|ปั้น|ครอบครอง|บทความ|ทักษิณ|ผูก',
    'ศัตรู|จอมพล|กำลังใจ|กระจก|ทุนนิยม|กุล|บรรลุ|ทดแทน|ราษฎร|กำไร|ค่าจ้าง|มุก|เชื่อมั่น|งดงาม|ถึงแม้|ครัว|นิยาม|เหยื่อ|ขยะ|อวัยวะ',
    'รองรับ|เป็นไร|บ่าย|เห|เบอร์|สูบ|ชี้แจง|อากร|ขณะเดียวกัน|รุ่ง|สากล|กัด|แข่ง|จำคุก|กันเอง|กฎหมายแพ่ง|ข่าย|เครื่องบิน|ขอรับ|ที่ปรึกษา',
    'ตระกูล|เว้นแต่|มีชื่อ|จริยธรรม|สระ|กิจ|ผ่าตัด|เน|ทางเลือก|เสียหาย|นักการเมือง|ชื่อว่า|แฟชั่น|พระบรม|โชว์|ประหยัด|อบอุ่น|ถ้อยคำ|กู้|เหล่า',
    'สบายใจ|ป้าย|เพียงใด|ลาก|สมบัติ|นี่แหละ|ล่าสุด|ค้นพบ|เมื่อไหร่|จัดหา|ตำรา|นม|ย้ำ|ชู|กวี|วิจารณ์|ผู้ผลิต|เสียใจ|ธันวาคม|ชั่วคราว',
    'ค่ำ|เข้มแข็ง|พรุ่งนี้|สบ|พิพากษา|นี้เอง|ประชาธิปัตย์|ศักยภาพ|มีเสียง|รู|ผืน|ค่านิยม|เบิก|ยาง|สถิติ|ผิวหนัง|ล้อ|มีด|ความพยายาม|กล้ามเนื้อ',
    'ความรุนแรง|ประมง|จัดสรร|เสื่อม|ความดี|ยาเสพติด|ขวบ|ความรับผิดชอบ|ลาออก|กลางวัน|สังกัด|เผชิญ|นอกเหนือ|เทียน|ยุ่ง|วิน|พฤษภาคม|พุ่ง|คลอด|สาธารณสุข',
    'หมุน|มึง|ชั่น|วัสดุ|พระราชทาน|ลัทธิ|ฝึกอบรม|ด่า|สูตร|ทับ|อุบัติเหตุ|อุดมศึกษา|ดั้งเดิม|ไร|เคลื่อน|ห้องน้ำ|ส่าย|คิ้ว|อาย|ผิดพลาด',
    'ไหม้|เสา|หน้าต่าง|ประดับ|ครอง|พอสมควร|นักวิชาการ|มายัง|อนุกรรมการ|เงา|จัดงาน|ตรงกันข้าม|ขวด|ซ่อน|ปกป้อง|ครอบคลุม|ดอลลาร์|รัฐมนตรีว่าการ|เข้าถึง|บริสุทธิ์',
    'ย่าง|แปลกใจ|คุ้นเคย|ครรภ์|พักผ่อน|เพียงแค่|วินัย|บำบัด|นักท่องเที่ยว|กล้อง|เชียว|เผย|ร่วมมือ|กำแพง|กาแฟ|กลางคืน|เท่าไร|สงสาร|ซ้อน|พร้อมทั้ง',
    'มิตร|เกลียด|ชื่นชม|ขบวนการ|จิตวิทยา|กริยา|นักวิจัย|ค้นหา|เที่ยง|บัว|ส่วนมาก|กระดูก|รบ|สเปน|อาบน้ำ|ธาตุ|ดารา|ฮะ|ศุลกากร|คู่กรณี',
    'เออ|ศาสตราจารย์|แดด|กล่อง|ซื้อขาย|สะพาน|จะเห็นได้ว่า|ครัวเรือน|เป็นอัน|วินาที|โจมตี|พลิก|ทาส|ข้อสังเกต|พระพุทธศาสนา|กระทำการ|ตัก|แผนการ|บาน|มะ',
    'เจ็บปวด|แมน|จ้อง|ทันสมัย|ส่อง|รัฐวิสาหกิจ|ไขมัน|กำกับ|อภิปราย|ผู้ทรง|ประเมินผล|เปอร์เซ็นต์|ซับซ้อน|แวะ|นึง|คำแนะนำ|มูลนิธิ|ยักษ์|ต้อนรับ|ขุน',
    'ทีละ|แกล้ง|วุ่นวาย|ฝัง|ยศ|อ้าว|สำนวน|อพยพ|ไหล่|ว่าความ|มกราคม|อุดหนุน|ยาวนาน|คำขอ|ร้ายแรง|เหมือนเดิม|กระโดด|ศรัทธา|ปรัชญา|พัด',
    'ยี่สิบ|อุดมการณ์|ผู้สื่อข่าว|มีนาคม|นนท์|ถอด|นุ|ระมัดระวัง|ผู้ช่วย|เลข|ศาสตร์|ความหวัง|เจาะ|ภารกิจ|ใช้จ่าย|คบ|พิ|เสมือน|เครียด|ส้ม',
    'มงคล|แมว|เจ้าหญิง|ชุมนุม|แวว|หลอก|ทบทวน|ลงมือ|พนัน|ตกแต่ง|ราศี|จินตนาการ|เชื้อเพลิง|เท่าเทียม|สวัสดิการ|กุมภาพันธ์|บริจาค|งบ|คำอธิบาย|ถ้วย',
    'อุป|กลม|ศาลฎีกา|จัก|สิงคโปร์|ศัพท์|นักเขียน|หอย|อีตา|ที่รัก|เท่าใด|หน|สดใส|สับสน|ระงับ|ผลักดัน|ปราบปราม|ลูกหลาน|ต้า|หนอง',
    'มลพิษ|ช้อน|บังเอิญ|สถานภาพ|อายุความ|สูงอายุ|ท่าที|แชมป์|ปฏิกิริยา|มาร์|ข้อเสนอ|นับตั้งแต่|พิการ|ต้ม|หิว|ว่าที่|สนอง|สลับ|ย้อน|เมตตา',
    'กรกฎาคม|ขัดแย้ง|แก้ม|จูงใจ|เดา|ออกกำลังกาย|ลิ้น|สำนึก|พนักงานเจ้าหน้าที่|เมษายน|อ้วน|มะเร็ง|แดน|ซู|ฝูง|คุณธรรม|ลึกซึ้ง|จับกุม|ตอนแรก|รัตน์',
    'กาล|ประหลาด|ตอบโต้|อดทน|พระบาทสมเด็จ|เยอรมัน|กุหลาบ|ตลก|จี้|ขวัญ|เจ้าชาย|เอ็น|อำนวย|เผ่า|ผสมผสาน|มณี|ผนัง|ประกาย|ประทับใจ|อัล',
    'สมมติ|ทุ่ม|พ่อค้า|ชรา|ยืด|ผู้ฟัง|ลมหายใจ|คณะกรรมาธิการ|ชายแดน|ไซ|อุณหภูมิ|สนุกสนาน|กันยายน|อ้อม|มื้อ|ดุ|ชอบธรรม|เอ่อ|ย่าน|ภูเขา',
    'ผู้ประกอบการ|เก้า|ศิริ|เนื่องมาจาก|พึ่ง|อภิสิทธิ์|พงษ์|จด|วรรณกรรม|รายชื่อ|วัว|ยกย่อง|รัง|สม่ำเสมอ|เลี้ยงดู|ครู่|เรียว|กฎกระทรวง|บำรุง|ชมพู',
    'ทัศนคติ|น่าเชื่อ|กระทั่ง|รัสเซีย|ทำบุญ|เฮ|อนุ|ล้อม|ด้วยเหตุนี้|บ่อ|คอลัมน์|คัดค้าน|ทักษะ|ประชา|ไว|ประพันธ์|องศา|มัว|แจก|การ์ตูน',
    'รวมตัว|ทำตัว|พลาด|สิ่งของ|รับผิด|เกรง|บัดนี้|ขี่|หาง|เปลือก|กุศล|ทารก|มหาดไทย|ต่างชาติ|ในที่สุด|ค่าย|ขโมย|ดวงอาทิตย์|ยุ|ห่อ',
    'ร่วง|แค่นี้|เยือน|โค้ง|อิ่ม|กิโลเมตร|สมการ|ริมฝีปาก|ขบวน|เอกลักษณ์|บันเทิง|สะ|นิติบัญญัติ|สภาผู้แทนราษฎร|เว็บ|ของเสีย|ผู้บังคับบัญชา|ต่างด้าว|แกน|ทุ่ง',
    'ต้องหา|สถานะ|ที่พัก|ผู้แต่ง|ผู้เชี่ยวชาญ|เสน่ห์|ตัวเรา|สภาพแวดล้อม|ประมาท|รบกวน|อักเสบ|ซอง|แบรนด์|ครั้น|ร้องเพลง|พฤศจิกายน|ธี|ยกมือ|สอบถาม|แหลม',
    'แคบ|สีสัน|เป้า|ในขณะเดียวกัน|คนรัก|ลั่น|ก่อนหน้านี้|มี่|แป้ง|ศึกษาธิการ|จ๊ะ|เวียน|จำแนก|โปร|คิว|ฉลอง|หนทาง|ปน|ซ่อม|เลว',
    'ทัศนะ|เลิศ|สน|แบบจำลอง|ตัวผู้|วงจร|ร้องขอ|ญา|เผลอ|กระบอก|ทรมาน|กฎเกณฑ์|ละเมิด|มุสลิม|สมัยก่อน|น่ากลัว|มิถุนายน|สุโขทัย|ตบ|ต่อเมื่อ',
    'เปน|ลัก|อร|ตีพิมพ์|ทะ|ธานี|วร|วุฒิ|คุณวุฒิ|ประทับ|ใส่ใจ|โผล่|เอฟ|พระบาทสมเด็จพระเจ้าอยู่หัว|ประชาสัมพันธ์|น้องชาย|ประสานงาน|ถอย|วิถี|รสชาติ',
    'ทว่า|ขุด|ไข้|คอน|ถาวร|วันหยุด|อ่อนโยน|ปลอม|อุ|ประดิษฐ์|ทั้งปวง|คาดหวัง|อาร์|คุณปู่|วรรณ|ถนัด|ด้อย|สารเคมี|ยั่งยืน|สมดุล',
    'ซี่|มรดก|ตัวอักษร|อย่างไรก็ดี|สามสิบ|หลุม|เฉลิม|หมั้น|แผนก|แย่ง|ก้อง|แบบแผน|ราชา|รวย|แต่ก่อน|จอ|คลาย|ทะเลาะ|ทีวี|เอียง',
    'ลิน|ฮา|กวน|ค้นคว้า|แก่น|ดีแล้ว|มหาชน|ผู้สมัคร|กุญแจ|ราชวงศ์|วิถีชีวิต|ระยะทาง|ก่อนหน้า|เอ็ด|เป็นต้นมา|อนุสัญญา|เดี่ยว|ดำเนินคดี|อาชญากรรม|แอล',
    'เมา|มาเลเซีย|โง่|จักร|เฮ้ย|ภูมิใจ|ทักทาย|คู่สมรส|ไต|เงย|เพื่อนบ้าน|โน่น|ทางออก|จม|เวช|เด|สไตล์|ประกวด|กลาย|ผิดหวัง',
    'เอ็ง|แกะ|สำเนา|นี่เอง|ทุจริต|สิงหาคม|ถ่ายรูป|อ้อ|นิดหน่อย|นานา|คัด|อนามัย|ปรา|เหมา|เงินได้|หลังคา|ควาย|รำ|โมฆะ|สิงห์',
    'จักรยาน|ขำ|โยน|ชำนาญ|ไผ่|ผู้ต้องหา|ท้องฟ้า|ดังเช่น|ต่อว่า|โก้|หอ|ย่อ|เกษตรกรรม|ชิด|ดูด|โชค|ขาดแคลน|ทอ|ออม|ซึม',
    'ทูต|แทรก|อีสาน|เวียดนาม|ความเร็ว|ล้มเหลว|ค่าเช่า|สักหน่อย|บูชา|ลิง|พระเอก|สนามบิน|ทองคำ|ถึงแม้ว่า|รับทราบ|ฟุตบอล|เข็ม|ทุกที|คุณหญิง|สามัญ',
    'โล่ง|ข้างใน|พะเยา|แกม|จาง|โน้น|ภาคเหนือ|แม้กระทั่ง|ยุติ|ขัง|แฝง|นวด|เคลื่อนที่|เทศบาล|ข้างนอก|เอาแต่|ฉุกเฉิน|บีบ|สงค์|ศักดิ์สิทธิ์',
    'บุก|ปรุง|ด่วน|ข้อสรุป|ค้น|อ่อนแอ|ควัน|ฉีด|หงุดหงิด|รูปทรง|ทัก|สาน|นุ่ม|บาร์|ท่อน|วน|นักร้อง|เกอร์|ผู้ตาย|ขีด',
    'ส่วนรวม|ประกันภัย|สุร|ทวีป|ถึงขนาด|ตรัส|เกี่ยว|แพร่หลาย|สวด|นานาชาติ|ตุ๊กตา|ขวาง|ก็แล้วกัน|วาน|ผู้ชม|สืบสวน|ผัด|สิริ|เจ้าพนักงาน|มูล',
    'เชื่อถือ|เสาร์|หลอดเลือด|สุจริต|รับใช้|เว้น|มั้ง|ความถี่|วงเงิน|ในขณะนั้น|ครบถ้วน|งู|พิพิธภัณฑ์|กึ่ง|พึ่งพา|ฟรี|กับข้าว|มหาศาล|ประมวลกฎหมาย|นพ',
    'หัด|สกุล|สถาปัตยกรรม|อาณาจักร|เงินกู้|สำรอง|ข้อจำกัด|ทีนี้|ทางเดิน|มารยาท|ราก|ซาน|พระนาง|ภู|ปอด|สิน|ยุทธศาสตร์|เตรียมตัว|อิเล็กทรอนิกส์|วัตถุดิบ',
    'นายทุน|แนะแนว|คริสต์|เข่า|อ้างอิง|ตอบรับ|เจ้าฟ้า|เสียดาย|เงินทุน|แผ่|ท้าทาย|สลาย|ต่อหน้า|ปลุก|ออสเตรเลีย|เดช|อย่างเช่น|วุฒิสภา|ทำเอา|อ้าย',
    'เปรียบ|พงศ์|ศิลป์|แถลง|เช็ค|รัฐศาสตร์|เนื่อง|ของขวัญ|ช่องทาง|เกาหลี|เห็นใจ|แตะ|จิน|เซอร์|พลาสติก|กุญแจเสียง|เลขานุการ|ธุระ|อึ้ง|ลอ',
    'รับจ้าง|ผู้ว่าราชการ|แซม|สติปัญญา|วิเศษ|จอม|ภา|อ่ะ|ปราสาท|ทิพย์|ค้าขาย|หาด|ดาบ|นิติบุคคล|เป็นต้นไป|แหม|ชายฝั่ง|ชล|สมุด|ให้ออก',
    'ครีม|เมล็ด|ความมั่นใจ|ยาน|ปีก|ลูกหนี้|ก่อตั้ง|สังคมนิยม|ยืม|เลีย|รั้ว|ตรงกัน|น้ำใจ|ต่อรอง|ขุนนาง|ใบไม้|ท้องที่|คลุม|เด็กชาย|พูดจา',
    'ต่างจังหวัด|ทรัพยากรธรรมชาติ|เข้าหา|แอน|เศรษฐี|นักกีฬา|อัด|แปร|คมนาคม|คล้ายคลึง|เอื้อ|อืม|กราบ|ยุบ|ห้าง|เมื่อใด|ผัว|สุก|ประยุกต์|วิกฤติ',
    'รูปธรรม|แล่น|เจ้าพระยา|บันดาล|เมฆ|วัฒน์|เบื้องหลัง|จุฬาลงกรณ์|ด้านหน้า|ขจัด|เฮ้อ|เจ้าตัว|พิทักษ์|เลยทีเดียว|บริหารงาน|เน็ต|อึดอัด|มาริ|จักรวาล|ม่วง',
    'บ่|คุ้ม|กู้ยืม|เคลื่อนย้าย|ประหาร|ดัชนี|จอง|อุทธรณ์|พลเรือน|พอเพียง|วิกฤต|ประท้วง|ตาก|เวร|โอ๊ย|ก้น|สงเคราะห์|โบ|ฝ่ายค้าน|ใหญ่โต',
    'สมุนไพร|วาท|บัณฑิต|กั้น|โจร|คนร้าย|ทัพ|ภริยา|ร่า|พริก|ทัวร์|ครอบงำ|ประมูล|แลก|ขยัน|เหงา|แหง|เกล้า|งา|หม้อ',
    'สงครามโลก|ดวงจันทร์|เขิน|มั่น|เขมร|เอื้อม|สุวรรณ|โรม|เขื่อน|ศีล|ดอน|ทิ|เคาะ|ชะงัก|ยี่ห้อ|เอาชนะ|ผู้โดยสาร|นวนิยาย|เกลือ|รับราชการ',
    'เลี่ยง|แหวน|ระวาง|เครือ|บาป|บารมี|กัมพูชา|ส่งเสียง|น้ำเงิน|ทัศน์|อาวุโส|ได้เสีย|ขอร้อง|โกหก|เมเจอร์|ตามใจ|อิตาลี|กระซิบ|คติ|คิ',
    'บก|เข้มข้น|แววตา|อุ่น|จราจร|ดัดแปลง|เซ็น|ลวดลาย|นวล|แคน|เทศกาล|กวาด|ซ้อม|ปีงบประมาณ|สวัสดี|พื้นบ้าน|เสพ|แพร่|เพิกถอน|วิตามิน',
    'พิธีกรรม|พันธ์|เน่า|ภพ|โบสถ์|แนบ|เปื้อน|คนจน|คำปรึกษา|ความพร้อม|ขู่|ร่ม|เสียที|รังสี|อังคาร|กรี๊ด|อินโดนีเซีย|รากฐาน|กรุณา|อันดี',
    'ที่นอน|ล้ำ|ภาคกลาง|บีม|จุดมุ่งหมาย|สุภาพ|สกปรก|ชาม|โจ|รำคาญ|ปอนด์|ปาน|มั่ง|สินเชื่อ|ชี|รั่ว|ขณะนั้น|เครื่องจักร|เด็กหญิง|สันติ',
    'แอร์|คอล|แบก|เจน|กุ|เสถียรภาพ|โปรดเกล้า|ย้อนกลับ|จำต้อง|อุ้ม|ว่ายน้ำ|เจ็บป่วย|ดึก|ไอค์|สุดยอด|ยุ่งยาก|ผู้ว่า|ป้อม|บรรเทา|เจ้าหนี้',
    'ไว้วางใจ|ฝา|การณ์|เผด็จการ|สัม|นางเอก|สุนัข|ท้าว|จู|สมุทร|รังเกียจ|สืบทอด|เก|เชือก|พลเมือง|เถียง|บวช|กอส|เต้|ชื่น',
    'นิทรรศการ|มูลฝอย|กิ่ง|ชาดก|ปก|ใจดี|พนักงานสอบสวน|ยืดหยุ่น|ตะวัน|ข้าวของ|เผื่อ|ฝุ่น|อาสา|เดอร์|ชัน|ห่างไกล|เชิด|ฤดูกาล|ประเสริฐ|ยัน',
    'นัง|แบ่งแยก|รหัส|เครดิต|เก่าแก่|กรรมาธิการ|หลับตา|เป่า|ใคร่|บุคลิกภาพ|ซาก|เอาใจใส่|ชะลอ|ธรรมะ|ไต่สวน|ขัน|นิสิต|ถ้ำ|แมลง|ค่าธรรมเนียม',
    'พระทัย|หอบ|ราชกิจจานุเบกษา|ความยุติธรรม|อ้า|กิเลส|ชัยชนะ|ไซต์|แต่เดิม|ปีใหม่|ธารณ|ชมรม|เครื่องประดับ|อภัย|บกพร่อง|กำ|ตรี|ถูกใจ|สุทธิ|ข้อหา',
    'เอว|ศาลา|รุ่งเรือง|ที่ทำการ|ขนาน|ประเทศชาติ|ไม|กุม|ทำเนียบ|แค้น|ฟอง|เต|เหยียบ|มิฉะนั้น|ผ่อนคลาย|ข่มขู่|ระดม|เทา|จงใจ|คงที่',
    'เซน|อาณานิคม|เพ|ครั้งนั้น|เสมอภาค|น้ำแข็ง|ทร|ข้อมือ|ดิบ|เอ๊ย|ดี้|ชั้นนำ|แกง|ดำรงชีวิต|ฝ้าย|กลืน|ข้างหลัง|ผู้เยาว์|ไส้|จัน',
    'กิริยา|ติดตั้ง|ธน|ไชย|ร้องเรียน|เลขที่|กรอง|ความถูกต้อง|คู่สัญญา|อิจฉา|ฝ่าฝืน|ฮอร์โมน|คำร้อง|ธง|กี้|ตกต่ำ|หนอ|ผู้เสียหาย|เถิด|คุ้น',
    'ห่ม|สนิทสนม|หม่อม|บ้านเรือน|จิตสำนึก|มัด|ข้อเรียกร้อง|มณฑล|รณรงค์|ขั้นพื้นฐาน|ฮ่องกง|สะดุ้ง|ชีพ|เจ๊|พื้นเมือง|จูบ|อารยธรรม|ชิม|เหงื่อ|โฆษก',
    'สร้อย|วาจา|เทวดา|โดดเด่น|คลัง|ณา|ข้อกำหนด|ในขณะนี้|พระราชวัง|กฏ|ซ่า|บู|ด่าน|วิพากษ์วิจารณ์|สงวน|ความเครียด|ตับ|ลงนาม|สง่า|สั่งการ',
    'เคียง|อวด|ตี้|ทวี|วิทยาลัย|ปะ|เป็นกลาง|สัมมนา|โมโห|ติดตัว|พัสดุ|กี|เพลิง|เหลือบ|เกรงใจ|รอบคอบ|เดอะ|ร้านค้า|บรรพ|ยง',
    'มัง|สมานฉันท์|เงินทอง|อัยการ|ประจักษ์|แทง|เว|ดาวเทียม|นีซ|สารสนเทศ|จ้ะ|ควบคู่|โลหะ|ผลัก|ดีงาม|เต็มใจ|คุณลักษณะ|บ่งบอก|คุณครู|แล้ง',
    'ยึดถือ|จุฬา|บอล|ฝ่า|ชื่อดัง|อนึ่ง|เครื่องดื่ม|พัง|นักแสดง|นักวิทยาศาสตร์|คุ|เก็บรักษา|บรรพบุรุษ|นางสาว|นักธุรกิจ|ภาพรวม|ฝึกฝน|สามัคคี|ตำหนิ|ลัน',
    'คาน|ประจำตัว|สตางค์|บาดแผล|วงกลม|กระจ่าง|คุก|ทำนา|นรก|อิง|ส่วนท้องถิ่น|ทีมงาน|ดุลยภาพ|วิธีคิด|ผ่า|เมื่อไร|เต่า|แกนนำ|ความจำ|ได',
    'นิดเดียว|พระราชกฤษฎีกา|คุณย่า|ทนายความ|มิน|ลำพัง|ฮ่า|ธรรมเนียม|ปะการัง|เพลิน|อวกาศ|เบื้อง|เสริมสร้าง|ข่มขืน|ก่อการ|สันต์|กลฉ้อฉล|ปริญญา|ฮิ|โลหิต',
    'เป้|แต้ม|สละ|ปัสสาวะ|หันหน้า|ลีลา|ปารีส|ล่อง|ชุน|วาย|แว่น|ภาพถ่าย|เปียก|พระสงฆ์|ศิษย์|เนื้อที่|พับ|มุ่งมั่น|ไล|หลักประกัน',
    'บริบท|แขวน|ห่วงใย|แม่บ้าน|เครื่องสำอาง|รับสั่ง|สอด|โฮ|เลวร้าย|เดอ|เคร่งครัด|ภาคี|ทะลุ|บุ|มหาราช|โดยสาร|ทูล|มวย|ตอนต้น|รักษ์',
    'เรน|ราบ|ระลึก|ฟื้น|กระแทก|ข้อพิพาท|ยุทธ|วิทย์|สิทธิมนุษยชน|เป้น|ลอนดอน|ข้างล่าง|อนุโลม|พระราชา|อบ|บ้านพัก|มัธยม|เพาะปลูก|กระนั้น|ปัด',
    'เลี้ยว|ภาพลักษณ์|สารพัด|บุรุษ|แทรกแซง|หั่น|ก้า|กระป๋อง|ยัก|โธ่|อสังหาริมทรัพย์|ประสิทธิ์|พายุ|กอล์ฟ|จู่|ฉีก|กอ|คล่อง|สบู่|กาง',
    'ความกลัว|โป|อุดม|คอม|ลอบ|มวลชน|โอ้|คุกคาม|แสงสว่าง|อุตส่าห์|เช็ด|หนี้สิน|หยด|หย่า|หมวก|รื้อ|เทป|ศักดิ์ศรี|สดชื่น|เตะ',
    'ลูกศิษย์|เบ|จักรพรรดิ|หึ|วิพากษ์|อัลบั้ม|โรมัน|ฟู|ปุ๋ย|กล้วย|โกะ|จุดอ่อน|ไว้ใจ|จำลอง|อุดมคติ|แสงแดด|วิจิตร|สมทบ|แท็กซี่|นันท์',
    'ลู|ไฮ|ว่าย|สั่งสอน|ค่าเฉลี่ย|ไปรษณีย์|มวล|ตั๋ว|ดัก|ร่องรอย|ป้อน|ใจเย็น|ตอนเช้า|พันธมิตร|เพาะ|ห้องสมุด|ดง|ธรรมศาสตร์|ไต้หวัน|แต่งกาย',
    'ปิ|เทียม|สุรา|พรรณนา|รก|เจ้าภาพ|พาย|งด|กรด|ปลอด|กดดัน|หน้าอก|ปลายทาง|อาสาสมัคร|ล้น|นักลงทุน|สมรรถภาพ|กรัม|เป็ด|ประคอง',
    'หล่น|สุนทร|ลี่|กล|ตรงกลาง|จำพวก|ขืน|แข็งแกร่ง|ดั่ง|เผชิญหน้า|เฉียงเหนือ|มาลัย|ม่าน|ภูมิปัญญา|แผ่ว|ซื่อ|แสบ|อม|เทนนิส|คนขับ',
    'โหน่ง|จอห์น|แคว้น|เยียวยา|หวย|ซิน|ป่าไม้|ภิ|หมุนเวียน|เทียบเท่า|กระโปรง|กลมกลืน|เอาใจ|พระเกียรติ|ปิ้ง|ละลาย|โทรศัพท์มือถือ|บรรเลง|ทรา|มน',
    'กายภาพ|คัมภีร์|นัยน์ตา|ยึดมั่น|เมื่อกี้|เซนติเมตร|โปรตีน|โต้|ปลด|สโมสร|ดึงดูด|เหยียด|หนาแน่น|ถ่านหิน|หันหลัง|แปลกหน้า|รัด|เอ็นดู|พอล|เพื่อนฝูง',
    'ละก็|ชดเชย|นิยาย|พนม|เหม็น|โมฆียะ|ผู้เฒ่า|รับคำ|พก|ระเบียง|ลาด|จดจำ|ซื่อสัตย์|เงินตรา|คิง|ผนวก|พิกัด|เสิร์ฟ|เนื้อสัตว์|แย้ง',
    'ทำนาย|รักษาการ|แหม่ม|อัตโนมัติ|ร่ำรวย|เมืองหลวง|ลี้|เทอม|ฝืน|ช่องว่าง|หรู|วิวัฒนาการ|อุปถัมภ์|ปะทะ|คอนเสิร์ต|ลืมตา|ก้าน|รอคอย|จุดประสงค์|ภาคตะวันออก',
    'ฟังก์ชัน|เฮีย|หนุน|ส่วนกลาง|มงกุฎ|ชนชาติ|ภูมิศาสตร์|เป็นอย่างยิ่ง|มังกร|ได้เปรียบ|กบ|หาความ|ล้านนา|ลำตัว|ปริญญาตรี|จีบ|จุ|ปิ่น|ท่อง|แง่มุม',
    'เร้า|คี|ข้อเสนอแนะ|ด้า|ที่ทาง|แก่ตัว|อยู่รอด|พญา|จ้างงาน|ชะมัด|พรรณ|ตุลาการ|ชี้ขาด|ปีน|พึมพำ|โฉม|ภาคภูมิใจ|ศุกร์|ผู้ส่งออก|เร่งรัด',
    'หมาก|เปี่ยม|ฟังดู|กลาโหม|เอ๊ะ|ผลลัพธ์|สิ่งมีชีวิต|คะแนนเสียง|นักโทษ|ภาชนะ|เร่งด่วน|แช่|เวอร์|ลอก|อ่าง|ฎีกา|ปทุม|ส่งมอบ|ออกซิเจน|พระองค์เจ้า',
    'มาร์ค|ชาน|สู|ครก|มาเรียน|สารภาพ|บรรทัด|รถเมล์|นึกคิด|กง|ดีเอ็นเอ|ผู้กำกับ|แผง|พื้นดิน|เข้มงวด|รด|รูปถ่าย|ชาญ|เสร็จสิ้น|มะพร้าว',
    'สึ|สฤษดิ์|พรหม|เฉพาะตัว|เด็ด|สูด|สัมปทาน|สวัสดิ์|ลูบ|ทุกสิ่งทุกอย่าง|สมัครใจ|หนักแน่น|กลยุทธ์|วิตกกังวล|ข้อดี|เปล่ง|ขนมปัง|ว่างงาน|รัตนโกสินทร์|ราชสำนัก',
    'ชดใช้|แอม|สมมุติ|ไมเคิล|ราง|ปราบ|โชติ|เนอร์|กรีก|หลอกลวง|เดินหน้า|บิต|แวดล้อม|การเรียนการสอน|บัง|ซุ|ความเคลื่อนไหว|มหัศจรรย์|สห|ทางหลวง',
    'ราด|ส่วนผสม|เล็บ|บังคับบัญชา|ต้าน|เชื้อชาติ|นุ่ง|คูณ|บริวาร|เอน|คืบหน้า|ว่างเปล่า|พินิจ|สนธิสัญญา|กระชับ|โช|นิดหนึ่ง|คุณนาย|มู|เด่นชัด',
    'งวด|น้ำลาย|เครื่องยนต์|ขัดขวาง|ข้างบน|ชาตินิยม|โศก|ผอม|เชี่ยวชาญ|สร|กลอน|คู่แข่ง|ซับ|แฮะ|ทีหลัง|บ่า|เกาหลีใต้|แจ่มใส|หัวหน้าพรรค|นามธรรม',
    'พรม|จิตรกรรม|คนตาย|เชื้อสาย|ขมวด|เรื่องสั้น|คลาสสิก|หวง|พารา|สุพรรณ|ออนไลน์|กดขี่|สหประชาชาติ|เอกราช|เลียนแบบ|สิทธิบัตร|ลงตัว|แปรรูป|ไตรมาส|ษา',
    'บ่อน|ล่อ|บุคลิก|เบียร์|ดม|หลักทรัพย์|วูบ|ห้องเรียน|ถั่ว|ประทาน|ถ่ายภาพ|ลังเล|ปลูกฝัง|ผู้ซื้อ|หนวด|สันนิษฐาน|ปลื้ม|อุด|ลื้อ|ทู',
    'บทเรียน|ธา|พฤติการณ์|สมา|กรรณ|กรรมาชีพ|การ์ด|ขอน|ดาวเคราะห์|มาร|เจดีย์|นาถ|ฮ่อง|หย่อน|ซุป|อิสรภาพ|มหาสมุทร|สัมพันธภาพ|ดีไซน์|สะกด',
    'นิติ|เตา|รุม|ดูถูก|พระจันทร์|เจาะจง|ยากลำบาก|ดวงดาว|บรรทุก|ชิ้นส่วน|วัฒนา|ก๋วยเตี๋ยว|หมอน|ห้อย|ภูเก็ต|เสียสละ|พ่อคุณ|เอ้า|หยาบ|จุดเริ่มต้น',
    'นาก|ฟอร์ม|รุก|ทรุด|แพ|ชื่นชอบ|ถกเถียง|ฟ้องร้อง|ชนะเลิศ|ตีน|สันสกฤต|นั้นแหละ|ถล่ม|สรรหา|ทางเข้า|ลุ่ม|พราหมณ์|เนียน|ทุบ|พบปะ',
    'โยง|กระบวน|ตำ|กลีบ|อ๋อ|กระมัง|ละเลย|พ่น|อิสลาม|สูญหาย|อนุบาล|พ่อขุน|หวน|โว้ย|ปั่น|รัศมี|ทำมาหากิน|ชาติพันธุ์|สะดุด|ดิ่ง',
    'บรม|แพร|สำเร็จรูป|พระกรุณา|ขาดทุน|จงรักภักดี|ทุ่มเท|ชะตา|ไม่แพ้|ช่อ|ไพเราะ|ดิ้น|นิพนธ์|คราบ|โวยวาย|เอดส์|กระเทือน|ระนาบ|รับมือ|เวียง',
    'พันล้าน|รัตน|จ้า|ภาวนา|จุดหมาย|สินะ|สวัส|เทพเจ้า|นัน|ศิลา|นุ่มนวล|สรรพ|อาบ|สิว|สาหัส|เท่านี้|สินทรัพย์|เฒ่า|อธิการบดี|พัท',
    'รวบ|แกรม|ไข|ทายาท|แค่นั้น|หวัด|สหาย|ปัญญาชน|กระเพาะ|บิด|ฟิล์ม|ตายตัว|ซัน|คุ้มค่า|วารสาร|ไบ|ปิโตรเลียม|สถาปนา|ผลเสีย|ขี้เกียจ',
    'ขั้ว|ซัส|เคยชิน|คู|บดี|กระชาก|เพียร|เพดาน|สาด|เซียน|เงินสด|ผลสำเร็จ|ปีศาจ|เซ็ง|หากิน|ต้นแบบ|นาค|เครื่องใช้|เก๋|ผู้ร้าย',
    'กระสุน|รองนายกรัฐมนตรี|ผู้แสดง|กรรมสิทธิ์|พลเอก|หุ้ม|พันธุกรรม|แต่งหน้า|กติกา|ธิดา|ลำคอ|เลือน|กวาง|หด|สัง|เกษตรและสหกรณ์|ณี|ชีวะ|แวมไพร์|ไกร',
    'เลน|เปรี้ยว|พิษณุโลก|อุทิศ|แวบ|ผุด|มิด|วดี|ซึ้ง|ผลตอบแทน|โน้ม|ทยอย|มัธยมศึกษา|โอบ|ต่อม|ท่วม|แบน|ดื้อ|อุทาน|สงขลา',
    'ไวน์|ยานพาหนะ|บูรณาการ|ต่ำสุด|พุทธศักราช|เมนู|อิสราเอล|ประหลาดใจ|พุ่ม|ฮัน|เสวย|ลีโอ|เยอะแยะ|เช|ระยะห่าง|สันติภาพ|กิโลกรัม|ข้าวโพด|ฉุด|สกัด',
    'รสนิยม|ผู้ถือหุ้น|ฆ่าตัวตาย|ชัดแจ้ง|เปอร์|แอฟริกา|บริบูรณ์|ขอบใจ|ปกปิด|ลีก|เดือด|ประชามติ|พื้นผิว|กลวิธี|ซักถาม|จากนี้|อัต|มานะ|โพ|ชินวัตร',
    'ชาวต่างชาติ|ภาคอีสาน|ทิพ|กรมพระยา|สายอากาศ|ขาน|ถึงที่|ถู|ขาเข้า|ใบขนสินค้า|ตรงไปตรงมา|เค้ก|นิวยอร์ก|เบื้องหน้า|หมึก|ชักชวน|โส|ริเริ่ม|ติดใจ|นิก',
    'จ้องมอง|ถ้วน|ม้วน|กีดกัน|ฟาก|ชลประทาน|แท่ง|สื่อสารมวลชน|อุทกภัย|คล้ำ|ปฏิสัมพันธ์|หรูหรา|โห|ปัน|จริงใจ|แค|ร่าเริง|แตกแยก|ประณีต|สังหาร',
    'พัฒน์|เจตนารมณ์|ปัจเจกบุคคล|นิว|ประชาคม|ชอบใจ|ดอย|ต้นฉบับ|คิดมาก|อัตราส่วน|โต้แย้ง|เกวียน|ย่ะ|ลือ|ธูป|หยาง|บึง|พริกไทย|รุ|สวดมนต์',
    'บวม|เกร็ง|สายลม|คว่ำ|โคลน|นันทนาการ|นิกาย|ไมเนอร์|ขว้าง|กาลเวลา|ปานกลาง|เหรียญทอง|บอร์ด|คริส|มโน|ค่าเสียหาย|ลุย|นักเตะ|รู้อยู่|หมี',
    'สลัด|เส|สูญ|ของเล่น|เจ้าหล่อน|ราชโองการ|ผู้บัญชาการ|สังคีต|สปา|ปัท|นายทหาร|เคมี|ลายมือชื่อ|ใย|โขน|นักข่าว|หลาก|ผู้รับผิดชอบ|สับ|เย็บ',
    'ฟาด|ก็อด|เรื้อรัง|ฟื้นตัว|ลิตร|พลัน|เข็น|คู่หมั้น|ตาบอด|ซ่อมแซม|ซอก|กาม|ผัน|น้ำยา|ค้ำประกัน|โกง|ปัจเจก|คาบ|ตามลำพัง|คณิตศาสตร์',
    'พฤหัสบดี|จ๋า|ไพศาล|บังเกิด|การบริการ|พี่เลี้ยง|แจ้งความ|หมู่เกาะ|อู|ทวน|หน้าผาก|แห่|แผนงาน|แน่ชัด|ม่า|ตุ|เพอร์|หาเงิน|ถนอม|ค้าประเวณี',
    'กำกับดูแล|ฮือ|ก้าวร้าว|ตึง|โปร่งใส|สืบเนื่อง|ด้วง|สงฆ์|ญาณ|ทั่วถึง|ตื้น|หว่า|ลวง|ฝ่ามือ|ริย|บาล|แยกแยะ|โปร่ง|สะบัด|สี่เหลี่ยม',
    'วิตก|เยอรมนี|ปรัมปรา|เอาเรื่อง|พิม|ผง|พาด|น่าเสียดาย|ดูงาน|ผู้ดี|ควง|เปรียบเสมือน|โทน|เสี่ย|เงินเฟ้อ|หาร|นามสกุล|กลั้น|ปวดหัว|นิช',
    'โรงไฟฟ้า|อาณาเขต|ร้องทุกข์|มด|อ้น|ชานุ|ส้อม|ต่อย|ฟีลด์|มิก|เกะ|อคติ|โดยสิ้นเชิง|ความเค้น|ง่วง|บัน|พ่ายแพ้|คู่รัก|อุบล|แบบอย่าง',
    'หาเสียง|ธนาคารพาณิชย์|จำนำ|คิม|ขับเคลื่อน|ระบาด|ค้อน|รั้ง|คดีอาญา|ย่น|อง|จิร|ชีวภาพ|ที่ระลึก|ชายหาด|แร่|ไพร่|ดอง|ราบรื่น|ของเก่า',
    'มาตร|ผจญภัย|ของกลาง|แลนด์|เพลิดเพลิน|จิ๊บ|สมมติฐาน|พิง|ซีก|ห้วย|ตอนเย็น|ต้นเหตุ|โพธิสัตว์|ผูกขาด|ดีเซล|ลอด|ลำไส้|วิชัย|ภิกษุ|คำกล่าว',
    'ตู้เย็น|เครื่องดนตรี|ทันใด|บิ|สหภาพ|จำกัดความ|แอ|โจทย์|แก๊ง|คนใช้|หาไม่|งอ|หาเรื่อง|บำเพ็ญ|เจ้าพ่อ|เต้นรำ|ซัด|ประถม|ลายเซ็น|ดำน้ำ',
    'หลอด|แปรเปลี่ยน|โคน|ปริ|กลอง|หมดสิ้น|ธนู|ภาษีเงินได้|แวดวง|แย้ม|แอนด์|แพน|กว้างใหญ่|เบาหวาน|หลี|เสี้ยว|ปริญญาโท|ตราสาร|ประถมศึกษา|เลอร์',
    'บาลี|พยากรณ์|บอกกล่าว|แบบสอบถาม|เตี้ย|สรรพสิ่ง|เบส|พุธ|สุรินทร์|หมอก|ฟุต|นักสืบ|กรรมกร|บอย|โบกมือ|อือ|ครุ่นคิด|กีตาร์|นิติศาสตร์|แถลงข่าว',
    'มหาอำนาจ|น้ำพริก|ลัด|พจน์|พระพุทธรูป|ผ่อง|ราชสีมา|ออมทรัพย์|นักคิด|ภาษาศาสตร์|ปม|โต้ตอบ|เสียเปรียบ|หมัด|เกย์|ปักกิ่ง|ยอดเยี่ยม|วิสามัญ|ดิ้นรน|แขนง',
    'เท่|ป๋า|อู่|ตำหนัก|แน่ะ|แก้ตัว|เรือง|เกษม|ภัทร|โยกย้าย|นิล|อินเดียน|หุ้นส่วน|กำหนดการ|เหลี่ยม|คาดการณ์|สาธารณรัฐ|พอง|เกี่ยวพัน|มานุษยวิทยา',
    'รถไฟฟ้า|ท่าเรือ|ปอ|ไวยากรณ์|รุ้ง|สิ้นเชิง|ฮวง|สรรเสริญ|มันแกว|นายแพทย์|วิถีทาง|กล้าหาญ|ราตรี|กำนัน|เท็จ|ดิส|แม่ค้า|ชั้นใน|โคจร|หัวเมือง',
    'ผู้ขาย|ปูน|วิสัย|เข้าข้าง|ทบ|เลค|ปลอบ|แนะ|หุง|ปากกา|มอญ|ชง|ฝ้า|แตง|ขุ่น|ข้าหลวง|คาร์|แออัด|ข้างเคียง|แม่นยำ',
    'ลุ้น|ลักลอบ|มดลูก|ทาย|บรรณาธิการ|ใช้สอย|จิ้ม|อุดมสมบูรณ์|กู้เงิน|สังขาร|ชนชั้นกลาง|เชียร์|ณุ|ปุ่ม|ไอน้ำ|ไวรัส|โสด|โฮสต์|พักตร์|ห้วง',
    'ตอง|ครอบ|จุน|แล้วด้วย|ที่อยู่อาศัย|หมายเหตุ|เจ้าสาว|ลึกลับ|โตเกียว|อิม|สารคดี|ต้านทาน|ค่อน|ป่านนี้|ศิลป|บุญคุณ|เยื่อ|หนักหนา|พาร์|ปฐม',
    'คลาน|ปฎิ|หวั่น|เมน|บ่งชี้|ยั่ว|เจอร์|วี่|นิร|สรร|แรม|ตอนหลัง|พาน|เคี้ยว|เลขา|ภรณ์|หลงใหล|ยี|คลี่คลาย|น้อยใจ',
    'อึน|ลงทะเบียน|วิหาร|คลินิก|ปลดปล่อย|อ่อนหวาน|โนะ|คำมั่น|จรรยาบรรณ|แฟ้ม|จตุ|ชั่ง|แผ่นดินไหว|ภวา|จ่า|เสนอแนะ|เมื่อย|ซีด|ซิ่น|ซวย',
    'ผา|พ้อง|ค่าที่|เอเชียตะวันออกเฉียงใต้|ลาภ|กบฏ|ฟาร์ม|เคน|ซุ้ม|เส้นตรง|มือสอง|นักรบ|บทเพลง|เสียบ|แบ่งปัน|พึงพอใจ|ช้ำ|ครู่หนึ่ง|เส้นผม|ปล่อยตัว',
    'สัญชาตญาณ|ข้อเสีย|สายการบิน|เล็ง|กะทันหัน|อั๊ว|ที่พึ่ง|กรีด|สวิส|หลุดพ้น|วอน|เจ้าอยู่หัว|พวง|กรอก|สนั่น|นายอำเภอ|โลภ|เรือนจำ|ฟา|เป็นอันมาก',
    'พงศาวดาร|ล็อค|กระเทียม|คึกคัก|ฟี|อำพราง|ปล้น|เทือกเขา|บุช|อุปทาน|มาน|เอล|แปะ|ข้าวสาร|เครื่องแบบ|ลูกเสือ|โขง|ขะ|เลอ|มิตรภาพ',
    'บาย|ข้าวต้ม|ติก|ความชอบ|ต่อจากนั้น|นิจ|พระราชดำริ|มอเตอร์ไซค์|รับแขก|นุช|สลับซับซ้อน|แพร่ง|เยาะ|เค็ม|หวั่นไหว|พรรคพวก|โน้มน้าว|หอพัก|พาหนะ|ชะ',
    'กองกำลัง|ทุ่มตลาด|กราฟ|เอกภาพ|ธร|เปรม|เชื้อโรค|ไน|ของดี|ฝึกหัด|พรรษา|บูรพา|พรมแดน|แท่น|แสงไฟ|แม|โคม|คาง|โซฟา|เหนียว',
    'โรแมนติก|จิ๋ว|นิคม|ทึ่ง|เกื้อ|เนตร|ยับยั้ง|คนไร้ความสามารถ|มุ่งหน้า|นิวเคลียร์|ประนอม|ภักดี|บ้านเกิด|หมั่น|อิฐ|เคลือบ|ข้อยกเว้น|เงินฝาก|นีย์|เอย',
    'กระตือรือร้น|นวัตกรรม|ดาวฤกษ์|ยัด|ยอ|หิมะ|เฉือน|ทอดพระเนตร|เกา|งี้|เต็มที|ชก|ตัณหา|โปรล็อก|ละออง|นายพล|เฮา|ระฆัง|หวาดกลัว|เส้นเลือด',
    'มอบอำนาจ|วิล|โดด|มูลเหตุ|เวทนา|ขอตัว|นักกฎหมาย|ดัด|กลั่นกรอง|เบื่อหน่าย|ฉลาก|ออกกำลัง|เป็นได้|อ้อย|ใจกลาง|เกื้อกูล|เนิน|เฟรม|วิกฤตการณ์|ผู้ดูแล',
    'สลัก|ตรึง|อ่าว|มเหสี|สภาพการณ์|เกมส์|บำเหน็จ|ขาดดุล|มะนาว|สถาปนิก|โบก|ถิ่นฐาน|ข้อสัญญา|ทำตา|มุ่งหมาย|เกรด|เอาเปรียบ|ภูมิลำเนา|ลาง|ร้าง',
    'จัดวาง|ตอ|เซ็นทรัล|ชุ่ม|เพคะ|กรรมวาจก|โซ่|ไตร|กตัญญู|เพชรบุรี|สุ่ม|สิง|ผ่อน|อินเทอร์เน็ต|ตั้งตัว|ปี้|สมบูรณาญาสิทธิราชย์|เบี้ย|วิว|ดุสิต',
    'ตื่นตัว|พิธีการ|โดดเดี่ยว|เป็นอันขาด|พยาธิ|ปิดบัง|เสน|กระดาน|ฉวย|ปะปน|ดุจ|กว๊าน|ผลัด|ผู้ค้า|ปริมณฑล|แอลกอฮอล์|แบงก์|พนักงานอัยการ|ถาด|คนขาย',
    'เหลียว|กิโล|จุดยืน|หิ้ว|ฉัตร|คิดค้น|กรมศิลปากร|นัท|ว่าจ้าง|ยีน|นราธิวาส|มอ|น่าน|นัดหมาย|เคราะห์|โด่งดัง|เยาว์|ประภาส|รีด|สังคมศาสตร์',
    'คุณตา|มาร์ก|ตุง|ดาวหาง|จุดเด่น|ภู่|เจ้าคุณ|บางกอก|ลายลักษณ์|แว่ว|คับ|โภชนาการ|เจียง|ศุภ|ประจวบ|แฟรงค์|โถง|ติว|หมวย|ยื่นมือ',
    'พราน|เทศ|เปิ้ล|หงส์|ภาพพจน์|เอ๋ย|ทึบ|เตรียมพร้อม|เกษ|ประชาชาติ|ลัย|ประมุข|อิหร่าน|พระราชพิธี|ข้อสงสัย|ตึงเครียด|ซอ|แอง|ผู้ใหญ่บ้าน|ซาบซึ้ง',
    'วนเวียน|ส่งตัว|วาทกรรม|ทบวง|กิตติ|นักหนา|สอ|ทอดทิ้ง|คีรี|เวน|นิมิต|เซล|เป|ยะลา|ควบ|ลื่น|ดาร์|สุวรรณภูมิ|ถ่ายทำ|เต๋า',
    'สำเนียง|พระภิกษุ|อีกหน่อย|ประจำเดือน|ไพ|ศูนย์การค้า|อสุจิ|ยนต์|เดียร์|ดรุณี|เซีย|มุข|สัญ|โหด|วิปัสสนา|บะ|ข้างมาก|โพธิ์|เทค|เมล์',
    'เตี่ย|ทุกแห่ง|นิพพาน|ฉับพลัน|ชีวิตชีวา|พินัยกรรม|ฤา|กริช|ปลิว|คู่มือ|รัช|บุตรบุญธรรม|เฟ|น้ำปลา|นเรศวร|รายวัน|ปกคลุม|ลุ่มน้ำ|ราชธานี|ไอศกรีม',
    'สมบูรณ์แบบ|วันเวลา|สาบาน|บี้|โรย|ทวิ|พันปี|ง่ายดาย|สำราญ|ขั้นต่ำ|โค่น|เฟอร์นิเจอร์|นั่งเล่น|ทะเลสาบ|เริ่มแรก|เปียโน|ปรีดี|เบ็ด|บด|โซน',
    'ผ่านพ้น|ธีร|วางตัว|หมั่นไส้|ศร|เกี่ยวเนื่อง|คอร์|บราซิล|ตรวจพบ|ค่ำคืน|ที่แท้|กระเด็น|ปัง|ศักดินา|แม่น|ยิน|ทับทิม|งอน|แปรปรวน|ห้างสรรพสินค้า',
    'คลอ|เหี่ยว|บาตร|รม|กระบี่|อุทยาน|โสเภณี|สงครามเย็น|ปาง|เปลือย|ยิว|ยิ้มแย้ม|ดีไซเนอร์|เล่าเรียน|กลับกลาย|ชักจูง|วับ|ละเอียดอ่อน|ตัวเมีย|เฮือก',
    'เอช|หน้าร้าน|ปัตตานี|ทิเบต|วิศวกร|รุกราน|วานนี้|ภาควิชา|เนื้อเรื่อง|รอน|อธิปไตย|วิษณุ|พระราชกำหนด|กอน|ผีเสื้อ|ข้อคิด|แคนาดา|ท่านหญิง|บิ๊ก|ระยอง',
    'ข้อสอบ|นักจิตวิทยา|แจ๊ค|คริ|รัน|เจ้าแม่|มนุษยชาติ|ตัวเดียว|เสื่อมโทรม|พีร์|บรรทัดฐาน|บรรจง|กรรมฐาน|แคร์|ปฏิบัติธรรม|สาธิต|วิดีโอ|เทอร์|สง|ชำรุด',
    'สั่งซื้อ|สลาก|เรส|เดย์|ร่อง|เวชกรรม|ปรีชา|สุสาน|อรุณ|คัพ|จรด|เปลี่ยนใจ|คร่าว|เกต|ฮิต|พยุง|ผับ|วรา|จูง|วาบ',
    'แช|ชื้น|กลางคน|เรียบเรียง|สะกิด|เรียงราย|ขันธ์|รณ|หือ|อวยพร|กระผม|แสงสี|เคท|ลิ้ม|มาลา|กักขัง|เบาะ|เต็มตัว|เพี้ยน|เงือก',
    'ทอน|เฟอร์|ญัตติ|ประชด|พระจุลจอมเกล้าเจ้าอยู่หัว|แต่ทว่า|ริก|กรง|นารี|เบียด|นินทา|เผ็ด|ก๊ก|กลบ|ศศิ|สังเคราะห์|ครา|ให้อภัย|หน้ากาก|รัณ',
    'มนต์|ผ่อนผัน|มัส|พระนางเจ้า|ส่วนภูมิภาค|หลีก|คาถา|สินสมรส|สูงส่ง|นักเลง|หยอด|โคลง|เบียดเบียน|ทุ|กระตุก|บอ|โพรโทคอล|เริง|เป็นลม|แต่อย่างไรก็ตาม',
    'คนรวย|เรีย|ตุ่ม|เกร|ฟิ|ยาสูบ|บทสนทนา|หมัก|ฟรอยด์|ถีบ|อินทร์|มาส|แก๊ส|สเต|เกาหลีเหนือ|ตะกร้า|เคือง|ล็อก|เบี่ยงเบน|ลิขสิทธิ์',
    'เขย่า|อุปการะ|สัญชาติ|โหล|ระบำ|ลูกตา|ระแวง|อัธยาศัย|เอ้อ|รำลึก|จอร์จ|ข่ม|สายน้ำ|อำ|ระเริง|ลู่|เก็บเกี่ยว|บำนาญ|ผู้สอบ|บิดเบือน',
    'โหดร้าย|สมเด็จพระเทพรัตนราชสุดา|ตะกอน|ธรรมราช|กัง|พันธบัตร|ชายา|จับตา|กัก|เบน|ยังชีพ|นลิน|เข้าเฝ้า|พระราชนิพนธ์|จอย|คำร้องขอ|สรา|ทศ|อาหรับ|เลย์',
    'เดน|มาด|ถัก|ดับเพลิง|เหมือง|ตอกย้ำ|อยู่จริง|กฤษณา|ว่ะ|เกียรติยศ|ผันผวน|แพ็ก|เนื้อเยื่อ|ไฟล์|มือขวา|ฝัก|คาดหมาย|ช้อป|ชั่วร้าย|เหม่อ',
    'อัง|ไต่|ข้าวเหนียว|รับปาก|ถอยหลัง|ย้อนหลัง|มะม่วง|ขับขี่|ขาออก|แสงอาทิตย์|รักใคร่|ฆาตกรรม|เป็นรอง|ยอน|หน้าท้อง|ไมตรี|ยุ้ย|ขัดใจ|ดีด|กลั่น',
    'จริงอยู่|จิบ|อริส|วาทศิลป์|เฉพาะหน้า|โหย|แปซิฟิก|กานต์|น้ำหอม|ยังงั้น|โร่|บวร|ณัฐ|หน้าตาเฉย|กระเบื้อง|เครื่องปรุง|เพ่ง|ฐานทัพ|แบ|พระพุทธองค์',
    'ณรงค์|สยามบรมราชกุมารี|ผักตบชวา|หึง|สาป|วงษ์|ส้วม|พะ|แม้น|นักบิน|ยุง|ชาวต่าง|กระทง|ล้อมรอบ|เนย|คลั่ง|วิกลจริต|อมยิ้ม|เถื่อน|อุปนิสัย',
    'จุก|ถือครอง|แจ|ของใช้|เสนาบดี|จิก|เดวิด|หลงเหลือ|กระทะ|ความจริงใจ|กราบทูล|ร่ำ|อัศจรรย์|อุปโภค|หงาย|ฝีเท้า|วิมล|หัตถกรรม|ผู้ปฏิบัติงาน|ที่ราบ',
    'ผู้เรียน|ลงชื่อ|ดอกบัว|สมหวัง|ตังค์|หนอน|อึดใจ|กระต่าย|พิธีกร|ตราบใด|มนตรี|ถือโอกาส|จิตร|ผลิ|ถึงกัน|ตัวเมือง|อธิษฐาน|ประปา|ประกาศนียบัตร|ตกค้าง',
    'สวมใส่|อภิ|มายา|ฐานข้อมูล|นาวา|คบหา|กะพริบ|คิก|มีน|ก็แล้วแต่|ดีเด่น|ผักชี|ย้อม|เลื่อมใส|ใฝ่ฝัน|อาทร|เชื่อฟัง|แปรง|ผู้เล่น|พัทธ',
    'อ๊ะ|น้ำตก|ล้มละลาย|ล่วง|จับใจ|ถ้าหากว่า|ทีท่า|ฝึกซ้อม|กาก|รถบรรทุก|ขับไล่|พริบ|ตีบ|นภา|ตะลึง|พระบาท|วิทยากร|จำนอง|ขัดข้อง|แทรกซ้อน',
    'เถ้าแก่|กระไร|เดนซ์|สุราษฎร์|เก็ต|ตำรับ|เย้ย|พัช|ปรองดอง|เบรก|ไทยรักไทย|เคลียร์|อวน|หลั่ง|แซง|คืบ|ตัวดี|วิศวกรรม|อิรัก|วาสนา',
    'โมด|ปากีสถาน|โพรง|พยางค์|เหยี่ยว|แพ่ง|ชะตากรรม|สูท|หล้า|เยน|เพิ่มพูน|ไกด์|เห็ด|ปริยาย|สายพันธุ์|ป้อง|ชาวไร่|ออฟ|ถ่าน|โสม',
    'ลำน้ำ|แยกย้าย|แขวง|ผึ้ง|เต้านม|ปรุงแต่ง|ตระหนก|เม็กซิโก|อมตะ|ข้ออ้าง|เสด็จพระราชดำเนิน|ปาฐกถา|ภาพเขียน|หยก|เอื้ออำนวย|สะใจ|นึ่ง|ชันสูตร|ซาร์|อินทรีย์',
    'ดะ|จิตรกร|ฤกษ์|ธาร|หมอดู|ไล่ออก|แด่|ปุ๊บ|หม่อมฉัน|ละทิ้ง|บล็อก|ประสิทธิ|สัตว์เลี้ยง|ค่าปรับ|กรมหลวง|บ่าว|ประกวดราคา|หีบ|ทรรศนะ|ฉายา',
    'ปิดปาก|กรณ์|ปราการ|พระเจ้าแผ่นดิน|ติดขัด|กล่าวอ้าง|ขนบธรรมเนียม|ขุนแผน|สิ่งพิมพ์|กระด้าง|ต้นทาง|ระเหย|สายเลือด|หยวน|เกลียว|กระแสไฟฟ้า|นำพา|เชลซี|ยูโร|ตกงาน',
    'กัลยา|ช่างภาพ|สรรพคุณ|ฌิ|ย่อหน้า|บูรณะ|แซว|ทั้งคน|จัดเตรียม|ฝึกงาน|ส่วนเกี่ยวข้อง|เลี้ยงชีพ|ฟาง|กอร์|น้ำดื่ม|คาดคิด|พิพาท|ไมล์|ของกิน|เชง',
    'ลิฟท์|นำทาง|ถี่|ลองดู|เซ็นเตอร์|แข้ง|กะโหลก|นายหน้า|โลง|รินทร์|ยี่|ช่องคลอด|หัตถ์|แรงกดดัน|ปลอบใจ|กัปตัน|แห้งแล้ง|นิ่ม|ควัก|สงกรานต์',
    'ลัง|ท่าอากาศยาน|เบิกบาน|ศิลปวัฒนธรรม|สู้รบ|ยีราฟ|มอน|วงดนตรี|แฮม|ตู|เมิน|สลด|จับคู่|บริ|คล้อง|ปณิศ|หลวม|บุกรุก|วิบาก|โอลิมปิก',
    'คลุก|ไอเดีย|หมอบ|พิศ|ตัวกลาง|บ่ง|ทอม|เซนต์|เจี๊ยบ|ซน|ตัวบท|เผ่าพันธุ์|กระหาย|ฝ่ายซ้าย|วัส|เหลื่อม|เผอิญ|ขันที|ขวับ|ชาวเขา',
    'ก้อนหิน|กระจายเสียง|ฉันท์|เช่าซื้อ|รู้เห็น|ปร|ศอก|นิคมอุตสาหกรรม|ขม|บำรุงรักษา|ผู้เกี่ยวข้อง|มุ่งหวัง|เวล|จำเริญ|นักปราชญ์|ล้อเลียน|แกว่ง|ถ่วง|อาเจียน|ไถ',
    'หยิบยก|อับอาย|สาหร่าย|ล้า|สุดา|จารย์|โลกาภิวัตน์|จิล|สึก|จุ๋ม|ติน|แก้แค้น|อำนวยการ|กิม|บอบบาง|อัมพาต|อับ|โรจน์|เนส|อุทยานแห่งชาติ',
    'ชุบ|แจกจ่าย|รีสอร์ท|ใจหาย|ตี๋|นู|ถึงแก่กรรม|ดินสอ|รูปลักษณ์|เข็มขัด|ตลาดหลักทรัพย์|เหลว|โรคจิต|ซ่อนเร้น|สิต|สำ|น้ำมันดิบ|ยึดครอง|อารมณ์ขัน|ถอดถอน',
    'หนาม|อนันต์|คลิป|กระถาง|เบอ|โทสะ|นอกนั้น|คิน|ด่าง|ทิวทัศน์|พิลึก|บาทหลวง|เติ้ง|ปราศรัย|พราก|ราษฎร์|แสวง|วุ่น|ว่าว|เทว',
    'แว่นตา|ท้อ|งัน|หินอ่อน|แป๊บ|ขบขัน|แกร่ง|เที่ยวบิน|สั่งสม|เฉพาะกิจ|บ้านนอก|สะใภ้|ออกอากาศ|ปาด|ลายมือ|นางฟ้า|ด้วยซ้ำไป|ม่อน|สาคร|ป่น',
    'โชคร้าย|เชีย|สตาร์|นันท|จาม|เขียด|แหวก|ตวาด|แบคทีเรีย|แย่งชิง|เฟค|รังแก|ตราบ|เสื่อ|อุดร|เสื่อมเสีย|หนักใจ|ออกปาก|รูปภาพ|คอก',
    'พาล|ผู้ชนะ|พีร|เทศน์|จระเข้|แหย่|กุนซือ|อรหันต์|อ่อนไหว|ออฟฟิศ|อิตาเลียน|ทำแท้ง|กระบะ|ฟอก|พราว|ธาม|ปศุสัตว์|กระจุก|กองทัพบก|วก',
    'คล่องแคล่ว|ใจเด็ด|เทรนด์|ธนา|ปฏิ|เปลือง|งอก|คลาดเคลื่อน|รับประกัน|เวิลด์|กิ่งไม้|อาหม|ชาลี|ยั้ง|รูปปั้น|กำชับ|ลวด|บ่ม|กราบบังคมทูล|โอะ',
    'กระท่อม|เทน|ยำ|รอบรู้|อาชีวศึกษา|กันแดด|ห้าว|แมง|กล่าวโทษ|วลี|พอเหมาะ|เจ้าชู้|โรคศิลปะ|ยูไนเต็ด|ปริศนา|ตระเวน|มาตราส่วน|งอกงาม|เกด|เครื่องหมายการค้า',
    'รายรับ|บาส|โตะ|พระบรมราชินีนาถ|ซุก|เซ่|ใบรับรอง|วีรบุรุษ|พระเจ้าอยู่หัว|แฮป|เจียม|อียิปต์|นาร์|มหรสพ|ขงจื๊อ|พจนานุกรม|คอนโด|หลิว|คนกลาง|ภูมิหลัง',
    'โค้ช|พหล|แนน|กระหม่อม|ดวงใจ|ฮินดู|โจว|แกะสลัก|เนื้อความ|ภูมิคุ้มกัน|พัส|ปราย|เอ็กซ์|บัติ|เมอร์|ยุทธ์|สิ่งก่อสร้าง|ไค|ล้วง|สุขภาพจิต',
    'ล่มสลาย|อัพ|น้อม|ใจร้าย|อุบัติ|คนต่างชาติ|โชย|เย|ทารุณ|คล่องตัว|สตูล|แบบฉบับ|โคตร|ชุม|แอ่ง|เท่าทัน|แนวร่วม|เลเซอร์|แจ๋ว|มุง',
    'โถ|มีหน้า|ส้น|กระทู้ถาม|เอะอะ|จับจ้อง|ข้อบกพร่อง|ค้าน|ถม|เดวิล|เยือกเย็น|ถอนตัว|ธนบัตร|ชะโงก|เสนา|พอควร|ป๊า|เหน็ดเหนื่อย|ท้า|มิ่ง',
    'มลรัฐ|หาญ|บัลลังก์|เพียงไร|ใฝ่|เมล|จันทน์|อุบาย|สะท้าน|ข่า|ปราโมช|ปีการศึกษา|ทิน|กล่อม|ลำธาร|ลุกลาม|แม่ทัพ|การต่างประเทศ|บทสรุป|ข้องใจ',
    'เซนส์|ผิวพรรณ|ทวง|บิล|หลุยส์|ภัตตาคาร|สารวัตร|ผิวน้ำ|ตอก|อกหัก|ชันสูตรพลิกศพ|สรรพนาม|เอาอย่าง|ติง|แอ๊น|ขรึม|เลส|ชีพจร|ไม่สู้|โรคมะเร็ง',
    'กายส์|อัส|ยิ่งกว่านั้น|ลูกเรือ|ประณาม|ซิตี้|ภัยพิบัติ|พระตำหนัก|ลิ่ว|จวน|ช็อป|หนำซ้ำ|ผละ|สยอง|ลวก|มิ้ม|นิวซีแลนด์|เลียบ|ธุรกรรม|ษี',
    'ไข้หวัด|เลนส์|หวด|จร|ฝิ่น|ภูฏาน|ดิว|ความกดดัน|ลำปาง|ปณิธาน|เต็นท์|หดหู่|มุ|ย่ำ|กัส|เพ็ญ|อุ๊ย|ตะวันออกกลาง|ยาเสพย์ติด|หม่ำ',
    'เจียระไน|ความมั่งคั่ง|อนุญาโตตุลาการ|ต้องโทษ|กิ๊ก|สะเทือนใจ|จ่อ|พร้อมใจ|ประกบ|เวท|ถดถอย|ฮึ|ปาร์ตี้|เท่าตัว|เหวี่ยง|กลิ้ง|ออกแรง|รื่นเริง|อี้|พิณ',
    'กำเริบ|เหลา|สะเทือน|เลียน|พระคุณ|วอชิงตัน|เอื้อเฟื้อ|ไตร่ตรอง|หลิน|ให้สัตยาบัน|บุกเบิก|ย้อย|นร|ครองราชย์|สาง|เฮง|โตร|เขตแดน|พรวด|ปลีก',
    'เสี่ยว|หลี่|พุด|ยวน|แจง|เมรุ|รดน้ำ|เชย|วัล|ฮอง|วาว|เคาน์เตอร์|ถา|ไช|สามเหลี่ยม|ออร์|ศัลยกรรม|ปราชญ์|เอิง|อื้อ',
    'หรี่|เมี่ยน|ศิลปกรรม|ประหนึ่ง|สิงโต|ข้อเขียน|เมื่อนั้น|ข้อควร|แซ่|ปฏิทิน|ฮง|ขนลุก|สหพันธ์|ไพร|พิน|ลีน|ทนาย|ตรัง|กุมาร|กฎอัยการศึก',
    'พุง|ค่าตัว|พูล|ข้อห้าม|อิริยาบถ|จื้อ|เอ๋|สุภาพสตรี|ขิง|เกษียณอายุ|ปุ|แยะ|ถือกำเนิด|ฝาผนัง|ปักษ์|สะอื้น|ส่อ|การ์|รัชสมัย|ผู้สอน',
    'กูล|ไพบูลย์|เกษียณ|โบราณสถาน|ผ้าใบ|สวรรคต|ขูดรีด|ค่าแรง|รีบร้อน|สังเกตการณ์|ปิดกั้น|ต้อ|คลินตัน|มิส|แฝด|แบนด์|เกล|ก็เถอะ|ฟุ่มเฟือย|โหม',
    'ผื่น|เยี่ยง|บุคคลธรรมดา|เจือ|ราชบุรี|ถ้อย|หง|ฉ่ำ|ข้น|ขมขื่น|แอด|ขจร|แมค|สาวก|ทัต|ของเหลว|เทิด|สะดุดตา|กระจัด|สุขุม',
    'ปี่|น้ำผึ้ง|พลิ้ว|รัว|เฉียบ|ลพบุรี|สะพาย|ไอซี|มึน|หวาย|ระยับ|เซ็กซี่|พง|คลี่|คาว|ไฮโซ|ตกทอด|บลู|ก้อย|หากว่า',
    'วัจน|เจมส์|เฉียง|เอม|สมจริง|อาณา|เนีย|มาศ|แจ่ม|เว้ย|พันธะ|พำนัก|การกีฬา|โป๊|ปั่นป่วน|วิทวัส|ดูก่อน|ปอง|อัคร|แถลงการณ์',
    'รำพึง|บะหมี่|โรเบิร์ต|ฉีดยา|หัวค่ำ|เรื่อ|ยืดยาว|เพียบ|งุนงง|สะโพก|ลังกา|ภิรมย์|ฉี่|สมัชชา|ชุษณะ|สนม|สังข์|ดึกดำบรรพ์|รู้ทัน|ผนึก',
    'ประชัน|ตร|ซูเปอร์|ยังงี้|ขง|ฟุ้งซ่าน|แคว|แกตต์|ไทร|ออกฤทธิ์|ตะเกียง|ล่าม|นิวยอร์ค|ล้าหลัง|ครึ้ม|ซ้ำซาก|ช้านาน|หอก|วัคซีน|ชั่วขณะ',
    'ด้าม|กรรมวิธี|ด็อก|ฉวี|ทัย|ซีน|ยม|ดูซิ|กึ่งหนึ่ง|ผิง|วัต|วิสัยทัศน์|เข็ด|คล้อยตาม|รัมย์|ขัดขืน|แห|ตัวเอก|อากาศยาน|ลดหย่อน',
    'รูด|กมล|หยาด|ด้าย|ละเว้น|ถก|เข้าท่า|ละอาย|รีน|เมธาวี|สัจธรรม|ไดโนเสาร์|หยิ่ง|ภีม|อู้|ตลิ่ง|เกลียดชัง|เขี่ย|หม่อมเจ้า|พราย',
    'เมืองขึ้น|ปวดท้อง|ชำเลือง|เถลิง|เปราะ|นครินทร์|โคก|นูน|ไฉน|เพลา|คาส|หวี|มหกรรม|เจ้าบ่าว|คาย|ชิว|กาพย์|งดเว้น|คนเสมือนไร้ความสามารถ|เล่นงาน',
    'ต่างแดน|หย่าร้าง|แผลเป็น|โณ|เหลือเชื่อ|เรย์|รถจักรยานยนต์|คาดคะเน|ดก|ยากเย็น|ใจคอ|เส้นใย|ทะเลทราย|ฟืน|มันดี|นัต|ฟังได้|ไพ่|ส่วย|เมธี',
    'องครักษ์|มหภาค|คาม|ลิส|ริส|อ่าวไทย|ไม่เช่นนั้น|โป้ง|ไห|ขอม|ประมาณการ|ฮัม|ปอก|มหิดล|ขั้นต้น|หยี|ตัง|ซึมซับ|ศักราช|ทั้งมวล',
    'เล็งเห็น|มือหนึ่ง|ดาวศุกร์|เทือก|เศรษฐ|ตัดบท|เฉียด|ใต้น้ำ|กำนัล|จารีต|ทย|เสนีย์|อุทัย|พระมหากรุณาธิคุณ|ปิย|เส้นขนาน|พ่าย|วิช|ปรอท|สังคมวิทยา',
    'สหภาพแรงงาน|ราชบุตร|บัญชา|มุ้ง|ร่าย|ตะไคร้|เอาการ|ซ้ำซ้อน|คราง|โยม|ก็ช่าง|ฮัล|จิตแพทย์|แพะ|ลูกปัด|พิสดาร|เพรา|คริสเตียน|วิวาท|สนามหลวง',
    'หม่อมราชวงศ์|ลิขิต|ขั้นสูง|อัญมณี|เกราะ|แอดเดรส|ตะเกียบ|ราบเรียบ|ฟอ|ฮุน|ร่อน|เดียงสา|แน่วแน่|ระลอก|ความภูมิใจ|เครื่องแต่งกาย|แป้น|เสาะ|สิ้นเปลือง|ถูกกระทำ',
    'เปลี่ยว|ข้าวเปลือก|ฟอร์ด|สกล|กังวาน|ข่าวลือ|เจ้าอาวาส|ซุง|โอรส|ปลง|ลอน|สัมฤทธิ์|ก๊อก|ตวัด|กระสอบ|อาร์ต|ควาน|วู้ด|ห้วน|เกลี้ยง',
    'หุ่นยนต์|อนุสาวรีย์|แฮ|มั่ว|ภูริ|แชร์|นาฏศิลป์|จินดา|โปรย|พฤ|ธัญ|สำแดง|สัจจะ|ผันแปร|สรัท|เยี่ยมเยียน|ปี่พาทย์|พยัญชนะ|กะปิ|ข้อโต้แย้ง',
    'ชมเชย|คราม|เปลือกตา|จิง|นิเทศศาสตร์|หลั่งไหล|จักรี|วิสาหกิจ|ดุลพินิจ|ปีเตอร์|นิเวศ|ประดิษฐาน|สังกะสี|แท้ที่จริง|นิ่งเงียบ|ทันควัน|ไสยศาสตร์|ขอทาน|พรสวรรค์|คริสต์มาส',
    'เนื้อตัว|วุธ|เหมืองแร่|เก้|ตง|ท้องถนน|โสต|นิค|ละแวก|ฟิต|พวงมาลัย|กาญจน์|เหาะ|ลิม|ผุ|หยั่ง|กระทิง|สวีเดน|เณร|เฮ้'
  ].join('|');
  // @@WORDS-END

  /* ------------------------------------------------------------------ *
   * 5. Normalisation
   * ------------------------------------------------------------------ */

  function normalize(word) {
    var s = word;

    // แก้ลำดับการพิมพ์ที่พบบ่อย: เ+เ -> แ, ํ+า -> ำ, วรรณยุกต์ก่อนสระบน
    s = s.replace(/เเ/g, 'แ');
    s = s.replace(/ํ([่-๋]?)า/g, '$1ำ');
    s = s.replace(/([่-๋])([ัิ-ื็])/g, '$2$1');

    s = s.replace(/([ก-ฮ]?)ฤกษ์/g, function (m, c) { return c === 'พ' ? m : c + 'เริก'; }); // ฤกษ์ = เริก (แต่ พฤกษ์)

    // -ริย์ -> ร เป็นตัวสะกด (ปาฏิหาริย์ = ปา-ติ-หาน, กษัตริย์ = กะ-สัด)
    s = s.replace(/([ก-ฮ])ิย์/g, '$1');

    // ทัณฑฆาต (การันต์): ตัวที่มี ์ ไม่ออกเสียง (รวมสระ ิ/ุ ที่ติดมา เช่น สิทธิ์ พันธุ์)
    s = s.replace(/([ก-ฮ])?([ก-ฮ])[ิุ]?์/g,
      function (m, prev, dead, offset, str) {
        if (prev) {
          // ทร์ ตร์ ที่ตัวหน้าไม่มีสระของตัวเอง -> เงียบทั้งคู่ (จันทร์ ศาสตร์ ภาพยนตร์)
          // แต่ อ/ว/ย ที่ทำหน้าที่เป็นสระไม่นับ (เบอร์ ทัวร์ เชียร์)
          if (dead === 'ร' && 'อวย'.indexOf(prev) < 0 && isCons(str.charAt(offset - 1))) return '';
          // ตัวหน้าที่ตามหลังตัวสะกดของสระ ั/็ อยู่แล้วก็ไม่ออกเสียงด้วย (จันทน์ ลักษณ์)
          // ต่างจาก รถยนต์ อารมณ์ พยากรณ์ ที่ตัวหน้าเป็นตัวสะกดของพยางค์เอง
          if (/[ก-ฬฮ]/.test(str.charAt(offset - 1)) && 'อวย'.indexOf(str.charAt(offset - 1)) < 0 &&
              /[ั็]/.test(str.charAt(offset - 2))) return '';
          return prev;
        }
        return '';
      });

    s = s.replace(/ฺ/g, '');            // พินทุ
    s = s.replace(/๎/g, '');            // ยามักการ

    // ฤ ฦ: หลัง ก ต ท ป อ่านควบ ริ (อังกฤษ ทฤษฎี), หลัง พ ควบ รึ (พฤษภาคม),
    // หลังพยัญชนะอื่นเป็นพยางค์ รึ แยก (นฤมล คฤหาสน์), ต้นคำอ่าน รึ (ฤดู)
    s = s.replace(/([ก-ฮ]?)ฤ(ๅ?)/g, function (m, c, lk, offset, str) {
      if (lk) return c + 'รือ';
      if (!c) return 'รึ';
      if ('กตทป'.indexOf(c) >= 0) return c + 'ฤิ';
      if (c === 'พ') return c + 'ฤึ';
      // กลางคำ ตัวหน้าอาจเป็นตัวสะกดของพยางค์ก่อน (ดาวฤกษ์ กดฤทธิ์) -> ให้ขั้นตัดพยางค์ตัดสินเอง
      return c + (offset === 0 ? 'ะรึ' : 'รึ');
    });
    s = s.replace(/ฦๅ/g, 'ลือ').replace(/ฦ/g, 'ลึ');

    return s;
  }

  /* ------------------------------------------------------------------ *
   * 6. Syllable search
   * ------------------------------------------------------------------ */

  // สระที่ถือเป็น "คำเป็น" เสมอ แม้ไม่มีตัวสะกด
  var LIVE_VOWELS = {};
  ['am', 'ai', 'ao', 'io', 'ui', 'oi', 'eo', 'aeo', 'iao', 'uai', 'ueai', 'oei']
    .forEach(function (v) { LIVE_VOWELS[v] = true; });

  function makeSyllable(ini, vowel, isLong, finalChar, mark, forcedClass) {
    var sound, cls;

    if (ini.length === 2 && CLUSTER[ini]) {
      sound = CLUSTER[ini];
      cls = clusterClass(ini);
    } else {
      sound = INIT[ini.charAt(0)] !== undefined ? INIT[ini.charAt(0)] : ini.charAt(0);
      cls = CLASS[ini.charAt(0)] || 'low';
    }
    if (forcedClass) cls = forcedClass;

    var finSound = finalChar ? (FIN[finalChar] || '') : '';
    var v = vowel;

    // ตัวสะกด ว / ย หลังสระ -> กลายเป็นส่วนหนึ่งของสระประสม
    if (finSound === 'o') { v = v + 'o'; finSound = ''; }
    if (finSound === 'y') { v = v + 'i'; finSound = ''; }

    var dead;
    if (finSound) {
      dead = (finSound === 'k' || finSound === 't' || finSound === 'p');
    } else if (LIVE_VOWELS[v]) {
      dead = false;               // สระประสม/สระที่ลงท้ายเสียงก้อง = คำเป็น
    } else {
      dead = !isLong;             // สระสั้นไม่มีตัวสะกด = คำตาย
    }

    var tone = toneOf(cls, mark, dead, isLong);
    return { r: sound + v + finSound, t: tone, cls: cls };
  }

  // ต้นทุนของแต่ละวิธีอ่าน — ยิ่งต่ำยิ่งน่าจะถูก เส้นทางที่ผลรวมต่ำสุดชนะ
  var COST = {
    dictWord: 4,     // คำในพจนานุกรม: ต่อคำ ...
    dictSyl: 2,      // ... + ต่อพยางค์ (คำยาวที่ตรงทั้งคำชนะการต่อคำสั้นๆ หลายคำ)
    wordRank: 0.2,   // + ต่อ log2(อันดับความถี่) ของคำในรายการคำศัพท์
    prefix: 4,       // คำนำหน้าในพจนานุกรม (ราช- = ราด-ชะ) ใช้เสมอเมื่อมีพยางค์ตามมา
    pattern: 10,     // พยางค์ที่มีรูปสระชัดเจน
    cluster: 9,      // ... ที่ขึ้นต้นด้วยอักษรควบ/อักษรนำ (ข้อ-ความ ไม่ใช่ ข้อก-วาม)
    loanCluster: 3,  // + อักษรควบในคำยืม (บร ดร ฟร) ใช้เมื่อไม่มีทางอื่นเท่านั้น
    rareOpen: 8,     // + สระ อึ ไม่มีตัวสะกด (มีแค่ รึ หึ อึ)
    silentR: 1,      // + ร ไม่ออกเสียงท้ายพยางค์ (บัตร)
    closedO: 14,     // สระโอะลดรูป + ตัวสะกด (คน ผม)
    closedOCluster: 13,
    openA: 16,       // สระอะลดรูป (ส-บาย ข-นม)
    openAAgain: 4,   // + ถ้าพยางค์ก่อนหน้าก็เป็นสระอะลดรูป
    leader: 3,       // - อักษรสูง/กลางนำอักษรต่ำเสียงก้อง (ตอบ-สะ-หนอง ลง-สะ-หมัก)
    openAEnd: 30,    // สระอะลดรูปเป็นพยางค์สุดท้าย — แทบไม่มีในคำจริง
    displaced: 7,    // - แต้มต่อของสระหน้าที่เป็นของพยัญชนะตัวที่สอง (ดู displacedLikely)
    skip: 50         // ข้ามตัวอักษรที่อ่านไม่ได้
  };

  // ดัชนีคำยกเว้น/คำศัพท์ในรูปที่ผ่าน normalize แล้ว
  var NDICT = null, NPREFIX = null, NWORDS = null, NDICT_MAX = 0;
  var wordCache = {};

  function parseDict(str) {
    return str.split('-').map(function (p) {
      var m = /^(.*?)(\d)?$/.exec(p);
      return { r: m[1], t: m[2] ? parseInt(m[2], 10) : 0 };
    });
  }

  function buildNDict() {
    NDICT = {};
    NPREFIX = {};
    NWORDS = {};
    [EXCEPTIONS, DICT].forEach(function (table) {
      Object.keys(table).forEach(function (k) {
        var isPrefix = k.length > 1 && k.charAt(k.length - 1) === '-';
        var nk = normalize(isPrefix ? k.slice(0, -1) : k);
        (isPrefix ? NPREFIX : NDICT)[nk] = parseDict(table[k]);
        if (nk.length > NDICT_MAX) NDICT_MAX = nk.length;
      });
    });
    // WORDS เรียงตามความถี่ — คำที่พบบ่อยกว่าได้ต้นทุนต่ำกว่า (อีก|ว่า ชนะ อี|กว่า)
    WORDS.split('|').forEach(function (w, rank) {
      if (!w) return;
      var nw = normalize(w);
      if (NDICT[nw] || NWORDS[nw]) return;
      NWORDS[nw] = COST.wordRank * Math.log(rank + 2) / Math.LN2;
      if (nw.length > NDICT_MAX) NDICT_MAX = nw.length;
    });
  }

  // คำอ่านของคำในรายการคำศัพท์ = อ่านคำนั้นเดี่ยวๆ ด้วยกฎ + พจนานุกรมคำยกเว้น
  // คำประสม (แสงสว่าง นายทหาร) ใช้คำย่อยในรายการได้ แต่เฉพาะคำยาว 3 ตัวอักษรขึ้นไป
  // (รายการมีเศษคำสั้นๆ อย่าง "อง" ที่จะทำให้ สมอง กลายเป็น สม-อง) และห้ามใช้ตัวมันเองทั้งคำ
  function wordSyllables(w) {
    if (!wordCache[w]) wordCache[w] = pathSyllables(bestPath(w, true));
    return wordCache[w];
  }

  function patternSyllable(p, m, clustered) {
    var ini = m[1];
    var cost = !clustered ? COST.pattern : WEAK_CLUSTER[ini] ? COST.pattern + COST.loanCluster : COST.cluster;
    // เหว เหย โหย เหง โหน: ห + ว/ย/ง/น/ม ในสระหน้าเปล่าๆ มักอ่าน ห + สระ/ตัวสะกด
    // ไม่ใช่ ห นำ (แต่ ไหว ไหน = ไ + ห นำ, ส่วน แหม โหล อยู่ในพจนานุกรม)
    if (clustered && ini.charAt(0) === 'ห' && /[วยงนม]/.test(ini.charAt(1)) && /[เแโ]/.test(m[0].charAt(0)) &&
        m[0].length === 3) cost = COST.pattern + 1;
    if (p.v === 'ue' && !p.long && !p.fin && ini !== 'ร') cost += COST.rareOpen;
    return {
      len: m[0].length,
      syl: { kind: 'pat', ini: ini, mark: m[2] || '', fin: p.fin === true ? m[3] : p.fin || null, v: p.v, long: p.long },
      cost: cost
    };
  }

  // สระหน้าที่ย้ายไปอยู่กับพยัญชนะตัวที่สองมักเป็นแบบนี้: แ- เกือบทุกครั้ง (แสดง แถลง แมลง)
  // และ เ- เมื่อส่วนท้ายของสระอยู่หลังพยัญชนะตัวที่สอง (เสนอ เฉพาะ เจริญ เสด็จ เฉลย)
  // หรือมีตัวสะกด (เขมร เกษม) — แต่ เ-า เปิดท้าย (เวลา เสนา) โ- (โสภณ) และ ไ- (ไพเราะ)
  // มักอ่านตรงตัว (ไ- ที่ย้ายจริงอย่าง ไสว ไฉน ชนะได้เพราะไม่มีทางอ่านอื่น)
  function displacedLikely(lead, shifted, x) {
    if (lead === 'แ') return true;
    if (lead !== 'เ') return false;
    var tail = shifted.slice(1 + x.syl.ini.length, x.len);
    if (x.syl.fin) tail = tail.slice(0, -1);
    return tail !== 'า';      // เขย่า (มีวรรณยุกต์) ย้าย, เวลา ไม่ย้าย
  }

  // ทุกพยางค์ที่มีรูปสระชัดเจนซึ่งเริ่มที่ตำแหน่งแรกของ str
  function matchPatterns(str) {
    var res = [];
    for (var k = 0; k < RAW_PATTERNS.length; k++) {
      var pc = PATTERNS_CLUSTER[k], m = pc.re.exec(str);
      if (m) res.push(patternSyllable(pc, m, true));
      var ps = PATTERNS_SINGLE[k];
      m = ps.re.exec(str);
      if (m) res.push(patternSyllable(ps, m, false));
    }
    return res;
  }

  // ทางเลือกทั้งหมดที่เริ่มที่ตำแหน่ง i
  // inWord: กำลังหาคำอ่านของคำในรายการ (ใช้ได้แค่คำย่อยที่ยาว >= 3 และไม่ใช่ตัวมันเอง)
  function edgesAt(s, i, inWord) {
    var n = s.length;
    var ch = s.charAt(i);
    var next = s.charAt(i + 1);
    var edges = [];
    var k, len;

    if (ch === 'ๆ') return [{ len: 1, cost: 0, repeat: true, syls: [] }];
    if (s.substr(i, 3) === 'ฯลฯ') {
      return [{ len: 3, cost: 0, word: true, syls: fixedSyls(NDICT['ฯลฯ']) }];
    }
    if (ch === 'ฯ' || ch === '๏' || ch === '๚' || ch === '๛') return [{ len: 1, cost: 0, syls: [] }];
    if (THAI_DIGITS.indexOf(ch) >= 0) {
      return [{ len: 1, cost: 0, syls: [{ kind: 'fixed', r: String(THAI_DIGITS.indexOf(ch)), t: 0 }] }];
    }

    // --- คำในพจนานุกรม ---
    var prevCh = s.charAt(i - 1);
    if (!LEAD_RE.test(prevCh)) {
      var max = Math.min(NDICT_MAX, n - i);
      for (len = max; len >= 1; len--) {
        var sub = s.substr(i, len);
        var after = s.charAt(i + len);
        // คำที่จับได้ต้องจบพยางค์จริง: ตัวถัดไปต้องไม่ใช่สระ/วรรณยุกต์ที่เกาะตัวสุดท้ายของมัน
        if (isBound(after)) continue;
        // คำตัวอักษรเดียว (ณ ธ) ใช้ได้เฉพาะเมื่อยืนเดี่ยวๆ ไม่งั้นจะไปแย่งตัวสะกดของคำอื่น
        if (len === 1 && n > 1) continue;
        var entry = NDICT[sub];
        if (NPREFIX[sub] && (isCons(after) || LEAD_RE.test(after))) {
          edges.push({ len: len, cost: COST.prefix, word: true, syls: fixedSyls(NPREFIX[sub]) });
        }
        if (!entry && NWORDS[sub] !== undefined && len > 1 && !(inWord && (len < 3 || len === n))) {
          var ws = wordSyllables(sub);
          if (ws.length) {
            // พยางค์จากกฎยังผ่านการคำนวณวรรณยุกต์อีกรอบ อักษรนำจากพยางค์ก่อนหน้าจึงยังมีผล
            edges.push({ len: len, cost: COST.dictWord + COST.dictSyl * ws.length + NWORDS[sub], word: true, syls: ws });
          }
        }
        if (entry) {
          edges.push({
            len: len, cost: COST.dictWord + COST.dictSyl * entry.length, word: true, syls: fixedSyls(entry),
            // เสียงวรรณยุกต์ในพจนานุกรมคิดแบบไม่มีอักษรนำ — ถ้ามีตัวนำอยู่หน้า ให้กฎคำนวณเอง
            leadable: SONORANT.indexOf(ch) >= 0 && !CLUSTER[sub.substr(0, 2)]
          });
        }
      }
    }

    // --- พยางค์ที่มีรูปสระ ---
    var win = s.substr(i, 16);
    matchPatterns(win).forEach(function (x) {
      edges.push({ len: x.len, cost: x.cost, syls: [x.syl] });
      // ร ไม่ออกเสียงหลังตัวสะกด: บัตร มิตร เพชร จักร สมัคร
      var f = x.syl.fin;
      if (f && SILENT_R_AFTER.indexOf(f) >= 0 && s.charAt(i + x.len) === 'ร' &&
          !isBound(s.charAt(i + x.len + 1)) &&
          ((f !== 'ก' && f !== 'ค') || win.indexOf('ั') === x.syl.ini.length)) {
        edges.push({ len: x.len + 1, cost: x.cost + COST.silentR, syls: [x.syl] });
      }
    });

    // --- สระหน้าที่เป็นของพยัญชนะตัวที่สอง: เสนอ = ส + เนอ, แสดง = ส + แดง ---
    if (LEAD_RE.test(ch) && ch !== 'ใ' && isCons(next) && isCons(s.charAt(i + 2))) {
      var shifted = ch + s.substr(i + 2, 15);
      matchPatterns(shifted).forEach(function (x) {
        if (x.len < 2) return;
        var leads = /[กจฎฏดตบปขฃฉฐถผฝศษสห]/.test(next) && SONORANT.indexOf(x.syl.ini) >= 0;
        edges.push({
          len: x.len + 1,
          cost: COST.openA + x.cost - (displacedLikely(ch, shifted, x) ? COST.displaced : 0) -
            (leads ? COST.leader : 0),
          word: true,
          syls: [{ kind: 'open', ini: next, v: 'a', long: false, fin: null, mark: '' }, x.syl]
        });
      });
    }

    if (isCons(ch)) {
      // --- สระอะลดรูป: ส-บาย ข-นม ---
      if (!isBound(next)) {
        var cls = CLASS[ch];
        var leads = (cls === 'high' || cls === 'mid') && ch !== 'อ';
        edges.push({
          len: 1,
          cost: i + 1 >= n ? COST.openAEnd : COST.openA - (leads && SONORANT.indexOf(next) >= 0 ? COST.leader : 0),
          open: leads ? 2 : 1,
          syls: [{ kind: 'open', ini: ch, v: 'a', long: false, fin: null, mark: '' }]
        });
      }
      // --- สระโอะลดรูป + ตัวสะกด: คน รถ, กลม หมด ---
      var inits = [[ch, COST.closedO]];
      var pair = ch + next;
      if (CLUSTER[pair]) inits.push([pair, WEAK_CLUSTER[pair] ? COST.closedO + COST.loanCluster : COST.closedOCluster]);
      for (k = 0; k < inits.length; k++) {
        var ini = inits[k][0];
        var f2 = s.charAt(i + ini.length);
        if (FIN[f2] && f2 !== 'ย' && f2 !== 'ว' && !isBound(s.charAt(i + ini.length + 1))) {
          edges.push({
            len: ini.length + 1,
            cost: inits[k][1],
            syls: [{ kind: 'closed', ini: ini, v: 'o', long: false, fin: f2, mark: '' }]
          });
        }
      }
    }

    edges.push({ len: 1, cost: COST.skip, syls: [] });
    return edges;
  }

  function fixedSyls(list) {
    return list.map(function (x) { return { kind: 'fixed', r: x.r, t: x.t }; });
  }

  // หาเส้นทางที่ต้นทุนรวมต่ำสุด
  // state = ตำแหน่ง × พยางค์ก่อนหน้า (0 = อื่นๆ, 1 = สระอะลดรูป, 2 = สระอะลดรูปที่เป็นอักษรนำได้)
  function bestPath(s, inWord) {
    var n = s.length;
    var S = 3;
    var best = [{ cost: 0 }];
    for (var i = 0; i < n; i++) {
      var edges = null;
      for (var f = 0; f < S; f++) {
        var cur = best[i * S + f];
        if (!cur) continue;
        if (!edges) edges = edgesAt(s, i, inWord);
        for (var k = 0; k < edges.length; k++) {
          var e = edges[k];
          if (f === 2 && e.leadable) continue;
          var c = cur.cost + e.cost + (e.open && f ? COST.openAAgain : 0);
          var nf = e.open || (e.syls.length || e.repeat ? 0 : f);
          var key = (i + e.len) * S + nf;
          if (!best[key] || c < best[key].cost) best[key] = { cost: c, from: i * S + f, edge: e };
        }
      }
    }
    var endKey = -1;
    for (var f2 = 0; f2 < S; f2++) {
      var b = best[n * S + f2];
      if (b && (endKey < 0 || b.cost < best[endKey].cost)) endKey = n * S + f2;
    }
    var path = [];
    for (var key2 = endKey; key2 > 0; key2 = best[key2].from) path.unshift(best[key2].edge);
    return path;
  }

  // อักษรนำ: อักษรสูง/กลางที่อ่านสระอะลดรูป นำอักษรต่ำเดี่ยวเสียงก้องตัวถัดไป
  // -> พยางค์ถัดไปใช้หมู่เสียงของตัวนำ (ขนม = ขะ-หนม, ตลาด = ตะ-หลาด)
  // อ ไม่นำ (อนุ อนาคต อำนาจ) ยกเว้นคำในพจนานุกรม (อย่า อยู่ อย่าง อยาก อร่อย)
  function leadClass(prev, cur) {
    if (!prev || prev.kind !== 'open' || prev.ini.length !== 1 || prev.ini === 'อ') return null;
    if (cur.kind === 'fixed' || cur.ini.length !== 1 || SONORANT.indexOf(cur.ini) < 0) return null;
    var cls = CLASS[prev.ini];
    return (cls === 'high' || cls === 'mid') ? cls : null;
  }

  // แคชผลต่อข้อความไทยหนึ่งช่วง — หน้าเว็บแปลงทั้งข้อความใหม่ทุกครั้งที่พิมพ์
  var tokenCache = {}, tokenCacheSize = 0;

  function romanizeThaiWord(word) {
    if (!NDICT) buildNDict();
    var hit = tokenCache[word];
    if (!hit) {
      if (tokenCacheSize >= 5000) { tokenCache = {}; tokenCacheSize = 0; }
      hit = tokenCache[word] = finishSyllables(pathSyllables(bestPath(normalize(word))));
      tokenCacheSize++;
    }
    // คืนสำเนา ผู้เรียกจะแก้ไขผลได้โดยไม่กระทบแคช
    return hit.map(function (x) {
      var c = { r: x.r, t: x.t };
      if (x.cls) c.cls = x.cls;
      return c;
    });
  }

  // เรียงพยางค์ดิบตามเส้นทาง + จัดการไม้ยมก (ซ้ำคำก่อนหน้า)
  function pathSyllables(path) {
    var raw = [];
    var groups = [];   // พยางค์ของแต่ละ edge เพื่อใช้กับ ๆ
    path.forEach(function (e) {
      if (e.repeat) {
        var rep = [];
        var g = groups.length - 1;
        if (g >= 0) {
          rep = groups[g].syls;
          // พยางค์สระอะลดรูปที่นำหน้าเป็นส่วนหนึ่งของคำเดียวกัน (สบายๆ ขนมๆ)
          if (!groups[g].word) {
            for (g = g - 1; g >= 0 && groups[g].open; g--) rep = groups[g].syls.concat(rep);
          }
        }
        rep.forEach(function (x) { raw.push(x); });
        return;
      }
      if (!e.syls.length) return;
      groups.push(e);
      e.syls.forEach(function (x) { raw.push(x); });
    });
    return raw;
  }

  // คำนวณเสียงอ่าน + วรรณยุกต์ของแต่ละพยางค์ (รวมอักษรนำ)
  function finishSyllables(raw) {
    var out = [];
    for (var k = 0; k < raw.length; k++) {
      var x = raw[k];
      if (x.kind === 'fixed') { out.push({ r: x.r, t: x.t }); continue; }
      out.push(makeSyllable(x.ini, x.v, x.long, x.fin, x.mark, leadClass(raw[k - 1], x)));
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 7. Public API
   * ------------------------------------------------------------------ */

  function tokenize(text) {
    var tokens = [];
    var buf = '';
    var kind = null;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      var k = THAI_RE.test(c) ? 'thai' : 'other';
      if (k !== kind) {
        if (buf) tokens.push({ type: kind, src: buf });
        buf = c; kind = k;
      } else buf += c;
    }
    if (buf) tokens.push({ type: kind, src: buf });
    return tokens;
  }

  // เลขไทยเป็นเลขอารบิก, ตัดเครื่องหมายวรรคตอนโบราณที่ไม่มีเสียง
  function convertOther(src) {
    return src.replace(/[๐-๙]/g, function (d) { return String(THAI_DIGITS.indexOf(d)); })
      .replace(/[๏๚๛]/g, '');
  }

  var SEP_CHAR = { join: '', space: ' ', hyphen: '-' };
  var FIRST_LETTER_RE = /[a-zàáâǎèéêěìíîǐòóôǒùúûǔ]/i;

  function capFirst(s) {
    return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // ตัวเลือกรูปแบบ: mode (ค่าเดิม, ใช้งานง่าย) หรือระบุ tone/separator/case แยกกันเพื่อความยืดหยุ่น
  //   mode: 'tones' | 'segmented' | 'plain'  (ค่าเริ่มต้นของ tone/separator/case)
  //   tone: true|false                       -> แสดง/ซ่อนเครื่องหมายวรรณยุกต์
  //   separator: 'join' | 'space' | 'hyphen' -> ตัวคั่นระหว่างพยางค์
  //   case: 'lower' | 'sentence' | 'title'   -> รูปแบบตัวพิมพ์ใหญ่-เล็ก
  function romanize(text, opts) {
    opts = opts || {};

    var withTone, separator, caseMode;
    switch (opts.mode) {
      case 'plain':     withTone = false; separator = 'join';   caseMode = 'lower'; break;
      case 'segmented': withTone = false; separator = 'hyphen'; caseMode = 'lower'; break;
      default:          withTone = true;  separator = 'hyphen'; caseMode = 'lower'; break;
    }
    if (opts.tone !== undefined) withTone = !!opts.tone;
    if (opts.separator !== undefined) separator = opts.separator;
    if (opts.case !== undefined) caseMode = opts.case;

    var sepChar = SEP_CHAR[separator] !== undefined ? SEP_CHAR[separator] : '-';

    var tokens = tokenize(String(text || ''));
    var parts = [];
    var syllableCount = 0;
    var detail = [];

    tokens.forEach(function (tk) {
      if (tk.type !== 'thai') { parts.push(convertOther(tk.src)); return; }
      var syls = romanizeThaiWord(tk.src);
      if (!syls.length) { parts.push(''); return; }
      syllableCount += syls.length;
      detail.push({ thai: tk.src, syls: syls });

      var rendered = syls.map(function (s) {
        var r = withTone ? applyTone(s.r, s.t) : s.r;
        return caseMode === 'title' ? capFirst(r) : r;
      });
      parts.push(rendered.join(sepChar));
    });

    var out = parts.join('');
    out = out.replace(/[ \t]{2,}/g, ' ');

    if (caseMode === 'sentence') {
      out = out.replace(FIRST_LETTER_RE, function (m) { return m.toUpperCase(); });
    }

    return { text: out, syllables: syllableCount, detail: detail };
  }

  return {
    romanize: romanize,
    romanizeWord: romanizeThaiWord,
    applyTone: applyTone,
    TONE_NAMES_EN: ['mid', 'low', 'falling', 'high', 'rising'],
    TONE_NAMES_TH: ['สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา'],
    version: '1.1.0'
  };
}));
