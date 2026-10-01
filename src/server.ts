import { createServer } from "node:http"
import { handle } from "./app.ts"

const port = Number(process.env.PORT ?? 3000)

createServer((req, res) => {
  let raw = ""
  req.on("data", (chunk) => (raw += chunk))
  req.on("end", () => {
    let body: unknown = undefined
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }))
        return
      }
    }
    const path = new URL(req.url ?? "/", "http://x").pathname
    // Socket address only: X-Forwarded-For is client-controlled and not trusted (see spec, out of scope).
    const ctx = { now: new Date(), ip: req.socket.remoteAddress }
    const { status, body: out } = handle(req.method ?? "GET", path, body, ctx)
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(out))
  })
}).listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
