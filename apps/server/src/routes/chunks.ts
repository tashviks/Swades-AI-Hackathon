import { Hono } from "hono"
import { z } from "zod"
import { eq, desc } from "drizzle-orm"
import { db } from "@my-better-t-app/db"
import { chunks } from "@my-better-t-app/db/schema/chunks"
import { uploadChunk, chunkExistsInBucket } from "@/bucket"
import { transcribeAudio } from "@/transcribe"

const app = new Hono()

const uploadSchema = z.object({
  chunkId: z.string().uuid(),
  // base64-encoded WAV audio data
  data: z.string().min(1),
  sessionId: z.string().min(1),
  userName: z.string().min(1).default("Unknown"),
})

const reconcileSchema = z.object({
  chunkIds: z.array(z.string().uuid()),
  sessionId: z.string().min(1),
})

// POST /api/chunks/upload
// Receives a WAV chunk, stores it in the bucket, acks to DB immediately,
// then transcribes in the background and updates the transcript when ready
app.post("/upload", async (c) => {
  const body = await c.req.json()
  const parsed = uploadSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid request" }, 400)
  }

  const { chunkId, sessionId, data, userName } = parsed.data
  const bucketKey = `${sessionId}/${chunkId}.wav`

  const buffer = Buffer.from(data, "base64")
  await uploadChunk(bucketKey, buffer)

  // Ack to DB immediately — don't wait for transcription
  await db
    .insert(chunks)
    .values({ bucketKey, id: chunkId, sessionId, userName })
    .onConflictDoNothing()

  // Transcribe in the background
  void transcribeAudio(buffer)
    .then(async (transcript) => {
      await db
        .update(chunks)
        .set({ transcript })
        .where(eq(chunks.id, chunkId))
    })
    .catch((err: unknown) => {
      console.error("Transcription error for chunk", chunkId, err)
    })

  return c.json({ chunkId, ok: true })
})

// POST /api/chunks/reconcile
app.post("/reconcile", async (c) => {
  const body = await c.req.json()
  const parsed = reconcileSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid request" }, 400)
  }

  const { sessionId, chunkIds } = parsed.data

  const ackedRows = await db.select().from(chunks).where(eq(chunks.sessionId, sessionId))

  const ackedIds = new Set(ackedRows.map((r) => r.id))

  const missing: string[] = []
  for (const row of ackedRows) {
    if (!chunkIds.includes(row.id)) {
      continue
    }
    const exists = await chunkExistsInBucket(row.bucketKey)
    if (!exists) {
      missing.push(row.id)
    }
  }

  const unacked = chunkIds.filter((id) => !ackedIds.has(id))

  return c.json({ missing, unacked })
})

// GET /api/chunks/transcriptions
// Returns all transcribed chunks grouped by userName
app.get("/transcriptions", async (c) => {
  const rows = await db
    .select({
      ackedAt: chunks.ackedAt,
      chunkId: chunks.id,
      sessionId: chunks.sessionId,
      transcript: chunks.transcript,
      userName: chunks.userName,
    })
    .from(chunks)
    .orderBy(desc(chunks.ackedAt))

  const grouped: Record<string, { chunkId: string; sessionId: string; transcript: string | null; ackedAt: Date }[]> = {}

  for (const row of rows) {
    const key = row.userName
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push({
      ackedAt: row.ackedAt,
      chunkId: row.chunkId,
      sessionId: row.sessionId,
      transcript: row.transcript,
    })
  }

  return c.json({ users: grouped })
})

export default app
