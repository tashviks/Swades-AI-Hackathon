"use client";

import { useCallback, useRef, useState } from "react";
import { env } from "@my-better-t-app/env/web";
import { opfs } from "./use-opfs";
import type { WavChunk } from "./use-recorder";

export type ChunkUploadStatus = "pending" | "uploading" | "done" | "error";

export interface ChunkState {
  chunkId: string;
  status: ChunkUploadStatus;
  transcript?: string;
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte)
  }
  return btoa(binary)
}

const uploadChunkToServer = async (
  sessionId: string,
  chunkId: string,
  blob: Blob,
  userName: string,
): Promise<string | undefined> => {
  const data = await blobToBase64(blob);
  const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/chunks/upload`, {
    body: JSON.stringify({ chunkId, data, sessionId, userName }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {throw new Error(`Upload failed: ${res.status}`);}
  const json = (await res.json()) as { transcript?: string };
  return json.transcript;
};

interface UseUploadPipelineOptions {
  sessionId: string;
  userName: string;
}

export const useUploadPipeline = ({ sessionId, userName }: UseUploadPipelineOptions) => {
  const [chunkStates, setChunkStates] = useState<Record<string, ChunkUploadStatus>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const setStatus = (chunkId: string, status: ChunkUploadStatus) => {
    setChunkStates((prev) => ({ ...prev, [chunkId]: status }));
  };

  // Called as each chunk is produced by the recorder.
  // 1. Persist to OPFS first
  // 2. Upload to server (bucket + DB ack)
  // 3. Only delete from OPFS after confirmed
  const enqueue = useCallback(
    async (chunk: WavChunk) => {
      const { id: chunkId, blob } = chunk;
      if (inFlight.current.has(chunkId)) {return;}
      inFlight.current.add(chunkId);

      setStatus(chunkId, "pending");

      // Step 1: persist to OPFS
      await opfs.write(sessionId, chunkId, blob);

      setStatus(chunkId, "uploading");

      try {
        // Step 2: upload to server
        const transcript = await uploadChunkToServer(sessionId, chunkId, blob, userName);

        // Step 3: confirmed — safe to remove from OPFS
        await opfs.delete(sessionId, chunkId);
        setStatus(chunkId, "done");
        if (transcript) {
          setTranscripts((prev) => ({ ...prev, [chunkId]: transcript }));
        }
      } catch {
        // Leave in OPFS for reconciliation
        setStatus(chunkId, "error");
      } finally {
        inFlight.current.delete(chunkId);
      }
    },
    [sessionId],
  );

  // Run reconciliation: ask server which chunks are missing from bucket,
  // then re-upload them from OPFS.
  const reconcile = useCallback(async () => {
    const localIds = await opfs.listChunkIds(sessionId);
    if (localIds.length === 0) {return;}

    const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/chunks/reconcile`, {
      body: JSON.stringify({ chunkIds: localIds, sessionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) {throw new Error(`Reconcile failed: ${res.status}`);}

    const { missing, unacked } = (await res.json()) as {
      missing: string[];
      unacked: string[];
    };

    const toReupload = [...new Set([...missing, ...unacked])];

    for (const chunkId of toReupload) {
      const blob = await opfs.read(sessionId, chunkId);
      if (!blob) {continue;}

      setStatus(chunkId, "uploading");
      try {
        const transcript = await uploadChunkToServer(sessionId, chunkId, blob, userName);
        await opfs.delete(sessionId, chunkId);
        setStatus(chunkId, "done");
        if (transcript) {
          setTranscripts((prev) => ({ ...prev, [chunkId]: transcript }));
        }
      } catch {
        setStatus(chunkId, "error");
      }
    }
  }, [sessionId]);

  return { chunkStates, enqueue, reconcile, transcripts };
};
