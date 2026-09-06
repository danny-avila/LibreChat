type CommitSink = (id: string, durationMs: number) => void;

let sink: CommitSink | null = null;

export function setCommitSink(next: CommitSink | null): void {
  sink = next;
}

export function reportCommit(id: string, durationMs: number): void {
  sink?.(id, durationMs);
}
