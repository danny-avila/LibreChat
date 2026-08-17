import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import {
  applyPendingPasteToDraft,
  applyPendingPastesToDraft,
  clearComposerDrafts,
  decodeBase64,
  encodeBase64,
  resolvePendingPasteInsertStart,
  getComposerDraftId,
  getDraft,
  getFilesDraft,
  getNewConversationDraftId,
  getNewConversationDraftToken,
  getPendingDraftId,
  isNewConversationDraftId,
  migrateFilesDraft,
  migrateTextDraft,
  renewNewConversationDraftToken,
  setDraft,
  setFilesDraft,
  setPendingTextAttachmentDraft,
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

  it('does not delete remaining identical text after a post-replacement snapshot', () => {
    expect(
      applyPendingPasteToDraft('abc', {
        text: 'PASTE',
        selectionStart: 0,
        replacedText: 'abc',
        replacedApplied: true,
        anchorBefore: '',
        anchorAfter: 'abc',
      }),
    ).toBe('PASTEabc');
  });
});

describe('applyPendingPastesToDraft', () => {
  it('rebases an earlier end replacement after a later start replacement', () => {
    const pastes = [
      {
        text: 'END',
        selectionStart: 10,
        selectionEnd: 14,
        replacedText: 'CCCC',
        sequence: 1,
      },
      {
        text: 'START',
        selectionStart: 0,
        selectionEnd: 4,
        replacedText: 'AAAA',
        sequence: 2,
      },
    ];

    expect(applyPendingPastesToDraft('AAAA BBBB CCCC', pastes)).toBe('START BBBB END');
    expect(applyPendingPastesToDraft(' BBBB ', pastes)).toBe('START BBBB END');
  });

  it('rebases an insert after the user edits text before the original caret', () => {
    expect(
      applyPendingPasteToDraft('Xhello', {
        text: 'PASTE',
        selectionStart: 5,
        replacedApplied: true,
        anchorBefore: 'hello',
        anchorAfter: '',
      }),
    ).toBe('XhelloPASTE');
  });

  it('rebases an insert past a prefix the user duplicated', () => {
    expect(
      applyPendingPasteToDraft('aabc', {
        text: 'PASTE',
        selectionStart: 1,
        replacedApplied: true,
        anchorBefore: 'a',
        anchorAfter: 'bc',
      }),
    ).toBe('aaPASTEbc');
  });

  it('keeps a leading insert ahead of a suffix the user duplicated', () => {
    expect(
      applyPendingPasteToDraft('abcabc', {
        text: 'PASTE',
        selectionStart: 0,
        replacedApplied: true,
        anchorBefore: '',
        anchorAfter: 'abc',
      }),
    ).toBe('PASTEabcabc');
  });

  it('rebases an insert when both sides of the original caret were edited', () => {
    expect(
      applyPendingPasteToDraft('XhelloWORLDY', {
        text: 'PASTE',
        selectionStart: 5,
        replacedApplied: true,
        anchorBefore: 'hello',
        anchorAfter: 'WORLD',
      }),
    ).toBe('XhelloPASTEWORLDY');
  });

  it('keeps a later replacement anchored after an earlier middle removal', () => {
    expect(
      applyPendingPastesToDraft('0123456789', [
        {
          text: 'MID',
          selectionStart: 2,
          replacedText: '234',
          sequence: 1,
        },
        {
          text: 'TAIL',
          selectionStart: 5,
          replacedText: '89',
          sequence: 2,
        },
      ]),
    ).toBe('01MID567TAIL');
  });
});

describe('clearComposerDrafts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears pane-scoped pending and new-chat keys without touching another pane', () => {
    setDraft({ id: Constants.NEW_CONVO as string, value: 'pane 0 new' });
    setDraft({ id: `${Constants.NEW_CONVO}:1`, value: 'pane 1 new' });
    setDraft({ id: Constants.PENDING_CONVO as string, value: 'pane 0 pending' });
    setDraft({ id: `${Constants.PENDING_CONVO}:1`, value: 'pane 1 pending' });
    setFilesDraft(`${Constants.PENDING_CONVO}:1`, {
      fileIds: ['pane-1-file'],
      pendingPastes: {
        'pane-1-file': { text: 'paste', selectionStart: 0 },
      },
    });

    clearComposerDrafts(1, Constants.NEW_CONVO as string);

    expect(getDraft(Constants.NEW_CONVO)).toBe('pane 0 new');
    expect(getDraft(Constants.PENDING_CONVO)).toBe('pane 0 pending');
    expect(
      localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.NEW_CONVO}:1`),
    ).toBeNull();
    expect(getDraft(`${Constants.PENDING_CONVO}:1`)).toBe('pane 1 pending');
    expect(
      localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.PENDING_CONVO}:1`),
    ).not.toBeNull();
  });

  it('does not clear an unrelated new-chat draft when a saved conversation finishes', () => {
    setDraft({ id: `${Constants.NEW_CONVO}:1`, value: 'unsent new chat' });
    setDraft({ id: 'convo-side', value: 'sent message leftover' });

    clearComposerDrafts(1, 'convo-side');

    expect(getDraft(`${Constants.NEW_CONVO}:1`)).toBe('unsent new chat');
    expect(getDraft('convo-side')).toBe('');
  });
});

describe('pending paste encoding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Past the argument limit that a spread into String.fromCharCode blows */
  const hugePaste = `${'a'.repeat(200000)} café 🧪`;

  it('round-trips a paste far larger than the call argument limit', () => {
    expect(decodeBase64(encodeBase64(hugePaste))).toBe(hugePaste);
  });

  it('stores and reads back a huge pending paste', () => {
    setPendingTextAttachmentDraft({
      id: 'convo-1',
      fileId: 'file-1',
      text: hugePaste,
      selectionStart: 0,
    });

    expect(getFilesDraft('convo-1').pendingPastes['file-1']?.text).toBe(hugePaste);
  });
});

describe('migrateFilesDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves the record to the destination key', () => {
    setFilesDraft('pending', {
      fileIds: ['file-1'],
      pendingPastes: { 'file-1': { text: 'pasted', selectionStart: 0 } },
    });

    expect(migrateFilesDraft('pending', 'convo-1')).toBe('convo-1');
    expect(getFilesDraft('convo-1').pendingPastes['file-1']?.text).toBe('pasted');
    expect(getFilesDraft('pending')).toEqual({ fileIds: [], pendingPastes: {} });
  });

  it('never holds the record under both keys at once', () => {
    setFilesDraft('pending', { fileIds: ['file-1'], pendingPastes: {} });
    const realSetItem = Storage.prototype.setItem;
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === `${LocalStorageKeys.FILES_DRAFT}convo-1`) {
        expect(localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}pending`)).toBeNull();
      }
      realSetItem.call(this, key, value);
    });

    expect(migrateFilesDraft('pending', 'convo-1')).toBe('convo-1');
    setItem.mockRestore();
  });

  it('leaves the record where it was when the destination write fails', () => {
    setFilesDraft('pending', {
      fileIds: ['file-1'],
      pendingPastes: { 'file-1': { text: 'pasted', selectionStart: 0 } },
    });
    const realSetItem = Storage.prototype.setItem;
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === `${LocalStorageKeys.FILES_DRAFT}convo-1`) {
        throw new Error('quota exceeded');
      }
      realSetItem.call(this, key, value);
    });

    expect(migrateFilesDraft('pending', 'convo-1')).toBe('pending');
    setItem.mockRestore();
    expect(getFilesDraft('pending').pendingPastes['file-1']?.text).toBe('pasted');
    expect(getFilesDraft('convo-1')).toEqual({ fileIds: [], pendingPastes: {} });
  });

  it('reports the destination when there is nothing to move', () => {
    expect(migrateFilesDraft('pending', 'convo-1')).toBe('convo-1');
  });
});

describe('migrateTextDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves the draft and reports that it did', () => {
    setDraft({ id: 'pending', value: 'carried over' });

    expect(migrateTextDraft('pending', 'convo-1')).toBe(true);
    expect(getDraft('convo-1')).toBe('carried over');
    expect(getDraft('pending')).toBe('');
  });

  it('reports nothing moved when the source is empty', () => {
    expect(migrateTextDraft('pending', 'convo-1')).toBe(false);
    expect(getDraft('convo-1')).toBe('');
  });
});

describe('setDraft persistExact', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('drops a one-character value by default', () => {
    setDraft({ id: 'convo-1', value: 'x' });
    expect(getDraft('convo-1')).toBe('');
  });

  it('keeps a one-character snapshot when persistExact is set', () => {
    setDraft({ id: 'convo-1', value: 'x', persistExact: true });
    expect(getDraft('convo-1')).toBe('x');
  });

  it('does not throw when localStorage.setItem fails', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() =>
      setDraft({ id: 'convo-1', value: 'draft text', persistExact: true }),
    ).not.toThrow();
    setItem.mockRestore();
  });

  it('returns empty drafts when localStorage.getItem throws', () => {
    setDraft({ id: 'convo-1', value: 'draft text', persistExact: true });
    setFilesDraft('convo-1', {
      fileIds: ['file-1'],
      pendingPastes: { 'file-1': { text: 'paste', selectionStart: 0 } },
    });
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(getFilesDraft('convo-1')).toEqual({ fileIds: [], pendingPastes: {} });
    expect(getDraft('convo-1')).toBe('');
    getItem.mockRestore();
  });
});

describe('resolvePendingPasteInsertStart', () => {
  it('moves the caret when text is prepended before the original snapshot', () => {
    expect(
      resolvePendingPasteInsertStart('Xhello', {
        text: 'PASTE',
        selectionStart: 5,
        anchorBefore: 'hello',
        anchorAfter: '',
      }),
    ).toBe(6);
  });

  it('finds the original junction when both sides of the caret were edited', () => {
    expect(
      resolvePendingPasteInsertStart('XhelloWORLDY', {
        text: 'PASTE',
        selectionStart: 5,
        anchorBefore: 'hello',
        anchorAfter: 'WORLD',
      }),
    ).toBe(6);
  });

  it('picks the junction the anchors still meet at when an edit duplicates the prefix', () => {
    expect(
      resolvePendingPasteInsertStart('aabc', {
        text: 'PASTE',
        selectionStart: 1,
        anchorBefore: 'a',
        anchorAfter: 'bc',
      }),
    ).toBe(2);
  });

  it('keeps the duplicated prefix junction when the tail was edited too', () => {
    expect(
      resolvePendingPasteInsertStart('aabcX', {
        text: 'PASTE',
        selectionStart: 1,
        anchorBefore: 'a',
        anchorAfter: 'bc',
      }),
    ).toBe(2);
  });

  it('holds the captured caret when a duplicated prefix leaves the junction ambiguous', () => {
    expect(
      resolvePendingPasteInsertStart('helloXhello', {
        text: 'PASTE',
        selectionStart: 5,
        anchorBefore: 'hello',
        anchorAfter: '',
      }),
    ).toBe(5);
  });

  it('holds the captured caret when the suffix is appended to itself', () => {
    expect(
      resolvePendingPasteInsertStart('abcabc', {
        text: 'PASTE',
        selectionStart: 0,
        anchorBefore: '',
        anchorAfter: 'abc',
      }),
    ).toBe(0);
  });

  it('still trails a suffix the user edited out of recognition', () => {
    expect(
      resolvePendingPasteInsertStart('ZZWORLD', {
        text: 'PASTE',
        selectionStart: 5,
        anchorBefore: 'hello',
        anchorAfter: 'WORLD',
      }),
    ).toBe(2);
  });

  it('stays at the captured caret when an edit duplicates both anchors', () => {
    /** `abcabc` is what both prepending and appending `abc` to `abc` produce, so the junction
     * could be 1 or 4 and nothing in the saved state says which. The caret is the tiebreak. */
    expect(
      resolvePendingPasteInsertStart('abcabc', {
        text: 'PASTE',
        selectionStart: 1,
        anchorBefore: 'a',
        anchorAfter: 'bc',
      }),
    ).toBe(1);
  });

  it('falls back to the captured caret when both anchors were empty', () => {
    expect(
      resolvePendingPasteInsertStart('typed since', {
        text: 'PASTE',
        selectionStart: 0,
        anchorBefore: '',
        anchorAfter: '',
      }),
    ).toBe(0);
  });
});
