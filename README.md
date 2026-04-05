# Reliable Recording Chunking Pipeline

A browser-based audio recording system that chunks recordings, persists them durably, uploads to object storage, and transcribes each chunk per user — with zero data loss even across tab closes or network drops.

## How It Works

```
Browser (per user)
    │
    ├── 1. Record audio → split into 5-second WAV chunks (16kHz PCM)
    ├── 2. Persist each chunk to OPFS (Origin Private File System)
    ├── 3. Upload chunk to MinIO (S3-compatible bucket)
    ├── 4. Ack to PostgreSQL database
    ├── 5. Transcribe via AssemblyAI (background, non-blocking)
    │
    └── Recovery: chunks in OPFS but missing from bucket → re-upload
```

**Key invariant:** Chunks are only removed from OPFS after both the bucket and DB confirm receipt. Transcription happens asynchronously and never blocks the recording flow.

## Features

- Chunked WAV recording with live waveform visualization
- OPFS-backed durability — survives tab closes and network drops
- Per-user transcription via AssemblyAI Whisper
- `/transcriptions` page showing all users' transcripts in real time
- Reconciliation endpoint to repair bucket/DB mismatches
- Load-test ready (target: 300K requests)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TailwindCSS v4, shadcn/ui |
| Backend | Hono, Bun |
| Database | PostgreSQL + Drizzle ORM |
| Storage | MinIO (S3-compatible) |
| Transcription | AssemblyAI |
| Monorepo | Turborepo |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Docker](https://docs.docker.com/get-docker/) (running)
- [Bun](https://bun.sh) (auto-installed by setup script)
- An [AssemblyAI](https://www.assemblyai.com) API key (free tier works)

### 1. Run the setup script

```bash
./setup.sh
```

This will:
- Install Bun if not present
- Copy `.env.example` files
- Install npm dependencies
- Start Postgres + MinIO via Docker Compose
- Create the MinIO `chunks` bucket
- Apply the database schema

### 2. Add your AssemblyAI API key

Open `apps/server/.env` and set:

```
ASSEMBLY_AI_API_KEY=your_key_here
```

Get a free key at https://www.assemblyai.com/dashboard

### 3. Start the project

```bash
npm run dev
```

| Service | URL |
|---|---|
| Web app | http://localhost:3001 |
| API server | http://localhost:3000 |
| MinIO console | http://localhost:9001 |

MinIO login: `minioadmin` / `minioadmin`

---

## Usage

1. Open http://localhost:3001/recorder in one or more browser tabs
2. Each tab sets a user name (stored in localStorage)
3. Click **Record** — audio is chunked every 5 seconds, uploaded, and transcribed
4. Open http://localhost:3001/transcriptions to see all users' transcripts grouped by name (auto-refreshes every 10s)

---

## Project Structure

```
.
├── apps/
│   ├── web/          # Next.js frontend — recording UI, transcriptions page
│   └── server/       # Hono API — chunk upload, transcription, reconciliation
├── packages/
│   ├── db/           # Drizzle ORM schema + Docker Compose
│   ├── env/          # Type-safe environment variables
│   ├── ui/           # Shared shadcn/ui components
│   └── config/       # Shared TypeScript config
└── setup.sh          # One-command local setup
```

## Available Scripts

```bash
npm run dev           # Start all apps
npm run dev:web       # Start only the web app (:3001)
npm run dev:server    # Start only the API server (:3000)
npm run build         # Build all apps
npm run check-types   # TypeScript type checking
npm run check         # Lint (ultracite)
npm run fix           # Auto-fix lint issues

npm run db:push       # Push schema changes to DB
npm run db:studio     # Open Drizzle Studio
npm run db:start      # Start Docker containers
npm run db:stop       # Stop Docker containers
```

## Load Testing

Target: **300,000 requests** to validate the chunking pipeline.

```js
// k6 load test
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    chunk_uploads: {
      executor: "constant-arrival-rate",
      rate: 5000,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 500,
      maxVUs: 1000,
    },
  },
};

export default function () {
  const res = http.post("http://localhost:3000/api/chunks/upload",
    JSON.stringify({ chunkId: `chunk-${__VU}-${__ITER}`, data: btoa("x".repeat(1024)), sessionId: "load-test", userName: "k6" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "status 200": (r) => r.status === 200 });
}
```

```bash
k6 run load-test.js
```
