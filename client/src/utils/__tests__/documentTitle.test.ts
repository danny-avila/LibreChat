import { LocalStorageKeys } from 'librechat-data-provider';
import { CHAT_TITLE_IN_TAB_KEY, isChatTitleInTabEnabled, setDocumentTitle } from '../documentTitle';

describe('document title', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LocalStorageKeys.APP_TITLE, 'LibreChat');
    document.title = '';
  });

  it('uses a conversation title when chat titles are enabled', () => {
    setDocumentTitle('Project status', true);

    expect(document.title).toBe('Project status');
  });

  it('uses the app title when chat titles are disabled', () => {
    setDocumentTitle('Project status', false);

    expect(document.title).toBe('LibreChat');
  });

  it('uses the app title when the conversation title is empty', () => {
    setDocumentTitle('', true);

    expect(document.title).toBe('LibreChat');
  });

  it('defaults to enabled when the stored setting is malformed', () => {
    localStorage.setItem(CHAT_TITLE_IN_TAB_KEY, 'not-json');

    expect(isChatTitleInTabEnabled()).toBe(true);
  });
});
