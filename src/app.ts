import { districts } from "./districts.ts"
import { RateLimiter } from "./rateLimit.ts"
import { REPORTS_NOTICE, ReportStore, severityFor, validateReport } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = {
  now: Date
  ip?: string
  /** Defaults to one store shared by the whole process; tests pass a fresh one. */
  reports?: ReportStore
  limiter?: RateLimiter
}

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

const defaultReports = new ReportStore()
const defaultLimiter = new RateLimiter()

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  const reports = ctx.reports ?? defaultReports

  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
  }

  if (method === "POST" && path === "/reports") {
    return submitReport(body, ctx, reports)
  }

  const districtMatch = path.match(/^\/districts\/([a-z-]+)$/)
  if (method === "GET" && districtMatch) {
    const district = districts.get(districtMatch[1] ?? "")
    if (!district) return { status: 404, body: { error: "unknown district" } }
    const stations = stationsIn(district.id).map((s) => {
      const latest = latestReading(s, ctx.now)
      return {
        id: s.id,
        nameTh: s.nameTh,
        latest: latest ? { at: toBangkokIso(latest.at), levelCm: latest.levelCm } : null
      }
    })
    return {
      status: 200,
      body: { notice: NOTICE, district, stations, reportsNotice: REPORTS_NOTICE, reports: reports.activeIn(district.id, ctx.now) }
    }
  }

  return { status: 404, body: { error: "not found" } }
}

function submitReport(body: unknown, ctx: Context, reports: ReportStore): Response {
  const ip = ctx.ip ?? "unknown"
  // Rate-limit before validating, so invalid requests count too.
  if (!(ctx.limiter ?? defaultLimiter).hit(ip, ctx.now)) {
    return { status: 429, body: { error: "too many reports, try again later" } }
  }

  const result = validateReport(body, ctx.now)
  if (!result.ok) return { status: 400, body: { error: result.error } }

  const report = reports.add(result.value, ip, ctx.now)
  // Log IDs only: never the landmark, IP or raw body.
  console.info(`report accepted id=${report.id} district=${report.districtId}`)

  return {
    status: 201,
    body: {
      notice: NOTICE,
      reportsNotice: REPORTS_NOTICE,
      report: {
        source: "user-reported",
        id: report.id,
        districtId: report.districtId,
        landmark: report.landmark,
        depthCm: report.depthCm,
        severity: severityFor(report.depthCm),
        seenAt: toBangkokIso(report.seenAt)
      }
    }
  }
}
