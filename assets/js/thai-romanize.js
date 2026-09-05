/*!
 * thai-romanize.js
 * ตัวแปลงอักษรไทยเป็นอักษรโรมัน (RTGS) + เครื่องหมายวรรณยุกต์
 * Rule-based Thai -> Latin transliteration engine, no dependencies.
 *
 * Output modes:
 *   'plain'     -> RTGS style, syllables joined      : sawatdi
 *   'segmented' -> syllables separated by hyphen     : sa-wat-di
 *   'tones'     -> segmented + tone diacritics       : sà-wàt-di
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
  var LOW  = 'คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ';

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
    'อ': '',   'ฮ': 'h'
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

  // อักษรควบแท้ + อักษรนำ (ห นำ / อ นำ)
  var CLUSTER = {
    'กร': 'kr',  'กล': 'kl',  'กว': 'kw',
    'ขร': 'khr', 'ขล': 'khl', 'ขว': 'khw',
    'คร': 'khr', 'คล': 'khl', 'คว': 'khw',
    'ตร': 'tr',
    'ปร': 'pr',  'ปล': 'pl',
    'ผล': 'phl',
    'พร': 'phr', 'พล': 'phl',
    'ทร': 's',   'ศร': 's',
    'หง': 'ng',  'หญ': 'y',  'หน': 'n',  'หม': 'm',  'หย': 'y',
    'หร': 'r',   'หล': 'l',  'หว': 'w',  'หฬ': 'l',
    'อย': 'y'
  };

  function clusterClass(pair) {
    if (pair.charAt(0) === 'ห') return 'high';
    if (pair === 'อย') return 'mid';
    return CLASS[pair.charAt(0)] || 'low';
  }

  var CONS_RE  = /[ก-ฮ]/;
  var TONE_RE  = /[่-๋]/;
  // สระที่เกาะหลัง/บน/ล่างพยัญชนะ
  var BOUND_RE = /[ะ-ฺๅ็่้๊๋]/;
  var LEAD_RE  = /[เ-ไ]/;
  var THAI_RE  = /[฀-๿]/;

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

  var clusterKeys = Object.keys(CLUSTER).sort();
  var I = '(' + clusterKeys.join('|') + '|[ก-ฮ])';
  var T = '([่-๋]?)';
  var F = '([กขคฆงจชซฌฎฏฐฑฒดตถทธศษสญณนรลฬบปพฟภมยว])';

  // [pattern, vowel, isLong, hasFinalGroup]
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
    [I + 'ั' + T + 'ว' + F,    'ua',  true,  true],
    [I + 'ั' + T + 'ว',        'ua',  true,  false],
    [I + T + 'ว' + F,          'ua',  true,  true],

    ['เ' + I + T + 'อะ',       'oe',  false, false],
    ['เ' + I + 'ิ' + T + 'ย',  'oei', true,  false],
    ['เ' + I + 'ิ' + T + F,    'oe',  true,  true],
    ['เ' + I + 'ิ' + T,        'oe',  true,  false],
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
    [I + 'ั' + T,              'a',   false, false],

    [I + T + 'ะ',              'a',   false, false],
    [I + T + 'าย',             'ai',  true,  false],
    [I + T + 'าว',             'ao',  true,  false],
    [I + T + 'า' + F,          'a',   true,  true],
    [I + T + 'า',              'a',   true,  false],
    [I + T + 'ำ',              'am',  false, false],

    [I + 'ิ' + T + 'ว',        'io',  false, false],
    [I + 'ิ' + T + F,          'i',   false, true],
    [I + 'ิ' + T,              'i',   false, false],

    [I + 'ี' + T + 'ย' + F,    'ia',  true,  true],
    [I + 'ี' + T + F,          'i',   true,  true],
    [I + 'ี' + T,              'i',   true,  false],

    [I + 'ึ' + T + F,          'ue',  false, true],
    [I + 'ึ' + T,              'ue',  false, false],

    [I + 'ื' + T + 'อ',        'ue',  true,  false],
    [I + 'ื' + T + F,          'ue',  true,  true],
    [I + 'ื' + T,              'ue',  true,  false],

    [I + 'ุ' + T + 'ย',        'ui',  false, false],
    [I + 'ุ' + T + F,          'u',   false, true],
    [I + 'ุ' + T,              'u',   false, false],

    [I + 'ู' + T + F,          'u',   true,  true],
    [I + 'ู' + T,              'u',   true,  false],

    [I + T + '็อ' + F,         'o',   false, true],
    [I + T + 'อย',             'oi',  true,  false],
    [I + T + 'อ' + F,          'o',   true,  true],
    [I + T + 'อ',              'o',   true,  false],

    // สระ โอะ ลดรูป ที่มีรูปวรรณยุกต์กำกับ เช่น ส่ง ต้น ค่ง
    [I + '([่-๋])' + F,         'o',   false, true]
  ];

  // ตัวสะกดต้องไม่มีสระ/วรรณยุกต์ตามหลัง (ไม่งั้นมันคือพยัญชนะต้นของพยางค์ถัดไป)
  var NF = '(?![ะ-ฺๅ็่้๊๋])';

  var PATTERNS = RAW_PATTERNS.map(function (p) {
    var src = p[0];
    if (src.slice(-F.length) === F || CONS_RE.test(src.slice(-1))) src += NF;
    return { re: new RegExp('^(?:' + src + ')'), v: p[1], long: p[2], fin: p[3] };
  });

  /* ------------------------------------------------------------------ *
   * 4. Exception dictionary  (word -> "syl<tone>-syl<tone>")
   * ------------------------------------------------------------------ */

  var DICT = {
    'ก็': 'ko2', 'ก็ได้': 'ko2-dai2', 'ณ': 'na3', 'ธ': 'tho3',
    'จริง': 'ching0', 'จริงๆ': 'ching0-ching0',
    'ปรากฏ': 'pra1-kot1', 'ผลิต': 'pha1-lit1', 'ผลไม้': 'phon4-la3-mai3',
    'ผลงาน': 'phon4-la3-ngan0', 'ผลิตภัณฑ์': 'pha1-lit1-ta1-phan0',
    'บริษัท': 'bo0-ri3-sat1', 'บริการ': 'bo0-ri3-kan0', 'บริเวณ': 'bo0-ri3-wen0',
    'บริหาร': 'bo0-ri3-han4', 'บริสุทธิ์': 'bo0-ri3-sut1',
    'ทรมาน': 'tho3-ra3-man0', 'ทรัพย์': 'sap3', 'ทราบ': 'sap2', 'ทราย': 'sai0',
    'เศร้า': 'sao2', 'ศรี': 'si4', 'สร้าง': 'sang2', 'สระ': 'sa1-ra1',
    'สรุป': 'sa1-rup1', 'เสร็จ': 'set1',
    'อังกฤษ': 'ang0-krit1', 'ฤดู': 'rue3-du0', 'ฤทธิ์': 'rit3',
    'พฤษภาคม': 'phrue3-sa1-pha0-khom0', 'พฤหัสบดี': 'pha3-rue3-hat1-sa1-bo0-di0',
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
    'สถาบัน': 'sa1-tha4-ban0', 'สถานการณ์': 'sa1-than4-tha1-kan0',
    'ตำรวจ': 'tam0-ruat1', 'รัฐบาล': 'rat3-tha1-ban0', 'รัฐ': 'rat3',
    'เศรษฐกิจ': 'set1-tha1-kit1', 'เศรษฐี': 'set1-thi4',
    'วัฒนธรรม': 'wat3-tha3-na3-tham0', 'ธรรมชาติ': 'tham0-ma3-chat2',
    'ธรรมดา': 'tham0-ma3-da0', 'ธุรกิจ': 'thu3-ra3-kit1',
    'ปัญหา': 'pan0-ha4', 'สำคัญ': 'sam4-khan0', 'สามารถ': 'sa4-mat2',
    'โทรศัพท์': 'tho0-ra3-sap1', 'คอมพิวเตอร์': 'khom0-phio0-toe0',
    'อินเทอร์เน็ต': 'in0-thoe0-net1', 'อีเมล': 'i0-men0',
    'กรุงเทพ': 'krung0-thep2', 'กรุงเทพฯ': 'krung0-thep2',
    'กรุงเทพมหานคร': 'krung0-thep2-ma3-ha4-na3-khon0',
    'เชียงใหม่': 'chiang0-mai1', 'ภูเก็ต': 'phu0-ket1', 'อยุธยา': 'a1-yut3-tha3-ya0',
    'หนังสือ': 'nang4-sue4', 'ผู้หญิง': 'phu2-ying4', 'ผู้ชาย': 'phu2-chai0',
    'เด็ก': 'dek1', 'ครอบครัว': 'khrop2-khrua0', 'เพื่อน': 'phuean2',
    'ตลาด': 'ta1-lat1', 'ตลอด': 'ta1-lot1', 'ถนน': 'tha1-non4',
    'มนุษย์': 'ma3-nut3', 'ศิลปะ': 'sin4-la3-pa1', 'ประโยชน์': 'pra1-yot1',
    'อุณหภูมิ': 'un1-ha1-phum0', 'เกษตร': 'ka1-set1', 'กษัตริย์': 'ka1-sat1',
    'สัปดาห์': 'sap1-da0', 'ปฏิบัติ': 'pa1-ti1-bat1', 'ปกติ': 'pok1-ka1-ti1',
    'มกราคม': 'ma3-ka1-ra0-khom0', 'กุมภาพันธ์': 'kum0-pha0-phan0',
    'มีนาคม': 'mi0-na0-khom0', 'เมษายน': 'me0-sa4-yon0',
    'มิถุนายน': 'mi3-thu1-na0-yon0', 'กรกฎาคม': 'ka1-ra3-ka1-da0-khom0',
    'สิงหาคม': 'sing4-ha4-khom0', 'กันยายน': 'kan0-ya0-yon0',
    'ตุลาคม': 'tu1-la0-khom0', 'พฤศจิกายน': 'phrue3-sa1-chi1-ka0-yon0',
    'ธันวาคม': 'than0-wa0-khom0',
    'สาธารณะ': 'sa4-tha0-ra3-na3', 'สาธารณสุข': 'sa4-tha0-ra3-na3-suk1',
    'มหานคร': 'ma3-ha4-na3-khon0', 'มหา': 'ma3-ha4', 'มหาสมุทร': 'ma3-ha4-sa1-mut1',
    'อาจารย์': 'a0-chan0', 'พาหนะ': 'pha0-ha1-na3', 'ยานพาหนะ': 'yan0-pha0-ha1-na3',
    'ชนะ': 'cha3-na3', 'คณะ': 'kha3-na3', 'สภาพ': 'sa1-phap2',
    'สภา': 'sa1-pha0', 'อนาคต': 'a1-na0-khot3', 'ปัจจุบัน': 'pat1-chu1-ban0',
    'อดีต': 'a1-dit1', 'ทันที': 'than0-thi0', 'เทคโนโลยี': 'thek3-no0-lo0-yi0',
    'วัตถุ': 'wat3-thu1', 'สัตว์': 'sat1', 'ปรัชญา': 'prat1-cha0-ya0',
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
    'สุร': 'su1-ra3', 'สุระ': 'su1-ra3',
    'สุรวุฒิ': 'su1-ra3-wut3', 'สุรชัย': 'su1-ra3-chai0', 'สุรยุทธ์': 'su1-ra3-yut3',
    'สุรเดช': 'su1-ra3-det2', 'สุรพล': 'su1-ra3-phon0', 'สุรศักดิ์': 'su1-ra3-sak1',

    /* คำนำหน้าชื่อที่ลงท้ายด้วย ร เดี่ยว (ไม่มีรูปสระ) แล้วตามด้วยพยัญชนะอีกตัว
       เช่น วร-, อร-, พีร-, วีร- อ่านแยกเป็น 2 พยางค์ (...-ระ) เสมอ ไม่ใช่ปิดพยางค์ด้วย ร */
    'วร': 'wo0-ra3', 'อร': 'o0-ra3', 'พีร': 'phi0-ra3', 'วีร': 'wi0-ra3',
    'วรนุช': 'wo0-ra3-nut3', 'อรนุช': 'o0-ra3-nut3',
    'พีรพล': 'phi0-ra3-phon0', 'วีรพล': 'wi0-ra3-phon0',
    'อมรรัตน์': 'a1-mon0-rat3'
  };

  /* ------------------------------------------------------------------ *
   * 5. Normalisation
   * ------------------------------------------------------------------ */

  var THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

  function normalize(word) {
    var s = word;

    // ทัณฑฆาต (การันต์): ตัวที่มี ์ ไม่ออกเสียง และมักลากตัวหน้าไปด้วย
    s = s.replace(/([ก-ฮ])?([ก-ฮ])[ิุ]?์/g,
      function (m, prev, dead, offset, str) {
        // ถ้าตัวก่อนหน้า prev เป็นพยัญชนะ และตัวก่อน prev ก็เป็นพยัญชนะ
        // แสดงว่า prev ไม่ใช่ตัวสะกด -> ตัดทิ้งด้วย (จันทร์ -> จัน)
        if (prev) {
          var before = str.charAt(offset - 1);
          if (isCons(before)) return '';
          return prev;
        }
        return '';
      });

    s = s.replace(/ฺ/g, '');            // พินทุ
    s = s.replace(/๎/g, '');            // ยามักการ
    s = s.replace(/ฤๅ|ฤ/g, 'รึ');  // ฤ
    s = s.replace(/ฦๅ|ฦ/g, 'ลึ');  // ฦ

    // รร (ร หัน) : ถ้าตัวถัดไปทำหน้าที่ตัวสะกด -> "ั" ; ถ้าไม่ -> "ัน"
    s = s.replace(/([ก-ฮ])รร([ก-ฮ])(?![ะ-ฺๅ็่้๊๋])/g, '$1ั$2');
    s = s.replace(/([ก-ฮ])รร/g, '$1ัน');

    return s;
  }

  /* ------------------------------------------------------------------ *
   * 6. Syllable machine
   * ------------------------------------------------------------------ */

  // สระที่ถือเป็น "คำเป็น" เสมอ แม้ไม่มีตัวสะกด
  var LIVE_VOWELS = {};
  ['am', 'ai', 'ao', 'io', 'ui', 'oi', 'eo', 'aeo', 'iao', 'uai', 'ueai', 'oei']
    .forEach(function (v) { LIVE_VOWELS[v] = true; });

  function makeSyllable(ini, vowel, isLong, finalChar, mark, forcedClass) {
    var pair = ini.length === 2 ? ini : null;
    var sound, cls;

    if (pair && CLUSTER[pair]) {
      sound = CLUSTER[pair];
      cls = clusterClass(pair);
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

  function matchPattern(s, i) {
    var rest = s.slice(i);
    for (var k = 0; k < PATTERNS.length; k++) {
      var p = PATTERNS[k];
      var m = p.re.exec(rest);
      if (m) {
        return {
          len: m[0].length,
          ini: m[1],
          mark: m[2] || '',
          fin: p.fin ? m[3] : null,
          v: p.v,
          long: p.long
        };
      }
    }
    return null;
  }

  // ดัชนีคำยกเว้นในรูปที่ผ่าน normalize แล้ว (ใช้จับคำยาวสุดในสายอักษรไทย)
  var NDICT = null, NDICT_MAX = 0;

  function buildNDict() {
    NDICT = {};
    Object.keys(DICT).forEach(function (k) {
      var nk = normalize(k);
      NDICT[nk] = DICT[k];
      if (nk.length > NDICT_MAX) NDICT_MAX = nk.length;
    });
  }

  function dictLookup(s, i) {
    if (!NDICT) buildNDict();
    var max = Math.min(NDICT_MAX, s.length - i);
    for (var len = max; len >= 2; len--) {
      var sub = s.substr(i, len);
      if (NDICT[sub]) {
        // ถ้าตัวถัดจากคำที่จับได้เป็นรูปวรรณยุกต์ แปลว่าตัวสุดท้ายที่จับมา
        // ยังไม่จบพยางค์จริง (วรรณยุกต์ต้องประกบกับพยางค์ที่ยังไม่ปิด) ข้ามไปลองความยาวสั้นลง
        if (TONE_RE.test(s.charAt(i + len))) continue;
        return { len: len, syls: parseDict(NDICT[sub]) };
      }
    }
    return null;
  }

  function romanizeThaiWord(word) {
    var s = normalize(word);
    var out = [];
    var i = 0;
    var forced = null;
    var guard = 0;

    while (i < s.length && guard++ < 400) {
      var ch = s.charAt(i);

      if (!THAI_RE.test(ch)) { i++; continue; }

      if (ch === 'ๆ') { // ๆ ไม้ยมก
        if (out.length) out.push({ r: out[out.length - 1].r, t: out[out.length - 1].t });
        i++; continue;
      }
      if (ch === 'ฯ' || ch === '๚' || ch === '๛') { i++; continue; }
      if (THAI_DIGITS.indexOf(ch) >= 0) {
        out.push({ r: String(THAI_DIGITS.indexOf(ch)), t: 0 }); i++; continue;
      }

      var dl = dictLookup(s, i);
      if (dl) {
        dl.syls.forEach(function (x) { out.push(x); });
        forced = null;
        i += dl.len;
        continue;
      }

      var m = matchPattern(s, i);
      if (m) {
        out.push(makeSyllable(m.ini, m.v, m.long, m.fin, m.mark, forced));
        forced = null;
        i += m.len;
        continue;
      }

      // --- พยัญชนะเรียงกันโดยไม่มีรูปสระ (สระ อะ / โอะ ลดรูป) ---
      var run = [];
      var j = i;
      while (j < s.length && isCons(s.charAt(j))) { run.push(s.charAt(j)); j++; }
      if (!run.length) { i++; continue; }

      // หาตำแหน่งแรกใน run ที่เริ่มพยางค์ใหม่
      // (คำในพจนานุกรมมีน้ำหนักมากกว่ารูปสระ เพราะช่วยตัดคำได้แม่นกว่า)
      var k = 0, kDict = 0;
      for (var kk = 1; kk < run.length; kk++) {
        if (!kDict && dictLookup(s, i + kk)) { kDict = kk; break; }
        if (!k && matchPattern(s, i + kk)) k = kk;
      }
      if (kDict) k = kDict;
      if (!k) k = run.length;

      var prefix = run.slice(0, k);
      var pieces = splitPrefix(prefix);

      // พยัญชนะต้นของพยางค์ถัดไป (ใช้ตัดสินอักษรนำ)
      var nextCons = null;
      if (k < run.length) nextCons = run[k];
      else if (j < s.length && LEAD_RE.test(s.charAt(j))) nextCons = s.charAt(j + 1) || null;

      for (var pi = 0; pi < pieces.length; pi++) {
        var d = pieces[pi];
        var syl = makeSyllable(d.ini, d.v, false, d.fin, '', forced);
        out.push(syl);
        var after = (pi + 1 < pieces.length) ? pieces[pi + 1].ini.charAt(0) : nextCons;
        forced = (!d.fin && d.v === 'a') ? leadFor(syl.cls, after) : null;
      }

      i += k;
    }

    return out;
  }

  // แตกกลุ่มพยัญชนะล้วนออกเป็นพยางค์ที่ใช้สระลดรูป
  function splitPrefix(cons) {
    var res = [];
    var idx = 0;
    while (idx < cons.length) {
      var remain = cons.length - idx;
      var pair = remain >= 2 ? cons[idx] + cons[idx + 1] : '';
      var isClu = !!CLUSTER[pair];
      var isLead = isClu && (pair.charAt(0) === 'ห' || pair === 'อย');

      if (remain === 1) {
        res.push({ ini: cons[idx], v: 'a', fin: null }); idx += 1;
      } else if (remain === 2) {
        if (isLead) { res.push({ ini: pair, v: 'a', fin: null }); idx += 2; }
        else { res.push({ ini: cons[idx], v: 'o', fin: cons[idx + 1] }); idx += 2; }
      } else if (remain === 3 && isClu) {
        res.push({ ini: pair, v: 'o', fin: cons[idx + 2] }); idx += 3;
      } else {
        res.push({ ini: cons[idx], v: 'a', fin: null }); idx += 1;
      }
    }
    return res;
  }

  // อักษรนำ: อักษรสูง/กลาง นำอักษรต่ำเดี่ยว -> พยางค์หลังใช้หมู่เสียงของตัวนำ
  function leadFor(cls, nextCons) {
    if (!nextCons) return null;
    if ((cls === 'high' || cls === 'mid') && SONORANT.indexOf(nextCons) >= 0) return cls;
    return null;
  }

  function parseDict(str) {
    return str.split('-').map(function (p) {
      var m = /^(.*?)(\d)?$/.exec(p);
      return { r: m[1], t: m[2] ? parseInt(m[2], 10) : 0 };
    });
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
      if (tk.type !== 'thai') { parts.push(tk.src); return; }
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
    version: '1.0.0'
  };
}));
