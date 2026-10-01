import { describe, expect, it } from "vitest"
import { RateLimiter } from "../src/rateLimit.ts"
import { normalizeLandmark, ReportStore, severityFor, validateReport, type ReportInput } from "../src/reports.ts"

const now = new Date("2026-09-30T12:00:00Z")
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

const valid = {
  districtId: "lat-phrao",
  landmark: "แยกรัชโยธิน",
  depthCm: 25,
  seenAt: "2026-09-30T18:30:00+07:00"
}

function errorFor(body: unknown, at: Date = now): string | undefined {
  const result = validateReport(body, at)
  return result.ok ? undefined : result.error
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    districtId: "lat-phrao",
    landmark: "แยกรัชโยธิน",
    depthCm: 25,
    seenAt: new Date("2026-09-30T11:30:00Z"),
    ...overrides
  }
}

describe("severityFor (RPT-REQ-010)", () => {
  it.each([
    [1, 1],
    [20, 1],
    [21, 2],
    [25, 2],
    [50, 2],
    [51, 3],
    [300, 3]
  ])("%i cm is level %i", (depthCm, level) => {
    expect(severityFor(depthCm)).toBe(level)
  })
})

describe("normalizeLandmark (RPT-REQ-012 AC2)", () => {
  it("trims, collapses whitespace and lower-cases", () => {
    expect(normalizeLandmark("  แยกรัชโยธิน ")).toBe(normalizeLandmark("แยกรัชโยธิน"))
    expect(normalizeLandmark("Central Ladprao")).toBe(normalizeLandmark("central  ladprao"))
  })

  it("applies NFC so composed and decomposed forms match", () => {
    expect(normalizeLandmark("Café")).toBe(normalizeLandmark("Café"))
  })

  it("keeps a single space between words (does not remove it)", () => {
    expect(normalizeLandmark("แยก รัชโยธิน")).not.toBe(normalizeLandmark("แยกรัชโยธิน"))
  })
})

describe("validateReport", () => {
  it("accepts a valid report, trims the landmark and stores seenAt in UTC (RPT-REQ-006 AC5)", () => {
    const result = validateReport({ ...valid, landmark: "  แยกรัชโยธิน  " }, now)
    expect(result).toEqual({
      ok: true,
      value: {
        districtId: "lat-phrao",
        landmark: "แยกรัชโยธิน",
        depthCm: 25,
        seenAt: new Date("2026-09-30T11:30:00Z")
      }
    })
  })

  describe("body shape (RPT-REQ-007)", () => {
    it.each([[undefined], [null], [[]], ["text"], [42]])("rejects %j", (body) => {
      expect(errorFor(body)).toBe("body must be a JSON object")
    })

    it("drops unknown fields such as phone and name", () => {
      const result = validateReport({ ...valid, phone: "0812345678", name: "สมชาย" }, now)
      expect(result.ok).toBe(true)
      if (result.ok) expect(Object.keys(result.value).sort()).toEqual(["depthCm", "districtId", "landmark", "seenAt"])
    })

    it("reports the first invalid field in order districtId, landmark, depthCm, seenAt", () => {
      expect(errorFor({ districtId: "x", landmark: "", depthCm: 0, seenAt: "" })).toBe("invalid districtId")
      expect(errorFor({ ...valid, landmark: "", depthCm: 0, seenAt: "" })).toBe("invalid landmark")
      expect(errorFor({ ...valid, depthCm: 0, seenAt: "" })).toBe("invalid depthCm")
      expect(errorFor({ ...valid, seenAt: "" })).toBe("invalid seenAt")
    })
  })

  describe("districtId (RPT-REQ-002)", () => {
    it.each([["atlantis"], [""], [42], [undefined], ["__proto__"]])("rejects %j", (districtId) => {
      expect(errorFor({ ...valid, districtId })).toBe("invalid districtId")
    })
  })

  describe("landmark (RPT-REQ-003)", () => {
    it("accepts text with non-phone numbers", () => {
      expect(errorFor({ ...valid, landmark: "ซอยลาดพร้าว 101" })).toBeUndefined()
    })

    it("accepts 100 characters and rejects 101", () => {
      expect(errorFor({ ...valid, landmark: "ก".repeat(100) })).toBeUndefined()
      expect(errorFor({ ...valid, landmark: "ก".repeat(101) })).toBe("invalid landmark")
    })

    it("counts length after trimming", () => {
      expect(errorFor({ ...valid, landmark: `  ${"ก".repeat(100)}  ` })).toBeUndefined()
    })

    it.each([["   "], [""], [42], [undefined], [null]])("rejects %j", (landmark) => {
      expect(errorFor({ ...valid, landmark })).toBe("invalid landmark")
    })
  })

  describe("phone numbers in landmark (RPT-REQ-004)", () => {
    it.each([["หน้าร้าน โทร 081-234-5678"], ["0812345678"], ["02 123 4567"], ["081.234.5678"]])("rejects %j", (landmark) => {
      expect(errorFor({ ...valid, landmark })).toBe("landmark must not contain a phone number")
    })

    it.each([["ซอย 101 แยก 7"], ["ถนนพหลโยธิน กม. 12"]])("accepts %j", (landmark) => {
      expect(errorFor({ ...valid, landmark })).toBeUndefined()
    })
  })

  describe("depthCm (RPT-REQ-005)", () => {
    it.each([[1], [300]])("accepts %j", (depthCm) => {
      expect(errorFor({ ...valid, depthCm })).toBeUndefined()
    })

    it.each([[0], [301], [-5], [25.5], ["25"], [null], [Number.NaN], [undefined]])("rejects %j", (depthCm) => {
      expect(errorFor({ ...valid, depthCm })).toBe("invalid depthCm")
    })
  })

  describe("seenAt (RPT-REQ-006)", () => {
    it("rejects a time without a timezone", () => {
      expect(errorFor({ ...valid, seenAt: "2026-09-30T19:00:00" })).toBe("invalid seenAt")
    })

    it.each([["2026-09-30"], ["yesterday"], ["2026-13-01T00:00:00Z"], [""], [1727690400000], [null]])("rejects %j", (seenAt) => {
      expect(errorFor({ ...valid, seenAt })).toBe("invalid seenAt")
    })

    it("accepts Z and numeric offsets", () => {
      expect(errorFor({ ...valid, seenAt: "2026-09-30T11:30:00Z" })).toBeUndefined()
      expect(errorFor({ ...valid, seenAt: "2026-09-30T11:30:00.250Z" })).toBeUndefined()
      expect(errorFor({ ...valid, seenAt: "2026-09-30T18:30:00+07:00" })).toBeUndefined()
    })

    it("accepts exactly 3 hours ago and rejects 3 hours 1 second ago", () => {
      expect(errorFor({ ...valid, seenAt: "2026-09-30T09:00:00Z" })).toBeUndefined()
      expect(errorFor({ ...valid, seenAt: "2026-09-30T08:59:59Z" })).toBe("invalid seenAt")
    })

    it("accepts exactly 5 minutes ahead and rejects 5 minutes 1 second ahead", () => {
      expect(errorFor({ ...valid, seenAt: "2026-09-30T12:05:00Z" })).toBeUndefined()
      expect(errorFor({ ...valid, seenAt: "2026-09-30T12:05:01Z" })).toBe("invalid seenAt")
    })
  })
})

describe("ReportStore", () => {
  it("keeps the reporter IP on the stored report (RPT-REQ-001 AC4)", () => {
    const store = new ReportStore()
    const report = store.add(input(), "203.0.113.1", now)
    expect(report.ip).toBe("203.0.113.1")
    expect(report.receivedAt).toEqual(now)
  })

  it("gives every report a distinct id (RPT-REQ-001 AC2)", () => {
    const store = new ReportStore()
    const a = store.add(input(), "203.0.113.1", now)
    const b = store.add(input(), "203.0.113.1", now)
    expect(a.id).not.toBe(b.id)
  })

  it("shows a report until seenAt + 3 hours and hides it 1 ms later (RPT-REQ-011)", () => {
    const store = new ReportStore()
    const seenAt = new Date("2026-09-30T11:00:00Z")
    store.add(input({ seenAt }), "203.0.113.1", now)
    expect(store.activeIn("lat-phrao", new Date(seenAt.getTime() + 3 * HOUR))).toHaveLength(1)
    expect(store.activeIn("lat-phrao", new Date(seenAt.getTime() + 3 * HOUR + 1))).toHaveLength(0)
  })

  it("returns the public view with severity and Bangkok time, without id or ip (RPT-REQ-009)", () => {
    const store = new ReportStore()
    store.add(input(), "203.0.113.1", now)
    const [view] = store.activeIn("lat-phrao", now)
    expect(view).toEqual({
      source: "user-reported",
      landmark: "แยกรัชโยธิน",
      depthCm: 25,
      severity: 2,
      seenAt: "2026-09-30T18:30:00+07:00",
      reportCount: 1
    })
  })

  it("only returns reports for the requested district", () => {
    const store = new ReportStore()
    store.add(input({ districtId: "chatuchak" }), "203.0.113.1", now)
    expect(store.activeIn("lat-phrao", now)).toEqual([])
  })

  it("sorts by seenAt, newest first (RPT-REQ-009 AC3)", () => {
    const store = new ReportStore()
    store.add(input({ landmark: "A", seenAt: new Date("2026-09-30T10:00:00Z") }), "203.0.113.1", now)
    store.add(input({ landmark: "B", seenAt: new Date("2026-09-30T11:00:00Z") }), "203.0.113.1", now)
    store.add(input({ landmark: "C", seenAt: new Date("2026-09-30T10:30:00Z") }), "203.0.113.1", now)
    expect(store.activeIn("lat-phrao", now).map((r) => r.landmark)).toEqual(["B", "C", "A"])
  })

  describe("merging duplicates (RPT-REQ-012)", () => {
    it("merges landmarks that differ only in spacing or case, using the newest report", () => {
      const store = new ReportStore()
      store.add(input({ landmark: "Central Ladprao", depthCm: 10, seenAt: new Date("2026-09-30T11:00:00Z") }), "203.0.113.1", now)
      store.add(input({ landmark: "central  ladprao", depthCm: 40, seenAt: new Date("2026-09-30T11:45:00Z") }), "203.0.113.2", now)
      expect(store.activeIn("lat-phrao", now)).toEqual([
        {
          source: "user-reported",
          landmark: "central  ladprao",
          depthCm: 40,
          severity: 2,
          seenAt: "2026-09-30T18:45:00+07:00",
          reportCount: 2
        }
      ])
    })

    it("uses the report received last when seenAt is equal", () => {
      const store = new ReportStore()
      const seenAt = new Date("2026-09-30T11:00:00Z")
      store.add(input({ depthCm: 10, seenAt }), "203.0.113.1", new Date("2026-09-30T11:10:00Z"))
      store.add(input({ depthCm: 60, seenAt }), "203.0.113.2", new Date("2026-09-30T11:20:00Z"))
      expect(store.activeIn("lat-phrao", now)).toMatchObject([{ depthCm: 60, severity: 3, reportCount: 2 }])
    })

    it("lowers reportCount when part of the group expires", () => {
      const store = new ReportStore()
      store.add(input({ depthCm: 10, seenAt: new Date("2026-09-30T09:30:00Z") }), "203.0.113.1", now)
      store.add(input({ depthCm: 40, seenAt: new Date("2026-09-30T11:30:00Z") }), "203.0.113.2", now)
      expect(store.activeIn("lat-phrao", now)).toMatchObject([{ reportCount: 2 }])
      expect(store.activeIn("lat-phrao", new Date("2026-09-30T13:00:00Z"))).toMatchObject([{ depthCm: 40, reportCount: 1 }])
    })

    it("removes the group once every report in it has expired", () => {
      const store = new ReportStore()
      store.add(input({ seenAt: new Date("2026-09-30T11:00:00Z") }), "203.0.113.1", now)
      store.add(input({ seenAt: new Date("2026-09-30T11:30:00Z") }), "203.0.113.2", now)
      expect(store.activeIn("lat-phrao", new Date("2026-09-30T14:30:00.001Z"))).toEqual([])
    })

    it("does not merge the same landmark across districts", () => {
      const store = new ReportStore()
      store.add(input({ districtId: "lat-phrao" }), "203.0.113.1", now)
      store.add(input({ districtId: "chatuchak" }), "203.0.113.2", now)
      expect(store.activeIn("lat-phrao", now)).toMatchObject([{ reportCount: 1 }])
      expect(store.activeIn("chatuchak", now)).toMatchObject([{ reportCount: 1 }])
    })
  })

  it("drops expired reports, with their IPs, when a new report arrives (edge case 15)", () => {
    const store = new ReportStore()
    store.add(input({ seenAt: new Date("2026-09-30T09:00:00Z") }), "203.0.113.1", now)
    expect(store.size).toBe(1)
    const later = new Date("2026-09-30T13:00:00Z")
    store.add(input({ seenAt: new Date("2026-09-30T12:50:00Z") }), "203.0.113.2", later)
    expect(store.size).toBe(1)
  })
})

describe("RateLimiter (RPT-REQ-008)", () => {
  it("allows 5 hits per key in 10 minutes and refuses the 6th", () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 5; i++) expect(limiter.hit("203.0.113.1", new Date(now.getTime() + i * MINUTE))).toBe(true)
    expect(limiter.hit("203.0.113.1", new Date(now.getTime() + 5 * MINUTE))).toBe(false)
  })

  it("does not affect other keys", () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 5; i++) limiter.hit("203.0.113.1", now)
    expect(limiter.hit("203.0.113.1", now)).toBe(false)
    expect(limiter.hit("203.0.113.2", now)).toBe(true)
  })

  it("still counts the first hit at exactly 10 minutes, and frees a slot 1 ms later", () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < 5; i++) limiter.hit("203.0.113.1", now)
    expect(limiter.hit("203.0.113.1", new Date(now.getTime() + 10 * MINUTE))).toBe(false)
    expect(limiter.hit("203.0.113.1", new Date(now.getTime() + 10 * MINUTE + 1))).toBe(true)
  })
})
