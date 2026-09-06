import { useEffect, useState } from 'react';
import type { PerfSnapshot } from '~/lib/perf';
import { setCommitSink } from '~/lib/perf/commit';
import { perfMonitor } from '~/lib/perf';

export function usePerfSnapshot(active: boolean): PerfSnapshot {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => perfMonitor.getSnapshot());

  useEffect(() => {
    if (!active) {
      perfMonitor.stop();
      return;
    }

    perfMonitor.start();
    setCommitSink((id, durationMs) => perfMonitor.recordCommit(id, durationMs));
    const unsubscribe = perfMonitor.subscribe(setSnapshot);

    return () => {
      unsubscribe();
      setCommitSink(null);
      perfMonitor.stop();
    };
  }, [active]);

  return snapshot;
}
