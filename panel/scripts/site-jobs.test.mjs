// Site işleri çekirdeğinin testi (bkz. src/lib/site-job-core.ts).
// Çalıştırma: `npm test` (Node >= 22.18 — .ts dosyasını doğrudan içe aktarır).
import assert from "node:assert/strict"
import test from "node:test"

import {
  appendOutput,
  canTransition,
  createJobRegistry,
  decideConflict,
  flushDelay,
  InvalidJobTransitionError,
  jobElapsedMs,
  JOB_OUTPUT_MAX_BYTES,
  JOB_OUTPUT_TRUNCATED_MARKER,
  reconcileRecord,
  tailUtf8,
  transition,
  utf8ByteLength,
} from "../src/lib/site-job-core.ts"

// ---------------------------------------------------------------------------
// Durum makinesi
// ---------------------------------------------------------------------------

test("geçerli geçişler kabul edilir", () => {
  for (const [from, to] of [
    ["queued", "running"],
    ["queued", "interrupted"],
    ["queued", "failed"],
    ["running", "succeeded"],
    ["running", "failed"],
    ["running", "interrupted"],
  ]) {
    assert.equal(canTransition(from, to), true, `${from} → ${to}`)
    assert.equal(transition(from, to), to)
  }
})

test("geçersiz geçişler reddedilir", () => {
  for (const [from, to] of [
    ["queued", "succeeded"],
    ["running", "queued"],
    ["running", "running"],
    ["succeeded", "running"],
    ["failed", "succeeded"],
    ["interrupted", "running"],
    ["succeeded", "failed"],
  ]) {
    assert.equal(canTransition(from, to), false, `${from} → ${to}`)
    assert.throws(() => transition(from, to), InvalidJobTransitionError)
  }
})

// ---------------------------------------------------------------------------
// Çıktı kuyruğu
// ---------------------------------------------------------------------------

test("UTF-8 bayt uzunluğu", () => {
  assert.equal(utf8ByteLength("abc"), 3)
  assert.equal(utf8ByteLength("ş"), 2)
  assert.equal(utf8ByteLength("€"), 3)
  assert.equal(utf8ByteLength("😀"), 4)
})

test("sınırın altındaki çıktı olduğu gibi kalır", () => {
  assert.equal(tailUtf8("satır 1\nsatır 2\n"), "satır 1\nsatır 2\n")
  assert.equal(appendOutput("a\n", "b\n"), "a\nb\n")
})

test("64 KB'ı aşan çıktı satır başından kesilir", () => {
  let out = ""
  for (let i = 0; i < 5000; i++) out = appendOutput(out, `satır ${i} — ${"x".repeat(20)}\n`)
  assert.ok(utf8ByteLength(out) <= JOB_OUTPUT_MAX_BYTES)
  assert.ok(out.startsWith(JOB_OUTPUT_TRUNCATED_MARKER))
  const body = out.slice(JOB_OUTPUT_TRUNCATED_MARKER.length)
  assert.match(body, /^satır \d+ — x+\n/, "ilk satır yarım olmamalı")
  assert.ok(body.endsWith(`satır 4999 — ${"x".repeat(20)}\n`))
})

test("tek uzun satırda çok baytlı karakterler bölünmez", () => {
  for (const ch of ["ş", "€", "😀"]) {
    const text = ch.repeat(40_000)
    const out = tailUtf8(text, 1001)
    assert.ok(utf8ByteLength(out) <= 1001, `${ch}: ${utf8ByteLength(out)}`)
    const body = out.slice(JOB_OUTPUT_TRUNCATED_MARKER.length)
    assert.equal(body.replaceAll(ch, ""), "", `${ch}: bozuk karakter kalmamalı`)
    assert.ok(!body.includes("�"))
    // Kodlayıp geri çözmek aynı metni vermeli (yarım vekil çift yok).
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(body)), body)
  }
})

// ---------------------------------------------------------------------------
// Yazma sıklığı
// ---------------------------------------------------------------------------

test("yazma kararı: faz ve bitiş zorunlu, çıktı en çok 2 sn'de bir", () => {
  assert.equal(flushDelay({ dirty: false, lastFlushAt: 0 }, 10_000, "phase"), 0)
  assert.equal(flushDelay({ dirty: false, lastFlushAt: 0 }, 10_000, "finish"), 0)
  assert.equal(flushDelay({ dirty: false, lastFlushAt: 0 }, 10_000, "output"), null)
  assert.equal(flushDelay({ dirty: true, lastFlushAt: 9_500 }, 10_000, "output"), 1_500)
  assert.equal(flushDelay({ dirty: true, lastFlushAt: 7_000 }, 10_000, "output"), 0)
})

// ---------------------------------------------------------------------------
// Çakışma tablosu
// ---------------------------------------------------------------------------

test("çakışma tablosu", () => {
  const busy = { kind: "deploy" }
  const none = []
  assert.equal(decideConflict({ trigger: "manual", kind: "deploy", active: null, queued: none }), "start")
  assert.equal(decideConflict({ trigger: "auto-pull", kind: "deploy", active: null, queued: none }), "start")
  assert.equal(decideConflict({ trigger: "manual", kind: "deploy", active: busy, queued: none }), "reject")
  assert.equal(decideConflict({ trigger: "manual", kind: "compose", active: busy, queued: none }), "reject")
  assert.equal(decideConflict({ trigger: "auto-pull", kind: "deploy", active: busy, queued: none }), "skip")
  for (const trigger of ["hook", "webhook"]) {
    assert.equal(decideConflict({ trigger, kind: "deploy", active: busy, queued: none }), "queue")
    assert.equal(decideConflict({ trigger, kind: "deploy", active: busy, queued: [{ kind: "deploy" }] }), "coalesce")
  }
  assert.equal(decideConflict({ trigger: "schedule", kind: "backup", active: busy, queued: none }), "queue")
  assert.equal(decideConflict({ trigger: "schedule", kind: "backup", active: busy, queued: [{ kind: "deploy" }] }), "queue")
  assert.equal(decideConflict({ trigger: "schedule", kind: "backup", active: busy, queued: [{ kind: "backup" }] }), "coalesce")
})

test("görünüm yardımcıları: geçen süre ve güvenlik ağı", () => {
  assert.equal(jobElapsedMs({ startedAt: null, finishedAt: null }, 5_000), 0)
  assert.equal(jobElapsedMs({ startedAt: new Date(1_000).toISOString(), finishedAt: null }, 5_000), 4_000)
  assert.equal(jobElapsedMs({ startedAt: new Date(1_000), finishedAt: new Date(3_000) }, 9_000), 2_000)
  const row = record({ status: "running" })
  assert.equal(reconcileRecord(row, true).status, "running")
  const dead = reconcileRecord(row, false)
  assert.equal(dead.status, "interrupted")
  assert.match(dead.error, /deploy yarıda kaldı/)
  assert.equal(reconcileRecord(record({ status: "succeeded" }), false).status, "succeeded")
})

// ---------------------------------------------------------------------------
// Kayıt (sahte depo)
// ---------------------------------------------------------------------------

function record(over = {}) {
  return {
    id: "r1",
    siteId: "s1",
    kind: "deploy",
    action: "deploy",
    trigger: "manual",
    status: "queued",
    phase: null,
    actorId: null,
    actor: null,
    output: "",
    error: null,
    result: null,
    createdAt: new Date(0),
    startedAt: null,
    finishedAt: null,
    ...over,
  }
}

function fakeStore(initial = []) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]))
  const calls = { create: 0, update: 0, prune: 0, updates: [] }
  return {
    rows,
    calls,
    async create(r) {
      calls.create++
      rows.set(r.id, { ...r })
    },
    async update(id, patch) {
      calls.update++
      calls.updates.push({ id, ...patch })
      const row = rows.get(id)
      if (row) rows.set(id, { ...row, ...patch })
    },
    async listUnfinished() {
      return [...rows.values()].filter((r) => r.status === "queued" || r.status === "running")
    },
    async prune() {
      calls.prune++
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let idSeq = 0
const newId = () => `job${++idSeq}`
const tick = () => new Promise((r) => setImmediate(r))

test("kilit: elle ikinci iş 409 (rejected), iş bitince yenisi başlar", async () => {
  const store = fakeStore()
  const reg = createJobRegistry({ store, newId })
  const gate = deferred()
  const first = await reg.start({ siteId: "s1", kind: "deploy", action: "deploy", trigger: "manual", run: () => gate.promise })
  assert.equal(first.status, "started")
  assert.equal(reg.active("s1").id, first.job.id)

  const second = await reg.start({ siteId: "s1", kind: "compose", action: "rebuild", trigger: "manual", run: async () => {} })
  assert.equal(second.status, "rejected")
  assert.equal(second.activeJob.id, first.job.id)

  const auto = await reg.start({ siteId: "s1", kind: "deploy", trigger: "auto-pull", ephemeral: true, run: async () => {} })
  assert.equal(auto.status, "skipped")

  // Başka site etkilenmez.
  const other = await reg.start({ siteId: "s2", kind: "backup", trigger: "manual", run: async () => {} })
  assert.equal(other.status, "started")

  gate.resolve({ result: { deployed: true } })
  const done = await reg.wait(first.job.id)
  assert.equal(done.status, "succeeded")
  assert.deepEqual(done.result, { deployed: true })
  assert.equal(reg.active("s1"), null)
  assert.equal(store.rows.get(first.job.id).status, "succeeded")
  assert.ok(store.rows.get(first.job.id).finishedAt instanceof Date)

  const third = await reg.start({ siteId: "s1", kind: "compose", trigger: "manual", run: async () => {} })
  assert.equal(third.status, "started")
  await reg.wait(third.job.id)
})

test("takip işi: hook kuyruğa girer, ikinci hook ona katılır, ilk iş bitince başlar", async () => {
  const store = fakeStore()
  const reg = createJobRegistry({ store, newId })
  const gate = deferred()
  const order = []
  const first = await reg.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "webhook",
    run: async () => {
      order.push("first")
      await gate.promise
    },
  })
  const runFollow = async (_ctx, params) => {
    order.push(`follow force=${params.force}`)
    return { result: { force: params.force } }
  }
  const follow = await reg.start({ siteId: "s1", kind: "deploy", trigger: "webhook", params: { force: false }, run: runFollow })
  assert.equal(follow.status, "queued")
  assert.equal(follow.job.status, "queued")
  assert.equal(store.rows.get(follow.job.id).status, "queued")

  const again = await reg.start({ siteId: "s1", kind: "deploy", trigger: "hook", params: { force: true }, run: runFollow })
  assert.equal(again.status, "coalesced")
  assert.equal(again.job.id, follow.job.id)
  assert.equal(reg.queued("s1").length, 1)
  assert.equal(reg.listActive().length, 2)

  gate.resolve()
  const done = await reg.wait(follow.job.id)
  assert.equal(done.status, "succeeded")
  assert.deepEqual(order, ["first", "follow force=true"])
  assert.equal((await reg.wait(first.job.id)).status, "succeeded")
  assert.ok(done.startedAt)
})

test("hata → failed, son yazımda hata ve çıktı var", async () => {
  const store = fakeStore()
  const reg = createJobRegistry({ store, newId, flushIntervalMs: 60_000 })
  const finished = []
  const reg2 = createJobRegistry({
    store,
    newId,
    flushIntervalMs: 60_000,
    onFinish: (view) => {
      finished.push(view.status)
    },
  })
  const started = await reg2.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "manual",
    run: async (ctx) => {
      ctx.phase("build")
      ctx.log("$ npm run build")
      ctx.write("derleniyor…")
      throw new Error("Deploy komutu başarısız oldu (çıkış kodu 1).")
    },
  })
  const done = await reg2.wait(started.job.id)
  assert.equal(done.status, "failed")
  assert.equal(done.error, "Deploy komutu başarısız oldu (çıkış kodu 1).")
  const row = store.rows.get(started.job.id)
  assert.equal(row.status, "failed")
  assert.equal(row.error, done.error)
  assert.equal(row.phase, "build")
  assert.equal(row.output, "$ npm run build\nderleniyor…")
  await new Promise((r) => setTimeout(r, 5)) // bitiş kancası bekleyenlerden sonra çalışır
  assert.deepEqual(finished, ["failed"])
  assert.equal(store.calls.prune, 1)

  // `error` dönen iş de failed olur, sonucu saklanır.
  const soft = await reg.start({ siteId: "s9", kind: "deploy", trigger: "manual", run: async () => ({ error: "Sağlık kontrolü başarısız", result: { deployed: true } }) })
  const softDone = await reg.wait(soft.job.id)
  assert.equal(softDone.status, "failed")
  assert.deepEqual(softDone.result, { deployed: true })
})

test("yazma sıklığı: çıktı birikir, en çok aralıkta bir yazılır; faz hemen yazılır", async () => {
  const store = fakeStore()
  let clock = 1_000
  const timers = []
  const reg = createJobRegistry({
    store,
    newId,
    now: () => clock,
    schedule: (fn, ms) => {
      const t = { fn, at: clock + ms, done: false }
      timers.push(t)
      return () => {
        t.done = true
      }
    },
  })
  const gate = deferred()
  let ctxRef
  const started = await reg.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "manual",
    run: async (ctx) => {
      ctxRef = ctx
      await gate.promise
    },
  })
  await tick()
  const base = store.calls.update // running geçişi yazıldı
  assert.equal(base, 1)
  for (let i = 0; i < 100; i++) ctxRef.write(`satır ${i}\n`)
  await tick()
  assert.equal(store.calls.update, base, "aralık dolmadan yazılmaz")
  const pending = timers.filter((t) => !t.done && t.at < Infinity && t.at <= clock + 2_000)
  assert.equal(pending.length, 1, "tek zamanlayıcı kurulur")

  clock += 2_000
  pending[0].done = true
  pending[0].fn()
  await tick()
  assert.equal(store.calls.update, base + 1)
  assert.match(store.rows.get(started.job.id).output, /satır 99\n$/)

  ctxRef.phase("restart")
  await tick()
  assert.equal(store.calls.update, base + 2, "faz geçişi hemen yazılır")
  assert.equal(store.rows.get(started.job.id).phase, "restart")

  gate.resolve()
  await reg.wait(started.job.id)
  await tick()
  assert.equal(store.calls.update, base + 3, "bitiş yazılır")
})

test("geçici iş: persist çağrılmazsa depoya hiç yazılmaz", async () => {
  const store = fakeStore()
  const reg = createJobRegistry({ store, newId })
  const quiet = await reg.start({ siteId: "s1", kind: "deploy", trigger: "auto-pull", ephemeral: true, run: async (ctx) => ctx.log("değişiklik yok") })
  assert.equal(reg.active("s1"), null, "geçici iş varsayılan görünümde yok")
  await reg.wait(quiet.job.id)
  assert.equal(store.calls.create + store.calls.update, 0)

  const loud = await reg.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "auto-pull",
    ephemeral: true,
    run: async (ctx) => {
      ctx.log("yeni commit")
      await ctx.persist()
      ctx.phase("build")
    },
  })
  const done = await reg.wait(loud.job.id)
  assert.equal(done.status, "succeeded")
  const row = store.rows.get(loud.job.id)
  assert.equal(row.status, "succeeded")
  assert.equal(row.output, "yeni commit\n")
})

test("depo oluşturma hatası kilidi bırakır", async () => {
  const store = fakeStore()
  store.create = async () => {
    throw new Error("db yok")
  }
  const reg = createJobRegistry({ store, newId })
  await assert.rejects(reg.start({ siteId: "s1", kind: "deploy", trigger: "manual", run: async () => {} }), /db yok/)
  assert.equal(reg.active("s1", { includeEphemeral: true }), null)
})

test("markInterrupted: bellekte olmayan queued/running işler interrupted olur", async () => {
  const store = fakeStore([
    record({ id: "a", status: "running", kind: "deploy" }),
    record({ id: "b", status: "queued", kind: "backup", siteId: "s2" }),
    record({ id: "c", status: "succeeded" }),
  ])
  const reg = createJobRegistry({ store, newId })
  const marked = await reg.markInterrupted()
  assert.deepEqual(marked.map((j) => j.id).sort(), ["a", "b"])
  assert.equal(store.rows.get("a").status, "interrupted")
  assert.match(store.rows.get("a").error, /Panel yeniden başladı, deploy yarıda kaldı/)
  assert.equal(store.rows.get("b").status, "interrupted")
  assert.match(store.rows.get("b").error, /iş yarıda kaldı/)
  assert.equal(store.rows.get("c").status, "succeeded")
  assert.ok(store.rows.get("a").finishedAt instanceof Date)
})

test("son yazım beklenirken bitmiş iş kilidi tutmaz (kuyruk boşsa)", async () => {
  const store = fakeStore()
  const slowUpdate = deferred()
  const reg = createJobRegistry({ store, newId })
  // Bitiş yazımını beklet.
  const realUpdate = store.update
  let finalWriteWaiting = false
  store.update = async (id, patch) => {
    if (patch.status === "succeeded") {
      finalWriteWaiting = true
      await slowUpdate.promise
    }
    return realUpdate(id, patch)
  }
  const started = await reg.start({ siteId: "s1", kind: "deploy", trigger: "manual", run: async () => ({ result: { deployed: true } }) })
  await tick()
  await tick()
  assert.equal(finalWriteWaiting, true)
  const second = await reg.start({ siteId: "s1", kind: "compose", trigger: "manual", run: async () => {} })
  assert.equal(second.status, "started", "bitmiş işin son yazımı 409'a yol açmamalı")
  assert.equal(reg.active("s1").id, second.job.id)
  slowUpdate.resolve()
  assert.equal((await reg.wait(started.job.id)).status, "succeeded")
  await reg.wait(second.job.id)
  // Eski işin bitişi yeni işin kilidini silmez.
  await tick()
  assert.equal(reg.active("s1", { includeEphemeral: true }), null)
})

test("geçici iş bitince kısa sürede bellekten düşer, kalıcı iş uzun kalır", async () => {
  const store = fakeStore()
  const scheduled = []
  const reg = createJobRegistry({
    store,
    newId,
    schedule: (fn, ms) => {
      scheduled.push(ms)
      return () => {}
    },
  })
  const eph = await reg.start({ siteId: "s1", kind: "deploy", trigger: "auto-pull", ephemeral: true, run: async () => {} })
  await reg.wait(eph.job.id)
  const per = await reg.start({ siteId: "s1", kind: "deploy", trigger: "manual", run: async () => {} })
  await reg.wait(per.job.id)
  assert.deepEqual(scheduled, [30_000, 15 * 60_000])
})

test("kuyruktaki işin kaydı, iş kuyruktan alındıktan sonra başarısız olursa başka işin kilidi silinmez", async () => {
  const store = fakeStore()
  const gate = deferred()
  const createGate = deferred()
  const reg = createJobRegistry({ store, newId })
  const first = await reg.start({ siteId: "s1", kind: "deploy", trigger: "manual", run: () => gate.promise })

  const realCreate = store.create
  let ran = false
  store.create = async () => {
    await createGate.promise
    throw new Error("db yok")
  }
  const followP = reg.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "webhook",
    run: async () => {
      ran = true
    },
  })
  await tick()
  // İlk iş biter → takip işi kuyruktan alınır (kayıt hâlâ sürüyor).
  gate.resolve()
  await reg.wait(first.job.id)
  await tick()
  store.create = realCreate
  createGate.resolve()
  await assert.rejects(followP, /db yok/)
  await tick()
  await tick()
  assert.equal(ran, false, "kaydı olmayan iş çalışmamalı")
  assert.equal(reg.active("s1", { includeEphemeral: true }), null)

  // Kilit doğru bırakıldı: yeni iş başlar ve kendi kilidini tutar.
  const gate2 = deferred()
  const next = await reg.start({ siteId: "s1", kind: "compose", trigger: "manual", run: () => gate2.promise })
  assert.equal(next.status, "started")
  assert.equal(reg.active("s1").id, next.job.id)
  gate2.resolve()
  await reg.wait(next.job.id)
})

test("hemen başlayan işin kaydı başarısızsa, kayıt sürerken kuyruğa giren takip işi başlar", async () => {
  const store = fakeStore()
  const createGate = deferred()
  const realCreate = store.create
  let failNext = true
  store.create = async (r) => {
    if (failNext) {
      failNext = false
      await createGate.promise
      throw new Error("db yok")
    }
    return realCreate(r)
  }
  const reg = createJobRegistry({ store, newId })
  const firstP = reg.start({ siteId: "s1", kind: "deploy", trigger: "manual", run: async () => {} })
  let ran = false
  const follow = await reg.start({
    siteId: "s1",
    kind: "deploy",
    trigger: "hook",
    run: async () => {
      ran = true
    },
  })
  assert.equal(follow.status, "queued")
  createGate.resolve()
  await assert.rejects(firstP, /db yok/)
  const done = await reg.wait(follow.job.id)
  assert.equal(done.status, "succeeded")
  assert.equal(ran, true)
  assert.equal(reg.active("s1", { includeEphemeral: true }), null)
})
