import { useEffect, useRef } from 'react';
import type { TAgentJob, TAgentJobClientOp } from 'librechat-data-provider';
import type { LocalFileReadResult } from '~/hooks/LocalFiles/types';
import { useSubmitClientOpResultMutation } from '~/data-provider/Jobs/mutations';
import { useActiveAgentJobs } from '~/hooks/Jobs/useConversationJob';
import useLocalFilesContext from '~/hooks/LocalFiles/LocalFilesContext';

function clientOpKey(job: TAgentJob, op: TAgentJobClientOp): string {
  return `${job._id}:${job.updatedAt ?? ''}:${op.op}:${op.path ?? ''}:${op.contentRef ?? ''}:${op.content?.length ?? 0}`;
}

async function executeClientOp(
  op: TAgentJobClientOp,
  handlers: {
    listDir: (path: string) => Promise<unknown>;
    readFile: (path: string) => Promise<LocalFileReadResult>;
    writeFile: (path: string, content: string) => Promise<void>;
  },
): Promise<unknown> {
  switch (op.op) {
    case 'listDir':
      return handlers.listDir(op.path ?? '');
    case 'readFile':
      return handlers.readFile(op.path ?? '');
    case 'writeFile': {
      if (typeof op.content !== 'string') {
        throw new Error('Write operation is missing inline content');
      }
      await handlers.writeFile(op.path ?? '', op.content);
      return { written: true, path: op.path };
    }
    default:
      throw new Error(`Unsupported client operation: ${String(op.op)}`);
  }
}

/**
 * Services pending local file operations for active background jobs.
 * When a job enters `waiting_client` with `pendingClientOp`, this hook runs
 * the op against the connected directory handle and posts the result back.
 */
export default function useJobClientOpBridge(): void {
  const { status, listDir, readFile, writeFile } = useLocalFilesContext();
  const { data } = useActiveAgentJobs();
  const inFlightRef = useRef(new Set<string>());
  const { mutateAsync } = useSubmitClientOpResultMutation();

  useEffect(() => {
    if (status !== 'connected') {
      return;
    }

    const waitingJobs =
      data?.jobs?.filter(
        (entry) => entry.status === 'waiting_client' && entry.pendingClientOp?.op,
      ) ?? [];

    for (const job of waitingJobs) {
      const op = job.pendingClientOp;
      if (!op) {
        continue;
      }

      const key = clientOpKey(job, op);
      if (inFlightRef.current.has(key)) {
        continue;
      }
      inFlightRef.current.add(key);

      void (async () => {
        try {
          const result = await executeClientOp(op, { listDir, readFile, writeFile });
          await mutateAsync({
            jobId: job._id,
            payload: { success: true, result },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await mutateAsync({
            jobId: job._id,
            payload: { success: false, error: message },
          });
        } finally {
          inFlightRef.current.delete(key);
        }
      })();
    }
  }, [data?.jobs, status, listDir, readFile, writeFile, mutateAsync]);
}
