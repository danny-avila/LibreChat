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
    (key: string, values?: Record<string, unknown>): string => {
      const template =
        (jest.requireActual('~/locales/en/translation.json') as Record<string, string>)[key] ?? key;
      if (!values) {
        return template;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
        values[name] != null ? String(values[name]) : match,
      );
    },
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

  it.each([
    ['MODEL_NOT_FOUND', 'com_error_model_not_found'],
    ['MODEL_RATE_LIMIT', 'com_error_model_rate_limit'],
  ])('replaces LangChain %s attribution with localized guidance', (code, key) => {
    const raw = `An error occurred while processing the request: 404 404 page not found Troubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/${code}/`;
    render(<Error text={raw} />);

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
    expect(screen.queryByText(/langchain\.com/i)).not.toBeInTheDocument();
  });

  it.each([
    [ErrorTypes.MODEL_NOT_FOUND, 'com_error_model_not_found'],
    [ErrorTypes.MODEL_RATE_LIMIT, 'com_error_model_rate_limit'],
    [ErrorTypes.CODE_WORKSPACE_UNAVAILABLE, 'com_error_code_workspace_unavailable'],
  ])('localizes the typed %s payload the server now emits', (type, key) => {
    render(<Error text={JSON.stringify({ type })} />);

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
  });

  it('keeps the provider message for a LangChain code without localized copy, minus the URL', () => {
    const raw =
      'An error occurred while processing the request: could not parse output\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/OUTPUT_PARSING_FAILURE/\n';
    render(<Error text={raw} />);

    expect(screen.getByText(/could not parse output/)).toBeInTheDocument();
    expect(screen.queryByText(/langchain\.com/i)).not.toBeInTheDocument();
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

describe('Error: agent context budget errors', () => {
  beforeAll(() => {
    /** CodeBlock observes its code bar; jsdom ships no IntersectionObserver. */
    (global as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('renders localized copy and the token breakdown for empty_messages', () => {
    /** Mirrors the SDK payload as embedded by the agents controller's error prefix. */
    const info =
      'Message pruning removed all messages as none fit in the context window. Please increase the context window size or make your message shorter.\nToken budget breakdown:\n  maxContextTokens:    10\n  messageTokens:       32 (4 messages)\n  availableForMessages: 9';
    const payload = `An error occurred while processing the request: ${JSON.stringify({
      type: ErrorTypes.EMPTY_MESSAGES,
      info,
    })}`;
    render(<Error text={payload} />);

    expect(screen.getByText(catalog.com_error_empty_messages)).toBeInTheDocument();
    expect(screen.getByText(/Token budget breakdown/)).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it('renders localized copy with token counts for final_context_overflow', () => {
    const payload = `An error occurred while processing the request: ${JSON.stringify({
      type: ErrorTypes.FINAL_CONTEXT_OVERFLOW,
      info: 'Provider message formatting exceeded the context budget and no safe synthetic-context compaction could make it fit.',
      provider: 'openAI',
      projectedMessageTokens: 3,
      availableMessageTokens: 0,
    })}`;
    render(<Error text={payload} />);

    expect(
      screen.getByText(new RegExp(catalog.com_error_final_context_overflow.slice(0, 40))),
    ).toBeInTheDocument();
    expect(screen.getByText(/need 3 tokens, but only 0 are available/)).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it('falls back to the plain sentence when overflow token counts are absent', () => {
    const payload = JSON.stringify({
      type: ErrorTypes.FINAL_CONTEXT_OVERFLOW,
      info: 'Fallback provider message formatting exceeded the context budget before invocation.',
    });
    render(<Error text={payload} />);

    expect(screen.getByText(catalog.com_error_final_context_overflow)).toBeInTheDocument();
  });
});

describe('Error — manual compaction', () => {
  it('renders the failed-compaction copy', () => {
    render(<Error text={JSON.stringify({ type: ErrorTypes.COMPACTION_FAILED })} />);

    expect(screen.getByText(catalog.com_error_compaction_failed)).toBeInTheDocument();
  });

  it.each([
    ['disabled', 'com_error_compaction_disabled'],
    ['instructions_exceed_budget', 'com_error_compaction_budget'],
    ['nothing_to_summarize', 'com_error_compaction_nothing'],
  ])('renders the copy for a compaction skipped because %s', (reason, key) => {
    render(<Error text={JSON.stringify({ type: ErrorTypes.COMPACTION_SKIPPED, reason })} />);

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
  });

  it('falls back to the failed copy for an unknown skip reason', () => {
    render(
      <Error text={JSON.stringify({ type: ErrorTypes.COMPACTION_SKIPPED, reason: 'exhausted' })} />,
    );

    expect(screen.getByText(catalog.com_error_compaction_failed)).toBeInTheDocument();
  });
});
