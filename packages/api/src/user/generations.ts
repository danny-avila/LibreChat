import type { GenerationJob } from '../types/stream';
import { waitForGenerationPersistence } from '../stream/persistence';
import { isStopConfirmed } from '../stream/interfaces/IJobStore';

type AbortOutcome = Parameters<typeof isStopConfirmed>[0];
type CleanupJob = Pick<GenerationJob, 'createdAt' | 'metadata'>;

/** The slice of the generation job manager needed to stop an account's runs. */
export interface UserGenerationControl {
  getAccountCleanupJobIdsForUser: (userId: string, tenantId?: string) => Promise<string[]>;
  getCleanupJob: (streamId: string) => Promise<CleanupJob | undefined>;
  abortJob: (
    streamId: string,
    options: { expectedCreatedAt: number; awaitProviderDrain: boolean },
  ) => Promise<AbortOutcome>;
}

/**
 * Time given to a generation that passed its admission check just before the account's deletion
 * marker was set to finish creating its job. Admission and job creation are consecutive awaits in
 * `createJob`, so a few seconds comfortably exceeds the window; the second drain then sees it.
 */
export const ADMISSION_GRACE_MS = 2000;

/**
 * Stops the user's in-flight and retained generations and waits for their final persistence,
 * so nothing is written for the account after its data is erased. The deletion marker must
 * already be set, which makes `createJob` refuse new runs. A run admitted just before the marker
 * is caught by a second drain after the grace period. Throws if a stop cannot be confirmed,
 * leaving the caller to keep the account and retry.
 */
export async function stopUserGenerations(
  userId: string,
  tenantId: string | undefined,
  control: UserGenerationControl,
  graceMs: number = ADMISSION_GRACE_MS,
): Promise<void> {
  const seen = new Set<string>();
  const drain = async (): Promise<void> => {
    const streamIds = await control.getAccountCleanupJobIdsForUser(userId, tenantId);
    const jobs = await Promise.all(
      streamIds.map(async (streamId) => ({
        streamId,
        job: await control.getCleanupJob(streamId),
      })),
    );
    const owned = jobs.filter(
      ({ streamId, job }) =>
        job?.metadata?.userId === userId &&
        (!job.metadata.tenantId || job.metadata.tenantId === tenantId) &&
        !seen.has(`${streamId}:${job.createdAt}`),
    );
    for (const { streamId, job } of owned) {
      seen.add(`${streamId}:${job!.createdAt}`);
    }
    const results = await Promise.all(
      owned.map(({ streamId, job }) =>
        control.abortJob(streamId, { expectedCreatedAt: job!.createdAt, awaitProviderDrain: true }),
      ),
    );
    if (results.some((result) => !isStopConfirmed(result))) {
      throw new Error('Agent generations could not be confirmed stopped');
    }
    await Promise.all(
      owned.map(({ streamId, job }) =>
        waitForGenerationPersistence(streamId, job!.createdAt, (id) => control.getCleanupJob(id)),
      ),
    );
  };

  await drain();
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  await drain();
}
