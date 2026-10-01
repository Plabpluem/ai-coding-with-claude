import { randomUUID } from "node:crypto"
import { districts } from "./districts.ts"
import { toBangkokIso } from "./time.ts"

export const REPORTS_NOTICE = "รายงานจากผู้ใช้ ยังไม่ได้ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"

const REPORT_TTL_MS = 3 * 60 * 60 * 1000 // a report is shown until seenAt + 3 hours
const MAX_FUTURE_MS = 5 * 60 * 1000 // tolerate a phone clock up to 5 minutes fast
const MAX_LANDMARK_LENGTH = 100
const MIN_DEPTH_CM = 1
const MAX_DEPTH_CM = 300

// ISO 8601 with seconds and an explicit timezone, e.g. 2026-09-30T19:00:00+07:00 or 2026-09-30T12:00:00.250Z.
const SEEN_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
// 9+ digits in a row once spaces, dashes and dots are removed: 081-234-5678, 02 123 4567, 081.234.5678.
const PHONE_PATTERN = /\d{9,}/

export type Severity = 1 | 2 | 3

export type ReportInput = { districtId: string; landmark: string; depthCm: number; seenAt: Date }

export type FloodReport = ReportInput & {
  id: string
  landmarkKey: string // normalizeLandmark(landmark), used to merge duplicates
  receivedAt: Date // breaks ties when two reports share a seenAt
  ip: string // never logged or returned; dropped when the report expires
}

/** One merged entry as shown to the public in GET /districts/:id. */
export type ReportView = {
  source: "user-reported"
  landmark: string
  depthCm: number
  severity: Severity
  seenAt: string
  reportCount: number
}

export type Validation = { ok: true; value: ReportInput } | { ok: false; error: string }

/** Severity levels from the workshop guide: 1–20 cm, 21–50 cm, over 50 cm. */
export function severityFor(depthCm: number): Severity {
  if (depthCm <= 20) return 1
  if (depthCm <= 50) return 2
  return 3
}

export function normalizeLandmark(landmark: string): string {
  return landmark.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
}

/** Check a POST /reports body. Errors are fixed strings and never echo the input. */
export function validateReport(body: unknown, now: Date): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("body must be a JSON object")
  const { districtId, landmark, depthCm, seenAt } = body as Record<string, unknown>

  if (typeof districtId !== "string" || !districts.has(districtId)) return fail("invalid districtId")

  if (typeof landmark !== "string") return fail("invalid landmark")
  const trimmed = landmark.trim()
  if (trimmed.length < 1 || trimmed.length > MAX_LANDMARK_LENGTH) return fail("invalid landmark")
  if (PHONE_PATTERN.test(trimmed.replace(/[\s.-]/g, ""))) return fail("landmark must not contain a phone number")

  if (typeof depthCm !== "number" || !Number.isInteger(depthCm) || depthCm < MIN_DEPTH_CM || depthCm > MAX_DEPTH_CM) {
    return fail("invalid depthCm")
  }

  if (typeof seenAt !== "string" || !SEEN_AT_PATTERN.test(seenAt)) return fail("invalid seenAt")
  const seen = new Date(seenAt)
  const ageMs = now.getTime() - seen.getTime()
  if (Number.isNaN(ageMs) || ageMs > REPORT_TTL_MS || ageMs < -MAX_FUTURE_MS) return fail("invalid seenAt")

  return { ok: true, value: { districtId, landmark: trimmed, depthCm, seenAt: seen } }
}

function fail(error: string): Validation {
  return { ok: false, error }
}

function isActive(report: FloodReport, now: Date): boolean {
  return now.getTime() <= report.seenAt.getTime() + REPORT_TTL_MS
}

/** In-memory reports. Expired reports (and their IPs) are dropped on every add and read. */
export class ReportStore {
  #reports: FloodReport[] = []

  get size(): number {
    return this.#reports.length
  }

  add(input: ReportInput, ip: string, now: Date): FloodReport {
    this.#dropExpired(now)
    const report: FloodReport = {
      ...input,
      id: randomUUID(),
      landmarkKey: normalizeLandmark(input.landmark),
      receivedAt: now,
      ip
    }
    this.#reports.push(report)
    return report
  }

  /** Unexpired reports in a district, duplicates merged, newest seenAt first. */
  activeIn(districtId: string, now: Date): ReportView[] {
    this.#dropExpired(now)
    const groups = new Map<string, FloodReport[]>()
    for (const r of this.#reports) {
      if (r.districtId !== districtId) continue
      const group = groups.get(r.landmarkKey)
      if (group) group.push(r)
      else groups.set(r.landmarkKey, [r])
    }

    return [...groups.values()]
      .map((group) => {
        const newest = group.reduce((a, b) => (isNewer(b, a) ? b : a))
        return { newest, count: group.length }
      })
      .sort((a, b) => b.newest.seenAt.getTime() - a.newest.seenAt.getTime())
      .map(({ newest, count }) => ({
        source: "user-reported" as const,
        landmark: newest.landmark,
        depthCm: newest.depthCm,
        severity: severityFor(newest.depthCm),
        seenAt: toBangkokIso(newest.seenAt),
        reportCount: count
      }))
  }

  #dropExpired(now: Date): void {
    this.#reports = this.#reports.filter((r) => isActive(r, now))
  }
}

/** Later seenAt wins; on a tie the report received later wins (b is always the later-added one). */
function isNewer(b: FloodReport, a: FloodReport): boolean {
  const bySeen = b.seenAt.getTime() - a.seenAt.getTime()
  if (bySeen !== 0) return bySeen > 0
  return b.receivedAt.getTime() >= a.receivedAt.getTime()
}
