import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { handle, NOTICE, type Context } from "../src/app.ts"
import { RateLimiter } from "../src/rateLimit.ts"
import { REPORTS_NOTICE, ReportStore } from "../src/reports.ts"

const now = new Date("2026-09-30T12:00:00Z")
const IP = "203.0.113.7"

const valid = {
  districtId: "lat-phrao",
  landmark: "แยกรัชโยธิน",
  depthCm: 25,
  seenAt: "2026-09-30T18:30:00+07:00"
}

let ctx: Context

beforeEach(() => {
  ctx = { now, ip: IP, reports: new ReportStore(), limiter: new RateLimiter() }
})

function post(body: unknown, overrides: Partial<Context> = {}) {
  return handle("POST", "/reports", body, { ...ctx, ...overrides })
}

function district(id: string, at: Date = now) {
  return handle("GET", `/districts/${id}`, undefined, { ...ctx, now: at })
}

describe("POST /reports", () => {
  it("returns 201 with the report in Bangkok time (RPT-REQ-001)", () => {
    const res = post(valid)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      notice: NOTICE,
      reportsNotice: REPORTS_NOTICE,
      report: {
        source: "user-reported",
        districtId: "lat-phrao",
        landmark: "แยกรัชโยธิน",
        depthCm: 25,
        severity: 2,
        seenAt: "2026-09-30T18:30:00+07:00"
      }
    })
    expect(typeof (res.body as { report: { id: unknown } }).report.id).toBe("string")
  })

  it("never returns the reporter IP or unknown fields (RPT-REQ-001 AC4, RPT-REQ-007 AC2)", () => {
    const res = post({ ...valid, phone: "0812345678", name: "สมชาย" })
    expect(res.status).toBe(201)
    const json = JSON.stringify(res.body)
    expect(json).not.toContain(IP)
    expect(json).not.toContain("0812345678")
    expect(json).not.toContain("สมชาย")
  })

  it.each([
    [{ ...valid, districtId: "atlantis" }, "invalid districtId"],
    [{ ...valid, landmark: "   " }, "invalid landmark"],
    [{ ...valid, landmark: "โทร 081-234-5678" }, "landmark must not contain a phone number"],
    [{ ...valid, depthCm: 25.5 }, "invalid depthCm"],
    [{ ...valid, seenAt: "2026-09-30T19:00:00" }, "invalid seenAt"],
    [null, "body must be a JSON object"]
  ])("returns 400 with a fixed message for %j (RPT-REQ-014)", (body, error) => {
    const res = post(body)
    expect(res).toEqual({ status: 400, body: { error } })
  })

  it("returns 400 when there is no body", () => {
    expect(post(undefined).status).toBe(400)
  })

  it("returns 429 on the 6th request in 10 minutes, counting 400s (RPT-REQ-008)", () => {
    expect(post(valid).status).toBe(201)
    expect(post({ ...valid, depthCm: 0 }).status).toBe(400)
    expect(post({ ...valid, depthCm: 0 }).status).toBe(400)
    expect(post(valid).status).toBe(201)
    expect(post(valid).status).toBe(201)
    expect(post(valid)).toEqual({ status: 429, body: { error: "too many reports, try again later" } })
  })

  it("checks the rate limit before validating the body", () => {
    for (let i = 0; i < 5; i++) post(valid)
    expect(post(null).status).toBe(429)
  })

  it("limits each IP separately", () => {
    for (let i = 0; i < 5; i++) post(valid)
    expect(post(valid).status).toBe(429)
    expect(post(valid, { ip: "203.0.113.8" }).status).toBe(201)
  })

  it("does not change GET /districts or unknown routes", () => {
    expect(handle("POST", "/districts", valid, ctx).status).toBe(404)
    expect(handle("GET", "/reports", undefined, ctx).status).toBe(404)
  })
})

describe("GET /districts/:id with reports (RPT-REQ-009)", () => {
  it("shows a new report immediately with the user-reported label and no id or ip", () => {
    post(valid)
    const res = district("lat-phrao")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      notice: NOTICE,
      reportsNotice: REPORTS_NOTICE,
      reports: [
        {
          source: "user-reported",
          landmark: "แยกรัชโยธิน",
          depthCm: 25,
          severity: 2,
          seenAt: "2026-09-30T18:30:00+07:00",
          reportCount: 1
        }
      ]
    })
    const [report] = (res.body as { reports: Record<string, unknown>[] }).reports
    expect(report).not.toHaveProperty("id")
    expect(report).not.toHaveProperty("ip")
    expect(JSON.stringify(res.body)).not.toContain(IP)
  })

  it("keeps the station data unchanged", () => {
    expect(district("lat-phrao").body).toMatchObject({
      district: { id: "lat-phrao" },
      stations: [{ id: "st-ladprao-01", latest: { levelCm: 104 } }]
    })
  })

  it("includes reportsNotice even when there are no reports", () => {
    expect(district("lat-phrao").body).toMatchObject({ reportsNotice: REPORTS_NOTICE, reports: [] })
  })

  it("shows reports for a district without stations (edge case 12)", () => {
    post({ ...valid, districtId: "sai-mai" })
    expect(district("sai-mai").body).toMatchObject({ stations: [], reports: [{ reportCount: 1 }] })
  })

  it("merges duplicates sent by different people (edge case 9)", () => {
    post({ ...valid, landmark: "Central Ladprao", depthCm: 10, seenAt: "2026-09-30T11:00:00Z" })
    post({ ...valid, landmark: "  central   ladprao ", depthCm: 55, seenAt: "2026-09-30T11:40:00Z" }, { ip: "203.0.113.8" })
    expect(district("lat-phrao").body).toMatchObject({ reports: [{ depthCm: 55, severity: 3, reportCount: 2 }] })
  })

  it("accepts a report seen exactly 3 hours ago and hides it 1 ms later (edge case 5)", () => {
    expect(post({ ...valid, seenAt: "2026-09-30T09:00:00Z" }).status).toBe(201)
    expect(district("lat-phrao").body).toMatchObject({ reports: [{ reportCount: 1 }] })
    expect(district("lat-phrao", new Date(now.getTime() + 1)).body).toMatchObject({ reports: [] })
  })

  it("accepts a seenAt 4 minutes ahead and expires it 3 hours after that seenAt (edge case 6)", () => {
    expect(post({ ...valid, seenAt: "2026-09-30T12:04:00Z" }).status).toBe(201)
    expect(district("lat-phrao", new Date("2026-09-30T15:04:00Z")).body).toMatchObject({ reports: [{ reportCount: 1 }] })
    expect(district("lat-phrao", new Date("2026-09-30T15:04:00.001Z")).body).toMatchObject({ reports: [] })
  })
})

describe("logging (RPT-REQ-013)", () => {
  const methods = ["log", "info", "warn", "error", "debug"] as const
  let lines: string[]

  beforeEach(() => {
    lines = []
    for (const m of methods) vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")))
  })

  afterEach(() => vi.restoreAllMocks())

  it("logs the report id and district, never the landmark, IP or raw body", () => {
    const res = post({ ...valid, landmark: "หน้าตลาดนัดลับ", phone: "0812345678" })
    const id = (res.body as { report: { id: string } }).report.id
    const logged = lines.join("\n")
    expect(logged).toContain(id)
    expect(logged).toContain("lat-phrao")
    expect(logged).not.toContain("หน้าตลาดนัดลับ")
    expect(logged).not.toContain(IP)
    expect(logged).not.toContain("0812345678")
  })

  it("does not log rejected input", () => {
    post({ ...valid, landmark: "โทร 081-234-5678" })
    const logged = lines.join("\n")
    expect(logged).not.toContain("081-234-5678")
    expect(logged).not.toContain(IP)
  })
})
