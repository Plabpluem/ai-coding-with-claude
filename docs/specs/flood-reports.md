# Spec: รายงานจุดน้ำท่วมจากผู้ใช้

- Intent: [docs/intent/flood-reports.md](../intent/flood-reports.md)
- ออกแบบภายใต้ [security-baseline](../../.claude/skills/security-baseline/SKILL.md)
- ตัวเลขทุกตัวในเอกสารนี้เจ้าของฟีเจอร์ยืนยันแล้ว เว้นแต่จะเขียนว่า "การตัดสินใจทางเทคนิค"

## สรุปการตัดสินใจ

| เรื่อง | ค่าที่ใช้ |
| ------ | -------- |
| ผู้อ่านหลัก | คนที่เข้ามาใช้งานแอป |
| การเผยแพร่ | แสดงทันที ไม่ต้องมีคนตรวจก่อน |
| จุดสังเกต | ข้อความอิสระ 1–100 ตัวอักษร ถ้าพบรูปแบบเบอร์โทรจะตอบ 400 |
| ความลึก | จำนวนเต็ม 1–300 ซม. |
| เวลาที่เห็น (`seenAt`) | ย้อนหลังได้ไม่เกิน 3 ชั่วโมง และล่วงหน้าได้ไม่เกิน 5 นาที |
| การหมดอายุ | 3 ชั่วโมงหลัง `seenAt` |
| รายงานซ้ำ | รวมรายงานที่ยังไม่หมดอายุซึ่งมีเขตเดียวกันและจุดสังเกตเหมือนกันหลัง normalize |
| จำกัดจำนวน | 5 ครั้งต่อ 10 นาทีต่อ IP |
| ที่เก็บข้อมูล | ในหน่วยความจำ หายเมื่อ restart |
| IP ผู้รายงาน | เก็บไว้กับรายงานแต่ละรายการ ห้ามส่งออกหรือ log และลบทิ้งพร้อมรายงานเมื่อหมดอายุ |
| กฎบริษัท | ไม่มีกฎเพิ่มเติมนอกจาก security-baseline |
| ระดับความรุนแรง | 3 ระดับตามคู่มือ: 1–20, 21–50 และมากกว่า 50 ซม. |

## Requirements

### RPT-REQ-001 ส่งรายงาน

ผู้ใช้ส่งรายงานผ่าน `POST /reports` โดยส่ง `districtId`, `landmark`, `depthCm` และ `seenAt`

- **AC1:** ถ้าข้อมูลถูกต้องทุกช่อง ระบบตอบ 201 พร้อม `{ notice, report: { id, districtId, landmark, depthCm, severity, seenAt } }`
  - `seenAt` แสดงเป็นเวลากรุงเทพฯ เช่น `"2026-09-30T19:00:00+07:00"`
  - `landmark` เป็นค่าหลัง trim
- **AC2:** `id` ไม่ซ้ำกันระหว่างรายงาน
- **AC3:** หลังได้ 201 แล้ว รายงานนั้นปรากฏใน `GET /districts/:districtId` ทันที (ตาม RPT-REQ-009)
- **AC4:** รายงานใน store มี `ip` เท่ากับ `ctx.ip` ของคำขอนั้น แต่ไม่มี `ip` ใน response ของ `POST /reports`

### RPT-REQ-002 ตรวจเขต

- **AC1:** ถ้า `districtId` ไม่ใช่ string หรือไม่อยู่ใน `districts` ของ `src/districts.ts` ระบบตอบ 400 พร้อม `{ error: "invalid districtId" }`

### RPT-REQ-003 ตรวจจุดสังเกต

- **AC1:** `landmark` ต้องเป็น string
- **AC2:** หลัง trim แล้วต้องยาว 1–100 ตัวอักษร โดยนับด้วย `String.length` ถ้าไม่ผ่านระบบตอบ 400 พร้อม `{ error: "invalid landmark" }`
- **AC3:** `"ซอยลาดพร้าว 101"` ผ่าน
- **AC4:** `"   "` (มีแต่ช่องว่าง) ไม่ผ่าน
- **AC5:** ข้อความยาว 100 ตัวอักษรผ่าน แต่ 101 ตัวอักษรไม่ผ่าน

### RPT-REQ-004 ปฏิเสธจุดสังเกตที่มีเบอร์โทร

ถ้าตัดช่องว่าง ขีด (`-`) และจุด (`.`) ออกจาก `landmark` แล้วพบตัวเลขติดกันตั้งแต่ 9 หลักขึ้นไป ระบบตอบ 400 พร้อม `{ error: "landmark must not contain a phone number" }`

- **AC1:** `"หน้าร้าน โทร 081-234-5678"` ไม่ผ่าน
- **AC2:** `"0812345678"`, `"02 123 4567"` และ `"081.234.5678"` ไม่ผ่าน
- **AC3:** `"ซอย 101 แยก 7"` และ `"ถนนพหลโยธิน กม. 12"` ผ่าน

### RPT-REQ-005 ตรวจความลึก

- **AC1:** `depthCm` ต้องเป็น number ที่ `Number.isInteger` เป็นจริง และอยู่ในช่วง 1–300 ถ้าไม่ผ่านระบบตอบ 400 พร้อม `{ error: "invalid depthCm" }`
- **AC2:** `1` และ `300` ผ่าน
- **AC3:** `0`, `301`, `-5`, `25.5`, `"25"`, `null` และ `NaN` ไม่ผ่าน

### RPT-REQ-006 ตรวจเวลาที่เห็น

- **AC1:** `seenAt` ต้องเป็น string รูปแบบ ISO 8601 ที่ระบุ timezone (`Z` หรือ `±HH:MM`) ถ้าไม่ระบุ timezone เช่น `"2026-09-30T19:00:00"` ระบบตอบ 400 เพราะตีความได้สองแบบ
- **AC2:** ถ้า `ctx.now − 3 ชม. ≤ seenAt ≤ ctx.now + 5 นาที` ผ่าน ทั้งสองขอบเป็นค่ารวม
- **AC3:** `seenAt` ที่เก่ากว่า `ctx.now` 3 ชั่วโมง 1 วินาทีไม่ผ่าน
- **AC4:** `seenAt` ที่ล่วงหน้า `ctx.now` 5 นาที 1 วินาทีไม่ผ่าน
- **AC5:** ระบบเก็บ `seenAt` เป็น UTC ส่ง `"2026-09-30T19:00:00+07:00"` แล้วต้องเก็บเป็น `2026-09-30T12:00:00Z`
- ทุกกรณีที่ไม่ผ่าน ระบบตอบ 400 พร้อม `{ error: "invalid seenAt" }`

### RPT-REQ-007 รูปแบบ body

- **AC1:** ถ้า body ไม่ใช่ object (เช่น `undefined`, `null`, array หรือ string) ระบบตอบ 400 พร้อม `{ error: "body must be a JSON object" }`
- **AC2:** field ที่ไม่รู้จัก เช่น `phone` หรือ `name` ระบบจะไม่สนใจ ไม่เก็บ ไม่ log และไม่ส่งกลับใน response ใดๆ
- **AC3:** ถ้ามีหลาย field ผิดพร้อมกัน ระบบตอบ error ของ field แรกตามลำดับ `districtId`, `landmark`, `depthCm`, `seenAt` (การตัดสินใจทางเทคนิค: ทำให้ test แน่นอน)

### RPT-REQ-008 จำกัดจำนวนต่อ IP

- **AC1:** แต่ละ IP ส่ง `POST /reports` ได้ไม่เกิน 5 ครั้งในช่วง 10 นาทีย้อนหลังจาก `ctx.now` (sliding window) ครั้งที่ 6 ระบบตอบ 429 พร้อม `{ error: "too many reports, try again later" }`
- **AC2:** ระบบนับทุกครั้งที่เรียก รวมครั้งที่ได้ 400 ด้วย (การตัดสินใจทางเทคนิค: กันการลองยิงข้อมูลไม่ถูกต้องซ้ำๆ) ระบบตรวจข้อนี้ก่อนตรวจ body
- **AC3:** เมื่อครั้งแรกผ่านไปเกิน 10 นาที IP เดิมส่งได้อีก
- **AC4:** IP อื่นไม่ได้รับผลกระทบ
- **AC5:** ไม่มี IP อยู่ใน log หรือ response ใดๆ

### RPT-REQ-009 แสดงรายงานในหน้าเขต

`GET /districts/:id` เพิ่ม field ต่อไปนี้ โดย field เดิมทั้งหมดยังเหมือนเดิม

```json
{
  "reportsNotice": "รายงานจากผู้ใช้ ยังไม่ได้ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ",
  "reports": [
    {
      "source": "user-reported",
      "landmark": "แยกรัชโยธิน",
      "depthCm": 35,
      "severity": 2,
      "seenAt": "2026-09-30T19:00:00+07:00",
      "reportCount": 3
    }
  ]
}
```

- **AC1:** ทุก response มี `reportsNotice` และทุกรายการมี `source: "user-reported"` แม้ `reports` จะว่าง ทั้งนี้ `notice` เดิมยังอยู่
- **AC2:** แสดงเฉพาะรายงานของเขตนั้นที่ยังไม่หมดอายุ (ตาม RPT-REQ-011)
- **AC3:** เรียงตาม `seenAt` จากใหม่ไปเก่า
- **AC4:** `seenAt` แสดงเป็นเวลากรุงเทพฯ ผ่าน `toBangkokIso`
- **AC5:** ไม่มี `id` ของรายงานย่อยหรือ IP ใน response
- **AC6:** เขตที่ไม่มีสถานีวัด (`sai-mai`) ก็แสดงรายงานได้

### RPT-REQ-010 ระดับความรุนแรง

ฟังก์ชัน `severityFor(depthCm)` คืนค่า 1 เมื่อ 1–20 ซม., 2 เมื่อ 21–50 ซม. และ 3 เมื่อมากกว่า 50 ซม.

- **AC1:** `1 → 1`, `20 → 1`, `21 → 2`, `25 → 2`, `50 → 2`, `51 → 3`, `300 → 3`

### RPT-REQ-011 หมดอายุ

- **AC1:** รายงานแสดงเมื่อ `ctx.now ≤ seenAt + 3 ชม.` และหายไปเมื่อ `ctx.now` เกินจุดนั้นแม้เพียง 1 มิลลิวินาที
- **AC2:** การหมดอายุใช้ `ctx.now` ไม่ใช่นาฬิกาเครื่อง จึงเขียน test ได้โดยไม่ต้องรอเวลาจริง

### RPT-REQ-012 รวมรายงานซ้ำ

- **AC1:** รายงานที่ยังไม่หมดอายุซึ่งมี `districtId` เดียวกันและ `normalizeLandmark(landmark)` เท่ากัน จะแสดงเป็นรายการเดียว
- **AC2:** `normalizeLandmark` ทำตามลำดับนี้
  1. NFC normalize
  2. trim
  3. ยุบช่องว่างที่ติดกันให้เหลือช่องเดียว
  4. แปลงเป็นตัวพิมพ์เล็ก
- **AC3:** รายการที่รวมแล้วใช้ `landmark`, `depthCm` และ `seenAt` จากรายงานที่ `seenAt` ใหม่ที่สุด ถ้า `seenAt` เท่ากันให้ใช้รายงานที่ส่งเข้ามาทีหลัง
- **AC4:** `reportCount` คือจำนวนรายงานที่ยังไม่หมดอายุในกลุ่ม
- **AC5:** `"แยกรัชโยธิน"` กับ `"  แยกรัชโยธิน "` รวมกัน และ `"Central Ladprao"` กับ `"central  ladprao"` รวมกัน
- **AC6:** ถ้ารายงานในกลุ่มหมดอายุบางส่วน ระบบคำนวณจากรายงานที่เหลือ ถ้าหมดอายุทั้งกลุ่ม รายการนั้นหายไป
- **AC7:** จุดสังเกตเดียวกันแต่อยู่คนละเขต ไม่รวมกัน

### RPT-REQ-013 ไม่มีข้อมูลส่วนบุคคลใน log

- **AC1:** เมื่อรับรายงาน ระบบ log ได้เฉพาะ `report id` และ `districtId`
- **AC2:** ห้าม log `landmark`, IP หรือ body ดิบ
- **AC3:** test ดัก `console.*` แล้วยืนยันว่าไม่มี landmark หรือ IP ที่ส่งเข้าไปปรากฏในข้อความ log

### RPT-REQ-014 error ไม่สะท้อน input

- **AC1:** response ที่เป็น 400 และ 429 มีเฉพาะ `{ error }` ที่เป็นข้อความคงที่จาก requirement ข้างบน ห้ามนำค่าที่ผู้ใช้ส่งมาใส่ในข้อความ

### RPT-REQ-015 ของเดิมไม่พัง

- **AC1:** test เดิมใน `tests/app.test.ts` และ `tests/time.test.ts` ผ่านโดยไม่ต้องแก้
- **AC2:** `npm run lint` ผ่าน
- **AC3:** ไม่มีโค้ดใดเรียก `flood-api.rooptanjai.com`

## Design

### Data model (`src/reports.ts`)

```ts
export type FloodReport = {
  id: string            // crypto.randomUUID()
  districtId: string
  landmark: string      // หลัง trim, ใช้แสดงผล
  landmarkKey: string   // normalizeLandmark(landmark), ใช้รวมรายงานซ้ำ
  depthCm: number       // จำนวนเต็ม 1–300
  seenAt: Date          // UTC
  receivedAt: Date      // ctx.now ตอนรับ, ใช้ตัดสินกรณี seenAt เท่ากัน
  ip: string            // ctx.ip ตอนรับ ห้ามส่งออกหรือ log ลบทิ้งพร้อมรายงานเมื่อหมดอายุ
}

export type ReportInput = { districtId: string; landmark: string; depthCm: number; seenAt: Date }

export type ReportView = {
  source: "user-reported"
  landmark: string
  depthCm: number
  severity: 1 | 2 | 3
  seenAt: string        // toBangkokIso
  reportCount: number
}
```

**ฟังก์ชันใน `src/reports.ts`:**
- `validateReport(body: unknown, now: Date): { ok: true; value: ReportInput } | { ok: false; error: string }` ตรวจตาม RPT-REQ-002 ถึง 007
- `severityFor(depthCm: number): 1 | 2 | 3` ตาม RPT-REQ-010
- `normalizeLandmark(s: string): string` ตาม RPT-REQ-012
- `class ReportStore` มีเมธอดดังนี้
  - `add(input, ip, now): FloodReport` เพิ่มรายงานและลบรายงานที่หมดอายุทิ้ง (รวมถึง IP ของรายงานนั้น)
  - `activeIn(districtId, now): ReportView[]` กรองรายงานที่หมดอายุ รวมรายงานซ้ำ แล้วเรียงลำดับ

**`src/rateLimit.ts`:**
- `class RateLimiter` รับ `limit = 5` และ `windowMs = 10 * 60 * 1000`
- เมธอด `hit(key: string, now: Date): boolean` คืน `false` เมื่อเกินจำนวนที่กำหนด
- เก็บ `Map<ip, number[]>` แบบ timestamp และลบค่าที่เก่ากว่า window ทิ้งทุกครั้งที่เรียก

ระบบเก็บข้อมูลทั้งหมดในหน่วยความจำ ไม่มีไฟล์และไม่มีฐานข้อมูล

### Context ของ `handle()`

```ts
export type Context = {
  now: Date
  ip?: string             // ใหม่ ถ้าไม่ส่งมาจะใช้ "unknown"
  reports?: ReportStore   // ใหม่ ถ้าไม่ส่งมาจะใช้ instance กลางของ module
  limiter?: RateLimiter   // ใหม่ ถ้าไม่ส่งมาจะใช้ instance กลางของ module
}
```

field ใหม่เป็น optional เพื่อให้ test เดิมที่ส่งแค่ `{ now }` ยังผ่าน (RPT-REQ-015) ส่วน test ใหม่จะส่ง store และ limiter ตัวใหม่ทุกครั้ง เพื่อไม่ให้ state รั่วข้าม test

### API

| Method | Path | การเปลี่ยนแปลง | Status |
| ------ | ---- | -------------- | ------ |
| POST | `/reports` | ใหม่ | 201, 400, 429 |
| GET | `/districts/:id` | เพิ่ม `reportsNotice` และ `reports` | 200, 404 (เหมือนเดิม) |
| GET | `/districts` | ไม่เปลี่ยน | 200 |

เลือก `POST /reports` ที่รับ `districtId` ใน body แทน `POST /districts/:id/reports` เพราะ intent กำหนดให้เขตที่ไม่รู้จักตอบ 400 (ข้อมูลไม่ถูกต้อง) ไม่ใช่ 404

**ลำดับการทำงานของ `POST /reports`:**
1. `limiter.hit(ip)` ถ้าเกินจำนวนตอบ 429
2. `validateReport(body, now)` ถ้าไม่ผ่านตอบ 400
3. `reports.add(...)`
4. log `{ id, districtId }`
5. ตอบ 201

ส่วน JSON ที่ parse ไม่ได้ `server.ts` ตอบ 400 ไปก่อนแล้วตามเดิม

### ไฟล์ที่ต้องแก้

| ไฟล์ | สิ่งที่ทำ |
| ---- | -------- |
| `src/reports.ts` | **ใหม่** มี type, `validateReport`, `severityFor`, `normalizeLandmark` และ `ReportStore` |
| `src/rateLimit.ts` | **ใหม่** มี `RateLimiter` |
| `src/app.ts` | เพิ่ม route `POST /reports` เพิ่ม `reports` และ `reportsNotice` ใน `GET /districts/:id` และขยาย `Context` |
| `src/server.ts` | ส่ง `ip: req.socket.remoteAddress` เข้าไปใน `handle()` โดยไม่อ่าน `X-Forwarded-For` |
| `tests/reports.test.ts` | **ใหม่** unit test ของ validate, severity, normalize, store และ rate limiter |
| `tests/app.test.ts` | เพิ่ม test ระดับ route โดยไม่แก้ test เดิม |
| `README.md` | เพิ่มตัวอย่าง `curl -X POST localhost:3000/reports` |

ไฟล์ที่ห้ามแก้: `data/stations.json`, `src/districts.ts`, `src/stations.ts` และ `src/time.ts`

## Edge cases

| # | กรณี | ผลที่คาดหวัง | อ้างอิง |
| - | ---- | ------------ | ------- |
| 1 | จุดสังเกตมีเบอร์โทรแบบมีขีด เช่น `"โทร 081-234-5678"` | 400 และไม่ log ข้อความนั้น | REQ-004, 013 |
| 2 | จุดสังเกตมีตัวเลขที่ไม่ใช่เบอร์โทร เช่น `"ซอย 101"` | 201 | REQ-004 |
| 3 | `depthCm` เป็น `25.5`, `"25"` หรือ `0` | 400 | REQ-005 |
| 4 | `seenAt` ไม่มี timezone เช่น `"2026-09-30T19:00:00"` | 400 | REQ-006 |
| 5 | `seenAt` เก่า 3 ชม. พอดี | 201 แสดงผล ณ `now` เดียวกัน และหายไปเมื่อ `now` เพิ่มขึ้น 1 ms | REQ-006, 011 |
| 6 | `seenAt` ล่วงหน้า 4 นาที (นาฬิกาเครื่องเร็ว) | 201 และหมดอายุนับจาก `seenAt` ที่ส่งมา | REQ-006, 011 |
| 7 | ส่งครั้งที่ 6 ใน 10 นาทีจาก IP เดียว โดย 2 ครั้งก่อนหน้าได้ 400 | 429 | REQ-008 |
| 8 | ส่ง field `phone` มาด้วย | 201 แต่ไม่มี `phone` ใน store, log หรือ response | REQ-007 |
| 9 | รายงานสองรายการที่ต่างกันแค่ช่องว่างหรือตัวพิมพ์ | รวมเป็น 1 รายการ `reportCount: 2` และใช้ข้อมูลจากรายงานล่าสุด | REQ-012 |
| 10 | กลุ่มรายงานซ้ำที่รายงานล่าสุดยังอยู่ แต่รายงานแรกหมดอายุแล้ว | `reportCount` ลดลง | REQ-012 |
| 11 | จุดสังเกตเดียวกันแต่คนละเขต | ไม่รวมกัน | REQ-012 |
| 12 | เขตที่ไม่มีสถานีวัด (`sai-mai`) | ได้ `stations: []` และ `reports` ตามที่มี | REQ-009 |
| 13 | body เป็น `null`, `[]` หรือไม่มี body | 400 | REQ-007 |
| 14 | `landmark` มีแต่ช่องว่าง หรือยาว 101 ตัวอักษร | 400 | REQ-003 |
| 15 | รายงานหมดอายุแล้วถูกลบเมื่อมีรายงานใหม่เข้ามา | IP ของรายงานเก่าไม่อยู่ใน store อีกต่อไป | REQ-001 |

## Out of scope

**ไม่ทำในรอบนี้:**
- การตรวจหรืออนุมัติรายงานก่อนเผยแพร่ ปุ่มแจ้งว่ารายงานเป็นเท็จ และการลบรายงานโดยผู้ดูแล
- การเก็บข้อมูลถาวร (ไฟล์หรือฐานข้อมูล) ซึ่งหมายความว่ารายงานจะหายเมื่อ restart
- การรายงานว่าน้ำลดแล้ว (ความลึก 0)
- พิกัดหรือแผนที่ และรายการจุดสังเกตที่กำหนดไว้ล่วงหน้า
- การตรวจจับบ้านเลขที่หรือชื่อคนในจุดสังเกต ตรวจเฉพาะเบอร์โทร
- ระบบ login หรือตัวตนผู้รายงาน
- การอ่าน `X-Forwarded-For` เมื่ออยู่หลัง proxy
- การจำกัดจำนวนรายงานรวมทั้งระบบ (มีเฉพาะต่อ IP)
- เขตอีก 38 เขตที่ยังไม่มีใน `src/districts.ts`
- หน้าเว็บหรือ UI (repo นี้มีแค่ API)
- การเชื่อมต่อกับระบบภายนอกทุกชนิด โดยเฉพาะ `flood-api.rooptanjai.com`
- การใช้ IP ที่เก็บไว้ไปทำอย่างอื่น เช่น บล็อก IP หรือค้นรายงานตาม IP
