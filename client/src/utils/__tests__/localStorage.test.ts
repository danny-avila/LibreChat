import { LocalStorageKeys } from 'librechat-data-provider';
import { clearAllConversationStorage } from '../localStorage';

describe('clearAllConversationStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('wipes the selection and conversation state but keeps unrelated keys', () => {
    localStorage.setItem(LocalStorageKeys.LAST_SPEC, 'some-spec');
    localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify({ openAI: 'gpt-4o' }));
    localStorage.setItem(LocalStorageKeys.LAST_TOOLS, JSON.stringify(['web_search']));
    localStorage.setItem(
      `${LocalStorageKeys.LAST_CONVO_SETUP}_0`,
      JSON.stringify({ spec: 'some-spec' }),
    );
    localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}0`, 'agent_1');
    localStorage.setItem('unrelated-key', 'keep-me');

    clearAllConversationStorage();

    expect(localStorage.getItem(LocalStorageKeys.LAST_SPEC)).toBeNull();
    expect(localStorage.getItem(LocalStorageKeys.LAST_MODEL)).toBeNull();
    expect(localStorage.getItem(LocalStorageKeys.LAST_TOOLS)).toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.LAST_CONVO_SETUP}_0`)).toBeNull();
    expect(localStorage.getItem(`${LocalStorageKeys.AGENT_ID_PREFIX}0`)).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
  });
});
