import { Constants } from 'librechat-data-provider';
import {
  getNewConversationDraftToken,
  getPendingDraftId,
  renewNewConversationDraftToken,
} from './drafts';

describe('new-conversation draft tokens', () => {
  it('keeps tokens independent across composer indexes', () => {
    const firstPaneToken = getNewConversationDraftToken(0);
    const secondPaneToken = getNewConversationDraftToken(1);

    expect(firstPaneToken).not.toBe(secondPaneToken);

    renewNewConversationDraftToken(1);

    expect(getNewConversationDraftToken(0)).toBe(firstPaneToken);
    expect(getNewConversationDraftToken(1)).not.toBe(secondPaneToken);
  });
});

describe('getPendingDraftId', () => {
  it('keeps the primary composer on the historical PENDING key', () => {
    expect(getPendingDraftId()).toBe(Constants.PENDING_CONVO);
    expect(getPendingDraftId(0)).toBe(Constants.PENDING_CONVO);
  });

  it('suffixes additional composer indexes', () => {
    expect(getPendingDraftId(1)).toBe(`${Constants.PENDING_CONVO}:1`);
  });
});
