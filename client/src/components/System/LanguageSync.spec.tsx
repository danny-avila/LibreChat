import React from 'react';
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import LanguageSync from './LanguageSync';
import store from '~/store';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

// i18n is fully mocked so the component's language-change effect is inert and
// normalization is the identity — the point under test is what LanguageSync
// *stores*, not what i18n resolves it to.
jest.mock('~/locales/i18n', () => ({
  __esModule: true,
  default: { language: 'en' },
  changeLanguageSafely: jest.fn().mockResolvedValue(undefined),
  normalizeLocale: (locale: string) => locale,
}));

const renderWithDefault = (defaultLanguage?: string) => {
  mockUseGetStartupConfig.mockReturnValue({ data: { interface: { defaultLanguage } } });
  const jotaiStore = createStore();
  render(
    <Provider store={jotaiStore}>
      <LanguageSync />
    </Provider>,
  );
  return jotaiStore;
};

describe('LanguageSync — interface.defaultLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('stores the server default selector-conform (de-DE, not normalized to de)', () => {
    const jotaiStore = renderWithDefault('de-DE');
    expect(jotaiStore.get(store.lang)).toBe('de-DE');
  });

  it("skips 'auto' and does not persist a language", () => {
    const jotaiStore = renderWithDefault('auto');
    expect(jotaiStore.get(store.lang)).not.toBe('auto');
    expect(localStorage.getItem('lang')).toBeNull();
  });

  it('does not override a user who already chose a language', () => {
    localStorage.setItem('lang', JSON.stringify('en-US'));
    const jotaiStore = renderWithDefault('de-DE');
    expect(jotaiStore.get(store.lang)).toBe('en-US');
  });
});
