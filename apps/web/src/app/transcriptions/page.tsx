"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, User } from "lucide-react";
import { env } from "@my-better-t-app/env/web";
import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";

interface TranscriptEntry {
  ackedAt: string;
  chunkId: string;
  sessionId: string;
  transcript: string | null;
}

type UserTranscripts = Record<string, TranscriptEntry[]>;

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function TranscriptionsPage() {
  const [users, setUsers] = useState<UserTranscripts>({});
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchTranscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/chunks/transcriptions`);
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`);
      }
      const data = (await res.json()) as { users: UserTranscripts };
      setUsers(data.users);
      setLastFetched(new Date());
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    void fetchTranscriptions();
    const interval = setInterval(() => void fetchTranscriptions(), 10_000);
    return () => clearInterval(interval);
  }, [fetchTranscriptions]);

  const userNames = Object.keys(users).sort();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transcriptions</h1>
          {lastFetched && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated {lastFetched.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchTranscriptions} disabled={loading}>
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {userNames.length === 0 && !loading && (
        <p className="text-muted-foreground text-sm text-center py-12">
          No transcriptions yet. Start recording to see them here.
        </p>
      )}

      {userNames.map((userName) => {
        const entries = users[userName] ?? [];
        const withTranscript = entries.filter((e) => e.transcript);

        return (
          <Card key={userName}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" />
                {userName}
              </CardTitle>
              <CardDescription>
                {withTranscript.length} of {entries.length} chunks transcribed
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {entries.map((entry) => (
                <div key={entry.chunkId} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(entry.ackedAt)}
                  </span>
                  {entry.transcript ? (
                    <p className="text-sm">{entry.transcript}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No transcript</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
