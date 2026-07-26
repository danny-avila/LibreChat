import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import useSteerRecovery from '~/hooks/Chat/useSteerRecovery';
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
function PendingSteers({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId));
  const { retry, sendAsNew } = useSteerRecovery(conversationId);

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
            <div className="-mt-2 mb-2 pl-9 text-xs text-text-secondary">
              {localize('com_ui_sending')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(PendingSteers);
