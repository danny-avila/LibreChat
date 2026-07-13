import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { SteerPart } from './Parts';
import store from '~/store';

/**
 * Steers the server hasn't applied yet, rendered in-thread at the end of the
 * streaming assistant message — the projected injection point, since the next
 * tool-batch boundary is always after everything streamed so far. A submitted
 * steer is part of the history the moment it's sent; `on_steer_applied`
 * then drops the optimistic entry as the persisted part lands at its
 * authoritative index. Failed steers leave the thread for the composer's
 * recovery row (retry / edit / queue).
 */
const PendingSteers = memo(function PendingSteers({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  const steers = useRecoilValue(store.pendingSteersByConvoId(conversationId ?? ''));
  if (steers.length === 0) {
    return null;
  }
  return (
    <>
      {steers.map((steer) =>
        steer.status === 'failed' ? null : (
          <SteerPart
            key={steer.steerId}
            steer={steer.text}
            files={steer.files}
            steerId={steer.steerId}
            createdAt={steer.createdAt}
            pending
          />
        ),
      )}
    </>
  );
});

export default PendingSteers;
