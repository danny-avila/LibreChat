import React from 'react';
import { ErrorTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import translation from '~/locales/en/translation.json';
import Error from '../Error';

/**
 * Resolves keys against the real English catalog rather than a stub, so a typed error whose
 * localization key is missing or misspelled fails here instead of reaching users as a raw key.
 */
jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      (jest.requireActual('~/locales/en/translation.json') as Record<string, string>)[key] ?? key,
}));

const catalog = translation as Record<string, string>;

describe('Error — typed provider errors', () => {
  it('renders the localized copy for a rejected Google video', () => {
    /** The exact payload `resolveGoogleVideoError` emits from the server. */
    const payload = JSON.stringify({ type: ErrorTypes.GOOGLE_VIDEO_UNPROCESSABLE });
    render(<Error text={payload} />);

    expect(screen.getByText(catalog.com_error_google_video_unprocessable)).toBeInTheDocument();
  });

  it('names video length, the dominant cause, in the copy', () => {
    expect(catalog.com_error_google_video_unprocessable).toMatch(/too long/i);
  });

  it('falls back to the raw provider text for an unmapped error', () => {
    const raw =
      '[GoogleGenerativeAI Error]: [400 Bad Request] Request contains an invalid argument';
    render(<Error text={raw} />);

    expect(
      screen.getByText(new RegExp(raw.slice(0, 30).replace(/[[\]]/g, '\\$&'))),
    ).toBeInTheDocument();
  });
});
