/** Sliding-window limit per key (the client IP). Keys with no recent hits are dropped so IPs are not kept. */
export class RateLimiter {
  #hits = new Map<string, number[]>()
  #limit: number
  #windowMs: number

  constructor(limit = 5, windowMs = 10 * 60 * 1000) {
    this.#limit = limit
    this.#windowMs = windowMs
  }

  /** Record a hit at `now`. Returns false (and records nothing) when the key is over the limit. */
  hit(key: string, now: Date): boolean {
    const t = now.getTime()
    this.#dropOld(t)
    const recent = this.#hits.get(key) ?? []
    if (recent.length >= this.#limit) return false
    recent.push(t)
    this.#hits.set(key, recent)
    return true
  }

  // A hit exactly windowMs old still counts; it frees its slot 1 ms later.
  #dropOld(t: number): void {
    for (const [key, times] of this.#hits) {
      const recent = times.filter((h) => t - h <= this.#windowMs)
      if (recent.length === 0) this.#hits.delete(key)
      else this.#hits.set(key, recent)
    }
  }
}
