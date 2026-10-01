# Plan: รายงานจุดน้ำท่วมจากผู้ใช้

- Intent: [docs/intent/flood-reports.md](../intent/flood-reports.md)
- Spec: [docs/specs/flood-reports.md](../specs/flood-reports.md)
- ทำตามลำดับขั้น ขั้นที่ 0 ต้องเสร็จก่อนเริ่มเขียนโค้ด
- ตั้งแต่ขั้นที่ 3 ให้เขียน test จาก acceptance criteria ก่อน แล้วจึงเขียนโค้ดให้ผ่าน

## ขั้นที่ 0: ตัดสินเรื่องที่ค้างจากการรีวิว spec (บล็อกการเขียนโค้ด)

- [ ] จุดสังเกตที่มีบ้านเลขที่ ตอนนี้ขัดกับ security-baseline ข้อ "never return exact address" ต้องเลือกว่าจะตรวจแล้วปฏิเสธ หรือยอมรับความเสี่ยงไว้ใน spec
- [ ] การเก็บ IP ขัดกับ intent ที่บอกว่า "รายงานไม่ผูกกับตัวตนใคร" ต้องเลือกว่าจะแก้ intent หรือแก้ spec
- [ ] `reportCount` นับจำนวนรายงาน หรือนับจำนวน IP ที่ไม่ซ้ำ
- [ ] ยืนยันความยาวจุดสังเกต 100 ตัวอักษร และเลือกวิธีนับ (code unit, code point หรือ grapheme) ตอนนี้ยังเป็นค่าที่ Claude เสนอเอง
- [ ] ยืนยันค่าที่ Claude จะเสนอสำหรับข้อกำกวมที่เหลือในรีวิว
  - [ ] รูปแบบ `seenAt` ที่รับได้ (กำหนดเป็น regex)
  - [ ] เมื่อไรจะลบรายงานและ IP ที่หมดอายุ รวมถึงลบ key ใน `RateLimiter`
  - [ ] การจำกัดจำนวนนับคำขอที่ได้ 429 และ JSON ที่ parse ไม่ได้ด้วยหรือไม่ และขอบ 10 นาทีพอดีนับรวมหรือไม่
  - [ ] ถ้าไม่รู้ IP (`remoteAddress` เป็น `undefined`) จะทำอย่างไร และจะรวม `::ffff:` กับ IPv4 เป็น IP เดียวกันหรือไม่
  - [ ] อักขระที่ห้ามใส่ในจุดสังเกต เช่น ขึ้นบรรทัดใหม่ อักขระควบคุม และ zero-width
  - [ ] การตรวจเบอร์โทรรองรับเลขไทยและวงเล็บ
  - [ ] ขนาดสูงสุดของ body ใน `server.ts`
  - [ ] ลำดับการเรียงเมื่อ `seenAt` เท่ากัน และ `landmark` ที่แสดงของกลุ่มที่รวมแล้ว
  - [ ] ใส่ `source` และ `reportsNotice` ใน response ของ `POST /reports` ด้วย
  - [ ] เลือก `console` method และรูปแบบ log
  - [ ] ตัด `id` ออกจาก response ของ `POST /reports` หรือคงไว้

## ขั้นที่ 1: อัปเดตเอกสารให้ตรงกัน

- [ ] แก้ `docs/specs/flood-reports.md` ตามผลของขั้นที่ 0 และลบข้อความที่อ้างว่าตัวเลขทุกตัวผ่านการยืนยันแล้ว
- [ ] แก้ `docs/intent/flood-reports.md`
  - [ ] หัวเอกสาร
  - [ ] เอาป้าย "(สมมติฐาน)" ออกจากข้อที่ตัดสินแล้ว
  - [ ] ปิด Open questions ข้อ 1–6, 8 และ 9
  - [ ] แก้ส่วนวัดผลเรื่อง "เวลาในอนาคต" ให้ตรงกับ spec ที่ยอมให้ล่วงหน้าได้ 5 นาที
- [ ] ตัดสินว่าจะวัดผลตาม intent อย่างไร (ค่ามัธยฐานของช่วงห่างระหว่างเวลาที่เห็นกับเวลาที่ส่ง และสัดส่วนเขตที่มีรายงาน) ถ้าจะวัด ให้เพิ่มเป็น requirement ใน spec ถ้าไม่วัด ให้ย้ายไป Out of scope

## ขั้นที่ 2: เตรียมสภาพแวดล้อม

- [ ] ทำให้ `node` อยู่ใน PATH (ตอนนี้ยังหาไม่เจอ) แล้วรัน `npm install`
- [ ] รัน `npm test` และ `npm run lint` บน `main` ให้ผ่านก่อนแก้อะไร
- [ ] แก้ `.gitignore` ให้ ignore `.claude/*` ยกเว้น `.claude/skills/security-baseline/` เพื่อให้ commit skill ได้
- [ ] commit `CLAUDE.md`, `docs/` และ skill `security-baseline` ก่อนเริ่มเขียนโค้ด

## ขั้นที่ 3: ฟังก์ชันพื้นฐานใน `src/reports.ts`

- [ ] `severityFor` ตาม RPT-REQ-010
- [ ] `normalizeLandmark` ตาม RPT-REQ-012 AC2 และ AC5
- [ ] `validateReport` ทีละ field ตามลำดับ RPT-REQ-007 AC3
  - [ ] รูปแบบ body (RPT-REQ-007 AC1)
  - [ ] `districtId` (RPT-REQ-002)
  - [ ] `landmark` ความยาว (RPT-REQ-003)
  - [ ] `landmark` ห้ามมีเบอร์โทร (RPT-REQ-004)
  - [ ] `depthCm` (RPT-REQ-005)
  - [ ] `seenAt` รูปแบบ ช่วงเวลา และการแปลงเป็น UTC (RPT-REQ-006)
  - [ ] ไม่สนใจและไม่เก็บ field ที่ไม่รู้จัก (RPT-REQ-007 AC2)

## ขั้นที่ 4: ที่เก็บข้อมูลและการจำกัดจำนวน

- [ ] `RateLimiter` ใน `src/rateLimit.ts` ตาม RPT-REQ-008 รวมการลบ timestamp และ key เก่าทิ้ง
- [ ] `ReportStore.add` เก็บ `ip` และ `receivedAt` (RPT-REQ-001 AC4)
- [ ] ลบรายงานที่หมดอายุพร้อม IP (RPT-REQ-011 และ edge case 15)
- [ ] `ReportStore.activeIn` กรองรายงานที่หมดอายุ รวมรายงานซ้ำ คำนวณ `reportCount` และเรียงลำดับ (RPT-REQ-011 และ 012)

## ขั้นที่ 5: เชื่อมเข้า API

- [ ] ขยาย `Context` ใน `src/app.ts` เพิ่ม `ip`, `reports` และ `limiter` แบบ optional
- [ ] เพิ่ม route `POST /reports` ทำงานตามลำดับ rate limit → validate → add → log → 201 (RPT-REQ-001, 007, 008 และ 014)
- [ ] log เฉพาะ `id` และ `districtId` (RPT-REQ-013)
- [ ] เพิ่ม `reports` และ `reportsNotice` ใน `GET /districts/:id` (RPT-REQ-009)
- [ ] `src/server.ts` ส่ง `ip` จาก `req.socket.remoteAddress` และจำกัดขนาด body ตามที่ตัดสินในขั้นที่ 0
- [ ] test ระดับ route ใน `tests/app.test.ts` โดยไม่แก้ test เดิม

## ขั้นที่ 6: ตรวจก่อนส่ง

- [ ] edge cases 1–15 ใน spec มี test ครบทุกข้อ
- [ ] `npm test` และ `npm run lint` ผ่าน และ test เดิมไม่ถูกแก้ (RPT-REQ-015)
- [ ] ค้นหา `rooptanjai` ในโค้ดแล้วไม่พบ (RPT-REQ-015 AC3)
- [ ] รีวิว diff เทียบกับ security-baseline ทีละข้อ
- [ ] เพิ่มตัวอย่าง `curl -X POST localhost:3000/reports` ใน `README.md`
- [ ] ลองรันจริงด้วย `npm run dev`
  - [ ] ส่งรายงาน 1 รายการ
  - [ ] ดูผลใน `GET /districts/:id`
  - [ ] ส่งเกิน 5 ครั้งแล้วได้ 429
