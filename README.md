# ThaiRomanize

แปลงอักษรไทยเป็นอักษรโรมันตามหลัก **RTGS** (Royal Thai General System of Transcription) พร้อมเครื่องหมายวรรณยุกต์ — เป็น rule-based engine ล้วน ไม่มี dependency ไม่ต้องต่อเน็ต ใช้ได้ทั้งบนเบราว์เซอร์และ Node.js

🔗 **Live demo:** https://thai-roman.vercel.app

```
สวัสดีครับ ยินดีที่ได้รู้จัก  →  sà-wàt-di-khráp yin-di-thî-dâi-rú-chàk
```

## คุณสมบัติ

- แปลงอักษรไทยเป็นโรมันตามหลัก RTGS โดยวิเคราะห์พยัญชนะต้น อักษรควบ อักษรนำ สระ ตัวสะกด และวรรณยุกต์ ล้วนด้วยกฎภาษาศาสตร์ ไม่ใช่การจับคู่คำแบบตายตัวทั้งหมด
- คำนวณเสียงวรรณยุกต์ทั้ง 5 เสียง (สามัญ เอก โท ตรี จัตวา) จากหมู่อักษร (สูง/กลาง/ต่ำ) + คำเป็น-คำตาย + ความสั้น-ยาวของสระ
- มีพจนานุกรมคำยกเว้นในตัว ครอบคลุมคำยืมบาลี-สันสกฤตและคำที่มีตัวการันต์ซับซ้อนที่พบบ่อย (เช่น บริษัท, สวัสดี, กรุงเทพมหานคร)
- รองรับตัวเลขไทย (๐-๙), ไม้ยมก (ๆ), ข้อความปนภาษาอังกฤษ/ตัวเลข/เครื่องหมายวรรคตอน
- ปรับรูปแบบผลลัพธ์ได้อิสระ: เปิด/ปิดวรรณยุกต์, ตัวคั่นพยางค์ (ติดกัน/เว้นวรรค/ขีดกลาง), ตัวพิมพ์ใหญ่-เล็ก (พิมพ์เล็ก/ต้นประโยคใหญ่/ทุกพยางค์ใหญ่)
- ไม่มี dependency, ไฟล์เดียว (~20KB), รองรับทั้ง CommonJS (`require`) และ browser global (`<script>`)

## ติดตั้งใช้งาน

**วิธีที่ 1 — ใช้ผ่าน CDN (เร็วที่สุด ไม่ต้องติดตั้ง)**

```html
<script src="https://cdn.jsdelivr.net/gh/thetoui/ThaiRomanize@main/assets/js/thai-romanize.js"></script>
<script>
  console.log(ThaiRomanizer.romanize('สวัสดี').text); // sà-wàt-dii
</script>
```

**วิธีที่ 2 — ติดตั้งผ่าน npm ตรงจาก GitHub (สำหรับโปรเจกต์ Node.js)**

```bash
npm install github:thetoui/ThaiRomanize
```

```js
const ThaiRomanizer = require('thai-romanize');
console.log(ThaiRomanizer.romanize('สวัสดี').text); // sà-wàt-dii
```

**วิธีที่ 3 — ดาวน์โหลดไฟล์ไปใช้ตรงๆ**

ก็อปไฟล์ [`assets/js/thai-romanize.js`](assets/js/thai-romanize.js) ไปวางในโปรเจกต์แล้ว `<script src="...">` หรือ `require(...)` ได้เลย ไฟล์เดียวจบ ไม่มี dependency ให้ติดตั้งเพิ่ม

## การใช้งาน (API)

### `ThaiRomanizer.romanize(text, options?)`

แปลงข้อความ (ประโยคหรือคำ ยาวแค่ไหนก็ได้) เป็นอักษรโรมัน คืนค่าเป็น object:

```js
{
  text: string,       // ผลลัพธ์อักษรโรมัน
  syllables: number,  // จำนวนพยางค์ไทยที่แปลงได้
  detail: [           // รายละเอียดต่อคำ สำหรับ debug หรือประมวลผลต่อ
    { thai: 'สวัสดี', syls: [{ r: 'sa', t: 1 }, { r: 'wat', t: 1 }, { r: 'di', t: 0 }] }
  ]
}
```

**Options**

| ตัวเลือก    | ค่าที่รับได้                          | ค่าเริ่มต้น | ความหมาย |
|-------------|----------------------------------------|-------------|----------|
| `tone`      | `true` \| `false`                      | `true`      | ใส่/ไม่ใส่เครื่องหมายวรรณยุกต์ (à, á, â, ǎ) |
| `separator` | `'hyphen'` \| `'space'` \| `'join'`    | `'hyphen'`  | ตัวคั่นระหว่างพยางค์ในคำเดียวกัน |
| `case`      | `'lower'` \| `'sentence'` \| `'title'` | `'lower'`   | รูปแบบตัวพิมพ์ใหญ่-เล็ก |
| `mode`      | `'tones'` \| `'segmented'` \| `'plain'`| `'tones'`   | ทางลัดตั้งค่าทั้งสามข้างบนพร้อมกัน (ใช้แทน `tone`/`separator`/`case` ก็ได้ ถ้าไม่ต้องการความละเอียด) |

`tone` / `separator` / `case` เขียนพร้อมกันได้อิสระและมีผลเหนือค่าที่ `mode` ตั้งไว้เสมอ

**ตัวอย่างผลลัพธ์ทั้งหมดจาก "สวัสดี"**

```js
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'join',   case: 'lower'    }).text; // "sawatdi"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'join',   case: 'sentence' }).text; // "Sawatdi"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'join',   case: 'title'    }).text; // "SaWatDi"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'space',  case: 'lower'    }).text; // "sa wat di"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'space',  case: 'sentence' }).text; // "Sa wat di"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'space',  case: 'title'    }).text; // "Sa Wat Di"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'hyphen', case: 'lower'    }).text; // "sa-wat-di"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'hyphen', case: 'sentence' }).text; // "Sa-wat-di"
ThaiRomanizer.romanize('สวัสดี', { tone: false, separator: 'hyphen', case: 'title'    }).text; // "Sa-Wat-Di"

ThaiRomanizer.romanize('สวัสดี').text;                       // "sà-wàt-di"   (ค่าเริ่มต้น: มีวรรณยุกต์)
ThaiRomanizer.romanize('สวัสดี', { mode: 'plain' }).text;     // "sawatdi"     (RTGS มาตรฐาน ไม่มีวรรณยุกต์ ไม่มีขีดคั่น)
```

ข้อความที่มีภาษาอังกฤษ ตัวเลข หรือเครื่องหมายวรรคตอนปนอยู่จะถูกคงไว้ตามเดิม ไม่ถูกแปลง:

```js
ThaiRomanizer.romanize('Hello สวัสดี World 123').text; // "Hello sà-wàt-di World 123"
```

### `ThaiRomanizer.romanizeWord(word)`

แปลงคำเดียวแบบ low-level คืนค่าเป็น array ของพยางค์ `{ r, t, cls }` (r = เสียงโรมัน, t = เลขวรรณยุกต์ 0-4, cls = หมู่อักษร) โดยไม่ผ่านการจัดรูปแบบ (tone mark / separator / case) — ใช้ตอนต้องการประมวลผลระดับพยางค์เอง

### `ThaiRomanizer.applyTone(roman, tone)`

ใส่เครื่องหมายวรรณยุกต์ให้พยางค์โรมัน 1 พยางค์ เช่น `applyTone('a', 1)` → `'à'`

### ค่าคงที่

- `TONE_NAMES_EN` — `['mid', 'low', 'falling', 'high', 'rising']`
- `TONE_NAMES_TH` — `['สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา']`
- `version`

## ข้อจำกัด

ระบบเป็น rule-based ครอบคลุมคำส่วนใหญ่ในภาษาไทยได้แม่นยำ แต่:

- คำพ้องรูปที่อ่านออกเสียงต่างกันตามบริบท (เช่น คำที่มีตัวการันต์ซับซ้อนบางคำ) อาจแปลงผิดได้บ้าง หากพบให้เพิ่มเข้าไปในพจนานุกรมคำยกเว้น (`DICT`) ในไฟล์ `thai-romanize.js`
- ไม่มีการตัดคำ (word segmentation) แบบ NLP เต็มรูปแบบ ใช้ฮิวริสติกส์ + พจนานุกรมช่วยหาขอบเขตพยางค์เท่านั้น

## โครงสร้างโปรเจกต์

```
index.html               หน้าเว็บเครื่องมือแปลงอักษร (ใช้ ThaiRomanizer)
assets/js/thai-romanize.js   engine หลัก — ไฟล์เดียว ใช้เป็นไลบรารีแยกได้อิสระ
assets/js/app.js         โค้ดเชื่อม UI ↔ engine ของหน้าเว็บ
assets/css/style.css     สไตล์หน้าเว็บ
```

## License

MIT — ใช้งาน แก้ไข แจกต่อได้อิสระ ดู [LICENSE](LICENSE)

## เครดิต

จัดทำโดย [เดอะทุย](https://www.facebook.com/AroundTheThui)
