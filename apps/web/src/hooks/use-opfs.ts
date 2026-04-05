"use client";

// OPFS (Origin Private File System) persistence for WAV chunks.
// Chunks are written here BEFORE any network call so nothing is lost
// on tab close or network drop. Only cleared after bucket + DB are confirmed.

const OPFS_DIR = "chunks";

const getDir = async (): Promise<FileSystemDirectoryHandle> => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
};

export const opfs = {
  delete: async (sessionId: string, chunkId: string): Promise<void> => {
    try {
      const dir = await getDir();
      const sessionDir = await dir.getDirectoryHandle(sessionId);
      await sessionDir.removeEntry(`${chunkId}.wav`);
    } catch {
      // already gone — that's fine
    }
  },

  listChunkIds: async (sessionId: string): Promise<string[]> => {
    try {
      const dir = await getDir();
      const sessionDir = await dir.getDirectoryHandle(sessionId);
      const ids: string[] = [];
      const iter = sessionDir as unknown as AsyncIterable<[string, FileSystemHandle]>;
      for await (const [name] of iter) {
        if (name.endsWith(".wav")) {
          ids.push(name.slice(0, -4));
        }
      }
      return ids;
    } catch {
      return [];
    }
  },

  read: async (sessionId: string, chunkId: string): Promise<Blob | null> => {
    try {
      const dir = await getDir();
      const sessionDir = await dir.getDirectoryHandle(sessionId);
      const file = await sessionDir.getFileHandle(`${chunkId}.wav`);
      const f = await file.getFile();
      return new Blob([await f.arrayBuffer()], { type: "audio/wav" });
    } catch {
      return null;
    }
  },

  write: async (sessionId: string, chunkId: string, blob: Blob): Promise<void> => {
    const dir = await getDir();
    const sessionDir = await dir.getDirectoryHandle(sessionId, { create: true });
    const file = await sessionDir.getFileHandle(`${chunkId}.wav`, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
  },
};
