import { Provider } from 'jotai';
import TagManager from 'react-gtm-module';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import AnalyticsConsent from '../AnalyticsConsent';

jest.mock('react-gtm-module', () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const initialize = TagManager.initialize as jest.Mock;

const renderConsent = (gtmId?: string | null) =>
  render(
    <Provider>
      <AnalyticsConsent gtmId={gtmId} />
    </Provider>,
  );

const getBanner = () => screen.queryByRole('region', { name: 'com_ui_analytics_consent_label' });

describe('AnalyticsConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    initialize.mockClear();
    delete window.google_tag_manager;
    delete window.dataLayer;
  });

  it('renders nothing and never loads GTM when no container is configured', () => {
    localStorage.setItem('analyticsConsent', JSON.stringify('granted'));
    renderConsent(undefined);
    expect(getBanner()).not.toBeInTheDocument();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('asks for consent without loading GTM or taking focus', () => {
    renderConsent('GTM-TEST');
    const banner = getBanner();
    expect(banner).toBeInTheDocument();
    expect(banner).not.toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'com_ui_analytics_consent_accept' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'com_ui_analytics_consent_decline' })).toBeVisible();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('loads GTM after Accept and hides the banner', () => {
    renderConsent('GTM-TEST');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_analytics_consent_accept' }));
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith({ gtmId: 'GTM-TEST' });
    expect(getBanner()).not.toBeInTheDocument();
    expect(localStorage.getItem('analyticsConsent')).toBe(JSON.stringify('granted'));
  });

  it('keeps GTM unloaded after Decline and hides the banner', () => {
    renderConsent('GTM-TEST');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_analytics_consent_decline' }));
    expect(initialize).not.toHaveBeenCalled();
    expect(getBanner()).not.toBeInTheDocument();
    expect(localStorage.getItem('analyticsConsent')).toBe(JSON.stringify('denied'));
  });

  it('loads GTM on mount for a viewer who already consented, without asking again', () => {
    localStorage.setItem('analyticsConsent', JSON.stringify('granted'));
    renderConsent('GTM-TEST');
    expect(getBanner()).not.toBeInTheDocument();
    expect(initialize).toHaveBeenCalledWith({ gtmId: 'GTM-TEST' });
  });

  it('does not ask again or load GTM for a viewer who declined', () => {
    localStorage.setItem('analyticsConsent', JSON.stringify('denied'));
    renderConsent('GTM-TEST');
    expect(getBanner()).not.toBeInTheDocument();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('does not load a second container when GTM is already on the page', () => {
    localStorage.setItem('analyticsConsent', JSON.stringify('granted'));
    window.google_tag_manager = {};
    renderConsent('GTM-TEST');
    expect(initialize).not.toHaveBeenCalled();
  });

  it('tells a loaded container that consent was withdrawn', () => {
    localStorage.setItem('analyticsConsent', JSON.stringify('denied'));
    window.dataLayer = [];
    renderConsent('GTM-TEST');
    expect(window.dataLayer).toHaveLength(1);
    expect(Array.from(window.dataLayer[0] as ArrayLike<unknown>)).toEqual([
      'consent',
      'update',
      expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' }),
    ]);
  });
});
