import { Constants } from 'librechat-data-provider';
import {
  applyPendingPasteToDraft,
  getComposerDraftId,
  getNewConversationDraftId,
  getNewConversationDraftToken,
  getPendingDraftId,
  isNewConversationDraftId,
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

describe('getNewConversationDraftId', () => {
  it('keeps the primary composer on the historical NEW_CONVO key', () => {
    expect(getNewConversationDraftId()).toBe(Constants.NEW_CONVO);
    expect(getNewConversationDraftId(0)).toBe(Constants.NEW_CONVO);
  });

  it('suffixes additional composer indexes', () => {
    expect(getNewConversationDraftId(1)).toBe(`${Constants.NEW_CONVO}:1`);
  });

  it('treats suffixed keys as new-conversation drafts', () => {
    expect(isNewConversationDraftId(Constants.NEW_CONVO)).toBe(true);
    expect(isNewConversationDraftId(`${Constants.NEW_CONVO}:1`)).toBe(true);
    expect(isNewConversationDraftId('convo-1')).toBe(false);
  });

  it('scopes idle unsaved drafts and in-flight drafts separately', () => {
    expect(getComposerDraftId(1, Constants.NEW_CONVO)).toBe(`${Constants.NEW_CONVO}:1`);
    expect(getComposerDraftId(1, Constants.NEW_CONVO, true)).toBe(`${Constants.PENDING_CONVO}:1`);
    expect(getComposerDraftId(1, 'convo-side')).toBe('convo-side');
  });
});

describe('applyPendingPasteToDraft', () => {
  it('replaces a stale selected range when the original text is still present', () => {
    expect(
      applyPendingPasteToDraft('before selected after', {
        text: 'pasted',
        selectionStart: 7,
        selectionEnd: 15,
        replacedText: 'selected',
      }),
    ).toBe('before pasted after');
  });

  it('inserts at the caret when the selected range is already gone', () => {
    expect(
      applyPendingPasteToDraft('before  after', {
        text: 'pasted',
        selectionStart: 7,
        selectionEnd: 15,
        replacedText: 'selected',
      }),
    ).toBe('before pasted after');
  });

  it('inserts at the caret when no replacement range was stored', () => {
    expect(
      applyPendingPasteToDraft('before  after', {
        text: 'pasted',
        selectionStart: 7,
      }),
    ).toBe('before pasted after');
  });
});
