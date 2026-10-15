import { useMemo, useRef } from 'react';
import { useStore } from 'jotai';
import { useRecoilCallback } from 'recoil';
import {
  seedPendingSteers,
  settledSteerQuotes,
  removePendingSteers,
  RUN_ENDED_STATUSES,
  acceptedClientSteerIds,
  withoutRecoveredSteers,
  updatePendingSteerLabels,
  selectLocalSteersForQueue,
} from '@librechat/chat';
import type { TPendingSteer, TSteerUpdatedEvent } from 'librechat-data-provider';
import type { GenerationProtocolVersion, PendingSteer } from '@librechat/chat';
import {
  mergeRestagedQuotes,
  appendAppliedSteerIds,
  collectAppliedSteerIds,
  collectDroppedSteerQuotes,
} from '~/utils';
import { pendingQuotesByConvoId } from '~/components/Chat/Input/Composer/state';
import { queuedMessagesByConvoId } from '~/hooks/Chat/queue';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { useFileMapContext } from '~/Providers';
import store from '~/store';

/**
 * The one place the stream handlers write steer state: pending-steer chips,
 * the applied and accepted id sets, the quotes a lost chip restages, and the
 * generation epoch a conversation's live run carries. The rules live in the
 * chat core (`core/steer/chips`); this binds them to the app's atoms.
 */
export default function useSteerState() {
  const jotaiStore = useStore();
  const fileMap = useFileMapContext();
  const fileMapRef = useRef(fileMap);
  fileMapRef.current = fileMap;

  /** Converts steers that never reached an injection boundary into queued
   *  follow-up messages (reported on the run's final/abort event; the abort
   *  HTTP response consumes the same data as a fallback in useChatHelpers). */
  const convertSteersToQueued = useSteerConvert();

  /** Removes the pending chip once its steer is injected (the inline content
   *  part becomes the durable record), and records the id so a 202 ACK that
   *  arrives AFTER the applied event drops its chip instead of re-minting it.
   *  Returns the ids seen by the durable set for the first time: the caller
   *  stamps these as live-applied only when it actually commits the inline
   *  part, so an abandoned placement or a replayed event cannot arm a draw-in
   *  with no part mounting to consume it. */
  const resolveSteerChip = useRecoilCallback(
    ({ snapshot, set }) =>
      (
        conversationId: string,
        steerId: string,
        clientSteerId?: string,
        appliedPartQuotes?: string[],
      ): string[] => {
        const settledIds = clientSteerId ? [steerId, clientSteerId] : [steerId];
        /** A part applied by a pre-quotes server carries no quotes while the
         *  chip being settled may hold the only copy of the user's excerpts
         *  (its 202 was lost, so the ACK-echo restore never ran). Re-stage
         *  them before removal; `mergeRestagedQuotes` keeps this idempotent
         *  with the ACK path for the same excerpts. */
        if (appliedPartQuotes == null || appliedPartQuotes.length === 0) {
          const droppedQuotes = settledSteerQuotes(
            snapshot.getLoadable(store.pendingSteersByConvoId(conversationId)).getValue(),
            settledIds,
          );
          if (droppedQuotes != null) {
            jotaiStore.set(pendingQuotesByConvoId(conversationId), (prev) =>
              mergeRestagedQuotes(prev, droppedQuotes),
            );
          }
        }
        const alreadyApplied = snapshot
          .getLoadable(store.appliedSteerIdsByConvoId(conversationId))
          .getValue();
        const firstApplication = settledIds.filter((id) => !alreadyApplied.includes(id));
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          appendAppliedSteerIds(prev, settledIds),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          removePendingSteers(prev, settledIds),
        );
        jotaiStore.set(queuedMessagesByConvoId(conversationId), (prev) =>
          withoutRecoveredSteers(prev, settledIds),
        );
        return firstApplication;
      },
    [jotaiStore],
  );

  /** Capability can change while the same generation resumes after HITL. */
  const updateSteerChips = useRecoilCallback(
    ({ set }) =>
      (event: TSteerUpdatedEvent) => {
        const acceptedClientIds = acceptedClientSteerIds(event.steers);
        if (acceptedClientIds.length > 0) {
          set(store.acceptedSteerClientIdsByConvoId(event.conversationId), (prev) =>
            appendAppliedSteerIds(prev, acceptedClientIds),
          );
        }
        set(store.pendingSteersByConvoId(event.conversationId), (prev) =>
          updatePendingSteerLabels(prev, event.steers),
        );
      },
    [],
  );

  /** Replaces the chip list with the server's still-queued steers (sync, resume). */
  const seedSteerChips = useRecoilCallback(
    ({ set }) =>
      (
        conversationId: string,
        steers: TPendingSteer[] | undefined,
        generationCreatedAt?: number,
        generationProtocolVersion: GenerationProtocolVersion = 1,
      ) => {
        const acceptedClientIds = acceptedClientSteerIds(steers);
        if (acceptedClientIds.length > 0) {
          set(store.acceptedSteerClientIdsByConvoId(conversationId), (prev) =>
            appendAppliedSteerIds(prev, acceptedClientIds),
          );
        }
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          seedPendingSteers(prev, steers, {
            generationCreatedAt,
            generationProtocolVersion,
            storedFiles: fileMapRef.current,
          }),
        );
      },
    [],
  );

  /** Settles the chips of every steer whose applied part already rides `values`. */
  const settleAppliedSteerParts = useRecoilCallback(
    ({ snapshot, set }) =>
      (conversationId: string, values: unknown[] | undefined) => {
        const ids = collectAppliedSteerIds(values);
        if (ids.length === 0) {
          return;
        }
        /** Chips settled by quote-less applied parts hold the only copy of
         *  their excerpts (a pre-quotes server injected the words bare):
         *  re-stage them as composer chips before the removal below. */
        const droppedQuotes = collectDroppedSteerQuotes(
          values,
          snapshot.getLoadable(store.pendingSteersByConvoId(conversationId)).getValue(),
        );
        if (droppedQuotes.length > 0) {
          jotaiStore.set(pendingQuotesByConvoId(conversationId), (prev) =>
            mergeRestagedQuotes(prev, droppedQuotes),
          );
        }
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          appendAppliedSteerIds(prev, ids),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) => removePendingSteers(prev, ids));
      },
    [jotaiStore],
  );

  /** Sweeps this conversation's local chips (see `selectLocalSteersForQueue`)
   *  into queued follow-ups. Error events carry no `pendingSteers` payload of
   *  their own (the server drops its copy on failure); this is the only
   *  source of truth for those runs; the `final` and error/404 terminals call
   *  it (default `statuses`, i.e. `pending || failed`) alongside their own
   *  server-reported list as a backstop for `failed` chips, which never rode
   *  that list at all. The intentional-abort path passes `statuses: ['failed']`
   *  since the run may still be live server-side there (see its call site). */
  const convertLocalSteersToQueued = useRecoilCallback(
    ({ snapshot }) =>
      (
        conversationId: string,
        options?: {
          claimParked?: boolean;
          statuses?: readonly PendingSteer['status'][];
          excludeSteerIds?: Iterable<string>;
          generationProtocolVersion?: GenerationProtocolVersion;
        },
      ) => {
        const chips = snapshot.getLoadable(store.pendingSteersByConvoId(conversationId)).getValue();
        const generationProtocolVersion =
          options?.generationProtocolVersion ??
          snapshot
            .getLoadable(store.activeGenerationProtocolVersionByConvoId(conversationId))
            .getValue();
        const activeStatuses = options?.statuses ?? RUN_ENDED_STATUSES;
        const excluded = new Set(options?.excludeSteerIds ?? []);
        const accepted = selectLocalSteersForQueue(
          chips,
          activeStatuses.filter((status) => status === 'pending'),
          excluded,
        );
        if (accepted.length > 0) {
          convertSteersToQueued(conversationId, accepted, {
            claimParked: options?.claimParked,
            generationProtocolVersion,
          });
        }
        const failed = selectLocalSteersForQueue(
          chips,
          activeStatuses.filter((status) => status === 'failed'),
          excluded,
        );
        if (failed.length > 0) {
          convertSteersToQueued(conversationId, failed, {
            generationProtocolVersion,
            bindRecoverySource: false,
            /** Swept out of the chip surface so it cannot render under the next
             *  reply, but the server refused these words: the rail holds the row
             *  for Retry or an explicit send instead of draining it automatically. */
            needsExplicitSend: true,
          });
        }
      },
    [convertSteersToQueued],
  );

  /** Conversation ids are reused by successive agent turns. Keep the exact
   * live epoch beside the UI controls, and only clear it if the terminal event
   * still belongs to the epoch that installed it. */
  const updateActiveGenerationCreatedAt = useRecoilCallback(
    ({ snapshot, set }) =>
      (
        conversationId: string,
        next: number | null,
        expected?: number,
        generationProtocolVersion: GenerationProtocolVersion = 1,
      ): boolean => {
        const state = store.activeGenerationCreatedAtByConvoId(conversationId);
        if (expected != null && snapshot.getLoadable(state).getValue() !== expected) {
          return false;
        }
        set(state, next);
        set(
          store.activeGenerationProtocolVersionByConvoId(conversationId),
          next == null ? 1 : generationProtocolVersion,
        );
        return true;
      },
    [],
  );

  return useMemo(
    () => ({
      resolveSteerChip,
      updateSteerChips,
      seedSteerChips,
      settleAppliedSteerParts,
      convertSteersToQueued,
      convertLocalSteersToQueued,
      updateActiveGenerationCreatedAt,
    }),
    [
      resolveSteerChip,
      updateSteerChips,
      seedSteerChips,
      settleAppliedSteerParts,
      convertSteersToQueued,
      convertLocalSteersToQueued,
      updateActiveGenerationCreatedAt,
    ],
  );
}

export type SteerState = ReturnType<typeof useSteerState>;
