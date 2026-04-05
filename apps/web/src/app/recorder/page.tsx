"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Download,
  Loader,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { useRecorder } from "@/hooks/use-recorder";
import type { WavChunk } from "@/hooks/use-recorder";
import { useUploadPipeline } from "@/hooks/use-upload-pipeline";
import type { ChunkUploadStatus } from "@/hooks/use-upload-pipeline";

const USER_NAME_KEY = "recorder_user_name";

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
};

const formatDuration = (seconds: number): string => `${seconds.toFixed(1)}s`;

const StatusIcon = ({ status }: { status: ChunkUploadStatus }) => {
  if (status === "done") {
    return <CheckCircle className="size-3 text-green-500" />;
  }
  if (status === "error") {
    return <XCircle className="size-3 text-destructive" />;
  }
  if (status === "uploading") {
    return <Loader className="size-3 animate-spin text-muted-foreground" />;
  }
  return <div className="size-3 rounded-full border border-muted-foreground/40" />;
};

interface ChunkRowProps {
  chunk: WavChunk;
  index: number;
  uploadStatus: ChunkUploadStatus | undefined;
  transcript: string | undefined;
}

const ChunkRow = ({ chunk, index, uploadStatus, transcript }: ChunkRowProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handleEnded = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      return;
    }
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  }, [playing]);

  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = chunk.url;
    a.download = `chunk-${index + 1}.wav`;
    a.click();
  }, [chunk.url, index]);

  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border/50 bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <audio ref={audioRef} src={chunk.url} onEnded={handleEnded} preload="none">
          <track kind="captions" />
        </audio>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          #{index + 1}
        </span>
        <span className="text-xs tabular-nums">{formatDuration(chunk.duration)}</span>
        <span className="text-[10px] text-muted-foreground">16kHz PCM</span>
        <StatusIcon status={uploadStatus ?? "pending"} />
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggle}
            aria-label={playing ? "Stop" : "Play"}
          >
            {playing ? <Square className="size-3" /> : <Play className="size-3" />}
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={download} aria-label="Download chunk">
            <Download className="size-3" />
          </Button>
        </div>
      </div>
      {transcript && (
        <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-1">
          {transcript}
        </p>
      )}
      {uploadStatus === "uploading" && !transcript && (
        <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-1">
          Transcribing...
        </p>
      )}
    </div>
  );
};

export default function RecorderPage() {
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "User 1";
    }
    return localStorage.getItem(USER_NAME_KEY) ?? "User 1";
  });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userName);

  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const { status, start, stop, pause, resume, chunks, elapsed, stream, clearChunks } =
    useRecorder({ chunkDuration: 5 });

  const { chunkStates, enqueue, reconcile, transcripts } = useUploadPipeline({
    sessionId,
    userName,
  });

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isActive = isRecording || isPaused;

  const prevChunkCount = useRef(0);
  useEffect(() => {
    const newChunks = chunks.slice(prevChunkCount.current);
    prevChunkCount.current = chunks.length;
    for (const chunk of newChunks) {
      void enqueue(chunk);
    }
  }, [chunks, enqueue]);

  const handlePrimary = useCallback(() => {
    if (isActive) {
      stop();
    } else {
      start();
    }
  }, [isActive, stop, start]);

  const handleReconcile = useCallback(async () => {
    try {
      await reconcile();
      toast.success("Reconciliation complete");
    } catch {
      toast.error("Reconciliation failed");
    }
  }, [reconcile]);

  const saveName = useCallback(() => {
    const trimmed = nameInput.trim() || "User 1";
    setUserName(trimmed);
    localStorage.setItem(USER_NAME_KEY, trimmed);
    setEditingName(false);
  }, [nameInput]);

  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-8">
      {/* User name */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Your Name</CardTitle>
          <CardDescription>Used to label your transcriptions</CardDescription>
        </CardHeader>
        <CardContent>
          {editingName ? (
            <div className="flex gap-2">
              <Label htmlFor="user-name" className="sr-only">
                Your name
              </Label>
              <Input
                id="user-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveName();
                  }
                }}
                autoFocus
              />
              <Button size="sm" onClick={saveName}>
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-medium">{userName}</span>
              <Button variant="outline" size="sm" onClick={() => setEditingName(true)}>
                Change
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recorder */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Recorder</CardTitle>
          <CardDescription>16 kHz / 16-bit PCM WAV — chunked every 5 s</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20 text-foreground">
            <LiveWaveform
              active={isRecording}
              processing={isPaused}
              stream={stream}
              height={80}
              barWidth={3}
              barGap={1}
              barRadius={2}
              sensitivity={1.8}
              smoothingTimeConstant={0.85}
              fadeEdges
              fadeWidth={32}
              mode="static"
            />
          </div>

          <div className="text-center font-mono text-3xl tabular-nums tracking-tight">
            {formatTime(elapsed)}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant={isActive ? "destructive" : "default"}
              className="gap-2 px-5"
              onClick={handlePrimary}
              disabled={status === "requesting"}
            >
              {isActive ? (
                <>
                  <Square className="size-4" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  {status === "requesting" ? "Requesting..." : "Record"}
                </>
              )}
            </Button>

            {isActive && (
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                onClick={isPaused ? resume : pause}
              >
                {isPaused ? (
                  <>
                    <Play className="size-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chunks with transcripts */}
      {chunks.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Chunks</CardTitle>
            <CardDescription>{chunks.length} recorded</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {chunks.map((chunk, i) => (
              <ChunkRow
                key={chunk.id}
                chunk={chunk}
                index={i}
                uploadStatus={chunkStates[chunk.id]}
                transcript={transcripts[chunk.id]}
              />
            ))}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReconcile}>
                <RefreshCw className="size-3" />
                Reconcile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={clearChunks}
              >
                <Trash2 className="size-3" />
                Clear all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
