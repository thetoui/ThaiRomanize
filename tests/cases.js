/*
 * Expected readings, written by hand: syllables joined with "-", each ending in
 * its tone digit (0 สามัญ, 1 เอก, 2 โท, 3 ตรี, 4 จัตวา).
 * Grouped by the rule each case exercises, so a failure points at the rule.
 */
module.exports = {
  'tone rules (class x tone mark x live/dead x vowel length)': {
    'กา': 'ka0', 'ก่า': 'ka1', 'ก้า': 'ka2', 'ก๊า': 'ka3', 'ก๋า': 'ka4',
    'ขา': 'kha4', 'ข่า': 'kha1', 'ข้า': 'kha2',
    'คา': 'kha0', 'ค่า': 'kha2', 'ค้า': 'kha3',
    'กัด': 'kat1', 'ขาด': 'khat1', 'คาด': 'khat2', 'คัด': 'khat3',
    'นก': 'nok3', 'มาก': 'mak2', 'จาก': 'chak1', 'ลูก': 'luk2',
    'ไข่': 'khai1', 'ม้า': 'ma3', 'หมา': 'ma4', 'เสือ': 'suea4', 'หนู': 'nu4'
  },

  'vowels': {
    'กิน': 'kin0', 'ดี': 'di0', 'มือ': 'mue0', 'ดุ': 'du1', 'ดู': 'du0',
    'เละ': 'le3', 'เท': 'the0', 'แกะ': 'kae1', 'แก': 'kae0', 'โต๊ะ': 'to3',
    'โต': 'to0', 'เกาะ': 'ko1', 'รอ': 'ro0', 'เมีย': 'mia0', 'เรือ': 'ruea0',
    'ตัว': 'tua0', 'ไทย': 'thai0', 'ใจ': 'chai0', 'เขา': 'khao4', 'น้ำ': 'nam3',
    'เดิน': 'doen0', 'เธอ': 'thoe0', 'เลย': 'loei0', 'สวย': 'suai4',
    'เรียว': 'riao0', 'เหนื่อย': 'nueai1', 'แมว': 'maeo0', 'เร็ว': 'reo0',
    'หิว': 'hio4', 'คุย': 'khui0', 'โดย': 'doi0', 'ลอย': 'loi0', 'เก็บ': 'kep1',
    'แข็ง': 'khaeng4', 'ส่ง': 'song1', 'ต้น': 'ton2'
  },

  'clusters and อักษรนำ': {
    'กราบ': 'krap1', 'กลาง': 'klang0', 'กว้าง': 'kwang2', 'ขวา': 'khwa4',
    'ครู': 'khru0', 'คลอง': 'khlong0', 'ความ': 'khwam0', 'ตรง': 'trong0',
    'ปลา': 'pla0', 'พระ': 'phra3', 'เปลี่ยน': 'plian1', 'แปล': 'plae0',
    'ทราย': 'sai0', 'ทรง': 'song0', 'สร้าง': 'sang2', 'เศร้า': 'sao2',
    'จริง': 'ching0', 'หนึ่ง': 'nueng1', 'ใหญ่': 'yai1', 'หญิง': 'ying4',
    'หลาย': 'lai4', 'หวาน': 'wan4', 'ไหว': 'wai4', 'อยู่': 'yu1', 'อย่า': 'ya1',
    'อยาก': 'yak1', 'ขนม': 'kha1-nom4', 'สนุก': 'sa1-nuk1', 'ตลาด': 'ta1-lat1',
    'ฉลาด': 'cha1-lat1', 'สมอง': 'sa1-mong4', 'จมูก': 'cha1-muk1',
    'ขยัน': 'kha1-yan4', 'ถนน': 'tha1-non4', 'สบาย': 'sa1-bai0',
    'ทหาร': 'tha3-han4', 'อร่อย': 'a1-roi1', 'อนาคต': 'a1-na0-khot3'
  },

  'implicit vowels (สระอะ/โอะ ลดรูป)': {
    'คน': 'khon0', 'ผม': 'phom4', 'รถ': 'rot3', 'ลม': 'lom0', 'กลม': 'klom0',
    'หมด': 'mot1', 'ชนะ': 'cha3-na3', 'นคร': 'na3-khon0', 'สมุด': 'sa1-mut1',
    'ตกลง': 'tok1-long0', 'ผู้คน': 'phu2-khon0', 'ขบวน': 'kha1-buan0',
    'นิยม': 'ni3-yom0', 'ข้อความ': 'kho2-khwam0', 'แน่นอน': 'nae2-non0',
    'ตอบสนอง': 'top1-sa1-nong4', 'หน': 'hon4'
  },

  'leading vowel that belongs to the second consonant': {
    'เสนอ': 'sa1-noe4', 'เสมอ': 'sa1-moe4', 'แสดง': 'sa1-daeng0',
    'เจริญ': 'cha1-roen0', 'เฉพาะ': 'cha1-pho3', 'เสด็จ': 'sa1-det1',
    'เขมร': 'kha1-men4', 'แถลง': 'tha1-laeng4', 'แมลง': 'ma3-laeng0',
    'เฉลย': 'cha1-loei4', 'ไสว': 'sa1-wai4',
    'เวลา': 'we0-la0', 'เลขา': 'le0-kha4', 'แสงสว่าง': 'saeng4-sa1-wang1'
  },

  'ทัณฑฆาต (การันต์)': {
    'การ์ตูน': 'ka0-tun0', 'จันทร์': 'chan0', 'ศาสตร์': 'sat1', 'องค์': 'ong0',
    'หงส์': 'hong4', 'เบอร์': 'boe0', 'ฟิล์ม': 'fim0', 'สัตว์': 'sat1',
    'ศัพท์': 'sap1', 'พันธุ์': 'phan0', 'สิทธิ์': 'sit1', 'แพทย์': 'phaet2',
    'รถยนต์': 'rot3-yon0', 'เสาร์': 'sao4', 'ทัวร์': 'thua0', 'ลักษณ์': 'lak3',
    'สัมภาษณ์': 'sam4-phat2', 'อารมณ์': 'a0-rom0', 'จันทน์': 'chan0',
    'พยากรณ์': 'pha3-ya0-kon0', 'กษัตริย์': 'ka1-sat1', 'ปาฏิหาริย์': 'pa0-ti1-han4',
    'พระองค์': 'phra3-ong0', 'ประสงค์': 'pra1-song4', 'ท็อกซ์': 'thok3'
  },

  'ร หัน (รร)': {
    'ธรรม': 'tham0', 'กรรม': 'kam0', 'พรรค': 'phak3', 'สวรรค์': 'sa1-wan4',
    'บรรจุ': 'ban0-chu1', 'บรรจบ': 'ban0-chop1', 'ภรรยา': 'phan0-ya0',
    'สรรเสริญ': 'san4-soen4', 'พรรคพวก': 'phak3-phuak2', 'สร้างสรรค์': 'sang2-san4'
  },

  'ฤ ฦ': {
    'ฤดู': 'rue3-du0', 'อังกฤษ': 'ang0-krit1', 'ทฤษฎี': 'thrit3-sa1-di0',
    'พฤษภาคม': 'phruet3-sa1-pha0-khom0', 'วิกฤต': 'wi3-krit1', 'ฤกษ์': 'roek2',
    'พฤกษ์': 'phruek3', 'ดาวฤกษ์': 'dao0-roek2', 'ฤทธิ์': 'rit3'
  },

  'silent letters': {
    'บัตร': 'bat1', 'มิตร': 'mit3', 'เพชร': 'phet3', 'จักร': 'chak1',
    'สมัคร': 'sa1-mak1', 'สมุทร': 'sa1-mut1', 'สูตร': 'sut1', 'อากร': 'a0-kon0',
    'ชาติ': 'chat2', 'ญาติ': 'yat2', 'เหตุ': 'het1', 'ธาตุ': 'that2',
    'ประวัติ': 'pra1-wat1', 'บัญญัติ': 'ban0-yat1', 'เกียรติ': 'kiat1',
    'บัตรประชาชน': 'bat1-pra1-cha0-chon0', 'เหตุผล': 'het1-phon4'
  },

  'dictionary: linking syllables and irregular words': {
    'ราชการ': 'rat2-cha3-kan0', 'ข้าราชการ': 'kha2-rat2-cha3-kan0',
    'มหาราช': 'ma3-ha4-rat2', 'สวัสดี': 'sa1-wat1-di0',
    'วัฒนธรรม': 'wat3-tha3-na3-tham0', 'ภาพยนตร์': 'phap2-pha3-yon0',
    'คุณภาพ': 'khun0-na3-phap2', 'พัฒนา': 'phat3-tha3-na0',
    'กรรมการ': 'kam0-ma3-kan0', 'บริษัท': 'bo0-ri3-sat1', 'บริโภค': 'bo0-ri3-phok2',
    'สหกรณ์': 'sa1-ha1-kon0', 'ประวัติศาสตร์': 'pra1-wat1-ti1-sat1',
    'ธรรมชาติ': 'tham0-ma3-chat2', 'ศาสนา': 'sat1-sa1-na4',
    'ภูมิใจ': 'phum0-chai0', 'ภูมิภาค': 'phu0-mi3-phak2',
    'สุรชัย': 'su1-ra3-chai0', 'วรนุช': 'wo0-ra3-nut3'
  },

  'place names (RTGS)': {
    'กรุงเทพมหานคร': 'krung0-thep2-ma3-ha4-na3-khon0',
    'เชียงใหม่': 'chiang0-mai1', 'นครราชสีมา': 'na3-khon0-rat2-cha3-si4-ma0',
    'สุราษฎร์ธานี': 'su1-rat2-tha0-ni0', 'อุบลราชธานี': 'u1-bon0-rat2-cha3-tha0-ni0',
    'นนทบุรี': 'non0-tha3-bu1-ri0', 'สมุทรปราการ': 'sa1-mut1-pra0-kan0',
    'ฉะเชิงเทรา': 'cha1-choeng0-sao0', 'ขอนแก่น': 'khon4-kaen1',
    'พิษณุโลก': 'phit3-sa1-nu3-lok2', 'กาญจนบุรี': 'kan0-cha1-na3-bu1-ri0',
    'สุโขทัย': 'su1-kho4-thai0', 'นครศรีธรรมราช': 'na3-khon0-si4-tham0-ma3-rat2',
    'ร้อยเอ็ด': 'roi3-et1', 'บุรีรัมย์': 'bu1-ri0-ram0', 'สงขลา': 'song4-khla4',
    'ลำปาง': 'lam0-pang0', 'เพชรบุรี': 'phet3-cha3-bu1-ri0', 'ภูเก็ต': 'phu0-ket1',
    'สระแก้ว': 'sa1-kaeo2', 'สระบุรี': 'sa1-ra1-bu1-ri0'
  },

  'สระ: สะ-หระ (vowel) by default, สะ (pool) in fixed compounds': {
    'สระ': 'sa1-ra1', 'สระอา': 'sa1-ra1-a0', 'เสียงสระ': 'siang4-sa1-ra1',
    'สระว่ายน้ำ': 'sa1-wai2-nam3', 'สระน้ำ': 'sa1-nam3', 'จังหวัดสระแก้ว': 'chang0-wat1-sa1-kaeo2'
  },

  'running text (no spaces between words)': {
    'ผมอยากไปเที่ยวเชียงใหม่กับเพื่อน':
      'phom4-yak1-pai0-thiao2-chiang0-mai1-kap1-phuean2',
    'ร้านนี้อาหารอร่อยมากและราคาไม่แพง':
      'ran3-ni3-a0-han4-a1-roi1-mak2-lae3-ra0-kha0-mai2-phaeng0',
    'ยินดีที่ได้รู้จัก': 'yin0-di0-thi2-dai2-ru3-chak1',
    'ประเทศไทยมีประวัติศาสตร์อันยาวนาน':
      'pra1-thet2-thai0-mi0-pra1-wat1-ti1-sat1-an0-yao0-nan0',
    'จีบชนิดนี้': 'chip1-cha3-nit3-ni3',
    'อีกว่า': 'ik1-wa2',
    'นายทหารขึ้นรถ': 'nai0-tha3-han4-khuen2-rot3'
  },

  'ไม้ยมก': {
    'เด็กๆ': 'dek1-dek1', 'สบายๆ': 'sa1-bai0-sa1-bai0', 'ช้าๆ': 'cha3-cha3',
    'จริงๆ': 'ching0-ching0', 'ไปๆมาๆ': 'pai0-pai0-ma0-ma0'
  }
};
