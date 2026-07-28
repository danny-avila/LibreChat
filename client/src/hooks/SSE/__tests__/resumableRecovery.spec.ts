import { QueryClient } from '@tanstack/react-query';
import {
  beginResumableRun,
  getDisconnectedRunRecovery,
  getPendingRunReconciliations,
  markTerminalEventSeen,
  moveDisconnectedRunToPendingReconciliation,
  queuePendingRunReconciliation,
  setDisconnectedRunRecovery,
} from '../resumableRecovery';

const CONVERSATION_ID = 'recovery-conversation';
const RECOVERY = {
  startedAsNewConvo: false,
  created: true,
  userMessageId: 'recovery-user',
  responseMessageId: 'recovery-response_',
};

describe('resumable recovery tasks', () => {
  it('moves the current disconnected run into an epoch-bound pending task', () => {
    const queryClient = new QueryClient();
    beginResumableRun(queryClient, CONVERSATION_ID);
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, RECOVERY);

    const task = moveDisconnectedRunToPendingReconciliation(queryClient, CONVERSATION_ID);

    expect(task).toMatchObject({ ...RECOVERY, runEpoch: 1 });
    expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    expect(getPendingRunReconciliations(queryClient, CONVERSATION_ID)).toEqual([task]);
  });

  it('deduplicates the same task while preserving tasks from later epochs', () => {
    const queryClient = new QueryClient();

    queuePendingRunReconciliation(queryClient, CONVERSATION_ID, RECOVERY, 1);
    queuePendingRunReconciliation(queryClient, CONVERSATION_ID, RECOVERY, 1);
    queuePendingRunReconciliation(queryClient, CONVERSATION_ID, RECOVERY, 2);

    expect(getPendingRunReconciliations(queryClient, CONVERSATION_ID)).toHaveLength(2);
  });

  it('does not discard historical tasks when the current run receives a terminal event', () => {
    const queryClient = new QueryClient();
    queuePendingRunReconciliation(queryClient, CONVERSATION_ID, RECOVERY, 1);
    setDisconnectedRunRecovery(queryClient, CONVERSATION_ID, {
      ...RECOVERY,
      userMessageId: 'current-user',
      responseMessageId: 'current-response_',
    });

    markTerminalEventSeen(queryClient, CONVERSATION_ID);

    expect(getDisconnectedRunRecovery(queryClient, CONVERSATION_ID)).toBeUndefined();
    expect(getPendingRunReconciliations(queryClient, CONVERSATION_ID)).toHaveLength(1);
  });
});
