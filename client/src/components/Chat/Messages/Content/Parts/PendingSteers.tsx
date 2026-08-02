import { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import EscalateNowButton from '~/components/Chat/Input/EscalateNowButton';
import { hasLiveToolApproval } from '~/hooks/Chat/useSteering';
import useSteerEscalate from '~/hooks/Chat/useSteerEscalate';
import useSteerRecovery from '~/hooks/Chat/useSteerRecovery';
import { useGetMessagesByConvoId } from '~/data-provider';
import { escalatingSteerFamily } from '~/store/steer';
import { useLocalize } from '~/hooks';
import SteerPart from './SteerPart';
import { cn } from '~/utils';
import store from '~/store';

const ACTION_CLASS =
  'rounded text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';

/**
 * Steers that have not been confirmed by the server yet, rendered at the tail
 * of the streaming reply — the place the words will land — instead of in a
 * floating overlay over the composer. Confirmation swaps them for the real
 * `ContentTypes.STEER` part (`useResumableSSE` removes the pending entry), so
 * the row's whole job is to hold the position and admit it is provisional.
 */
interface PendingSteersProps {
  conversationId: string;
}

function PendingSteers({ conversationId }: PendingSteersProps) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const { retry, sendAsNew } = useSteerRecovery(conversationId);
  const escalate = useSteerEscalate(conversationId);
  const escalating = useAtomValue(escalatingSteerFamily(conversationId));
  /* Reads the cache the composer already populates, so the escalation control
     is gated on the same pause the composer sees rather than round-tripping to
     discover the run cannot accept an arm. Boolean `select` for the same reason
     the composer uses one: streaming deltas must not re-render this row. */
  const { data: paused } = useGetMessagesByConvoId<boolean>(conversationId, {
    select: hasLiveToolApproval,
  });
  /* Only one interrupt can be unresolved at a time: a second arm would seal the
     same run twice. The flag covers an arm's round trip, before its own chip
     can report `preempt`. */
  const interruptPending = useMemo(
    () => escalating || steers.some((steer) => steer.preempt === true && steer.status !== 'failed'),
    [escalating, steers],
  );

  if (steers.length === 0) {
    return null;
  }

  return (
    <div role="list" aria-label={localize('com_ui_steer_in_flight')} data-testid="pending-steers">
      {steers.map((steer) => (
        <div
          key={steer.steerId}
          role="listitem"
          className={cn(steer.status !== 'failed' && 'opacity-60')}
        >
          <SteerPart
            steer={steer.text}
            files={steer.files}
            steerId={steer.steerId}
            createdAt={steer.createdAt}
          />
          {steer.status === 'failed' ? (
            <div className="-mt-2 mb-2 flex items-center gap-3 pl-9 text-xs">
              <span className="text-red-500">{localize('com_ui_steer_failed_inline')}</span>
              <button type="button" onClick={() => retry(steer.steerId)} className={ACTION_CLASS}>
                {localize('com_ui_retry')}
              </button>
              <button
                type="button"
                onClick={() => sendAsNew(steer.steerId)}
                className={ACTION_CLASS}
              >
                {localize('com_ui_send_as_new')}
              </button>
            </div>
          ) : (
            <div className="-mt-2 mb-2 flex items-center gap-2 pl-9 text-xs text-text-secondary">
              <span>
                {localize(
                  steer.preempt === true ? 'com_ui_steer_in_flight_preempt' : 'com_ui_sending',
                )}
              </span>
              {/* Only a `pending` steer can be armed: `sending` has no server id
                  yet, and one already interrupting has nothing left to escalate. */}
              {steer.status === 'pending' && steer.preempt !== true && (
                <EscalateNowButton
                  surface="bubble"
                  messageText={steer.text}
                  disabled={paused === true || interruptPending}
                  onClick={() =>
                    escalate({
                      steerId: steer.steerId,
                      generationCreatedAt: steer.generationCreatedAt,
                    })
                  }
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(PendingSteers);
