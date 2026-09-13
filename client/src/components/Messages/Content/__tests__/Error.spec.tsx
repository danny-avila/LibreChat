import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorTypes, ViolationTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import translation from '~/locales/en/translation.json';
import Error from '../Error';

let mockEndpointsData: Record<string, Record<string, unknown>> = {
  openAI: { userProvide: true },
};
let mockStartupData = { compactionEnabled: false };

/** Keep this unit spec independent of query providers while exercising the real renderer hooks. */
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
  useHasAccess: () => false,
  /** Mirrors the real hook's contract — a grid style plus a ref — without pulling `useMediaQuery`
   *  and its `matchMedia` dependency into a spec that asserts copy, not motion. */
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({ data: mockEndpointsData })),
  useGetStartupConfig: jest.fn(() => ({ data: mockStartupData })),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => undefined,
}));

jest.mock('~/components/Input/SetKeyDialog', () => ({
  SetKeyDialog: () => null,
}));

const catalog = translation as Record<string, string>;
const providerMessage = {
  endpoint: 'openAI',
  model: 'gpt-4o',
  createdAt: new Date('2026-09-13T12:00:00.000Z'),
} as unknown as TMessage;

function renderError(payload: Record<string, unknown> | string, message?: TMessage) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return render(<Error text={text} message={message} />);
}

function expectReadable() {
  const output = document.body.textContent ?? '';
  expect(output).not.toMatch(/com_error_[A-Za-z0-9_]+/);
  expect(output).not.toContain(
    "Something went wrong. Here's the specific error message we encountered:",
  );
}
function localized(key: string, ...values: string[]) {
  return values.reduce((copy, value, index) => copy.replace(`{{${index}}}`, value), catalog[key]);
}

const numberFormat = new Intl.NumberFormat();

beforeEach(() => {
  mockEndpointsData = { openAI: { userProvide: true } };
  mockStartupData = { compactionEnabled: false };
});

describe('Error — reader-facing provider and fallback copy', () => {
  it.each([
    [ErrorTypes.INVALID_REQUEST, 'com_error_invalid_request_error', 'OpenAI'],
    [ErrorTypes.NO_SYSTEM_MESSAGES, 'com_error_no_system_messages', 'OpenAI'],
    [ErrorTypes.INVALID_ACTION, 'com_error_invalid_action_error', undefined],
  ])('resolves %s to a sentence rather than an unresolved key', (type, key, provider) => {
    renderError({ type }, provider ? providerMessage : undefined);

    expect(screen.getByText(localized(key, ...(provider ? [provider] : [])))).toBeInTheDocument();
    expectReadable();
  });

  it('renders the localized copy for a rejected Google video', () => {
    renderError({ type: ErrorTypes.GOOGLE_VIDEO_UNPROCESSABLE });

    expect(screen.getByText(catalog.com_error_google_video_unprocessable)).toBeInTheDocument();
    expectReadable();
  });

  it.each([
    ['MODEL_NOT_FOUND', 'com_error_model_not_found'],
    ['MODEL_RATE_LIMIT', 'com_error_model_rate_limit'],
  ])('replaces LangChain %s attribution with localized guidance', (code, key) => {
    const raw = `An error occurred while processing the request: 404 404 page not found Troubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/${code}/`;
    renderError(raw);

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
    expect(screen.queryByText(/langchain\.com/i)).not.toBeInTheDocument();
    expectReadable();
  });

  it('keeps provider text for a LangChain code without localized copy, minus the URL', () => {
    const raw =
      'An error occurred while processing the request: could not parse output\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/OUTPUT_PARSING_FAILURE/\n';
    renderError(raw);

    expect(screen.getByText(/could not parse output/)).toBeInTheDocument();
    expect(screen.queryByText(/langchain\.com/i)).not.toBeInTheDocument();
    expectReadable();
  });

  it('shows an unmapped payload message without exposing its JSON representation', () => {
    const message = 'The provider returned a code the client does not classify.';
    renderError({ code: 'im_a_teapot', message }, providerMessage);

    expect(screen.getByText(message)).toBeInTheDocument();
    const output = document.body.textContent ?? '';
    expect(output).not.toContain('{');
    expect(output).not.toContain('"code"');
    expectReadable();
  });

  it('shows the complete long provider message after its disclosure is opened', () => {
    const providerText =
      `The upstream gateway rejected the request. ${'Retry advice and a stack frame repeated to exceed the client truncation cap. '.repeat(8)}`.trim();
    renderError(providerText, providerMessage);

    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('...');
    fireEvent.click(screen.getByRole('button', { name: catalog.com_error_details_provider }));
    expect(document.body.textContent).toContain(providerText);
    expectReadable();
  });
});

describe('Error — provider and model identity', () => {
  it('names the selected model for a refusal without stale Claude copy', () => {
    renderError(
      { type: ErrorTypes.REFUSAL, info: "I can't help with that request." },
      providerMessage,
    );

    expect(screen.getByText(localized('com_error_refusal', 'gpt-4o'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Claude|Sonnet/i);
    expectReadable();
  });

  it('names the provider from endpoint_models_not_loaded payload info', () => {
    renderError(
      { type: ErrorTypes.ENDPOINT_MODELS_NOT_LOADED, info: 'anthropic' },
      providerMessage,
    );

    expect(
      screen.getByText(localized('com_error_endpoint_models_not_loaded', 'Anthropic')),
    ).toBeInTheDocument();
    expectReadable();
  });

  it('renders upstream model copy with and without a status', () => {
    renderError({ type: ErrorTypes.UPSTREAM_MODEL_ERROR }, providerMessage);
    expect(screen.getByText(catalog.com_error_upstream_model)).toBeInTheDocument();

    renderError({ type: ErrorTypes.UPSTREAM_MODEL_ERROR, status: 529 }, providerMessage);
    expect(
      screen.getByText(catalog.com_error_upstream_model_status.replace('{{0}}', '529')),
    ).toBeInTheDocument();
  });

  it.each([
    ['required', 'com_error_code_workspace_required'],
    ['invalid', 'com_error_code_workspace_invalid'],
    ['worker_unavailable', 'com_error_code_workspace_worker_unavailable'],
    ['unsupported', 'com_error_code_workspace_unsupported'],
    ['missing', 'com_error_code_workspace_missing'],
    ['locked', 'com_error_code_workspace_locked'],
  ])('localizes a workspace rejection with reason %s', (reason, key) => {
    renderError({ code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE, reason });

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
    expectReadable();
  });

  it.each([{ reason: 'future_reason' }, {}])(
    'uses safe workspace fallback copy for an unknown or legacy payload',
    (payload) => {
      renderError({ code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE, ...payload });

      expect(screen.getByText(catalog.com_error_code_workspace_unavailable)).toBeInTheDocument();
      expectReadable();
    },
  );
});

describe('Error — user key and limits', () => {
  it('offers the add-key action when the endpoint accepts user credentials', () => {
    renderError({ type: ErrorTypes.NO_USER_KEY }, providerMessage);

    expect(screen.getByText(localized('com_error_no_user_key', 'OpenAI'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: catalog.com_error_user_key_add }),
    ).toBeInTheDocument();
  });

  it('shows administrator guidance and no action for deployment-managed credentials', () => {
    mockEndpointsData = { openAI: { userProvide: false } };
    renderError({ type: ErrorTypes.NO_USER_KEY }, providerMessage);

    expect(
      screen.getByText(localized('com_error_no_user_key_admin', 'OpenAI')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: catalog.com_error_user_key_add }),
    ).not.toBeInTheDocument();
  });

  it('formats an expired user-key date for readers', () => {
    const expiredAt = '2026-08-01T09:30:00.000Z';
    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(expiredAt));
    renderError(
      { type: ErrorTypes.EXPIRED_USER_KEY, expiredAt, endpoint: 'openAI' },
      providerMessage,
    );

    expect(
      screen.getByText(localized('com_error_expired_user_key', 'OpenAI', formatted)),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(expiredAt);
  });

  it('renders a message-limit countdown from a future reset time', () => {
    renderError(
      {
        type: ViolationTypes.MESSAGE_LIMIT,
        max: 40,
        windowInMinutes: 60,
        resetAt: Date.now() + 2 * 60 * 1000,
      },
      providerMessage,
    );

    expect(screen.getByText(/You can send another message in \d+:\d{2}\./)).toBeInTheDocument();
  });

  it('renders retry-available copy when a message limit has expired', () => {
    renderError(
      {
        type: ViolationTypes.MESSAGE_LIMIT,
        max: 40,
        windowInMinutes: 60,
        resetAt: Date.now() - 1000,
      },
      providerMessage,
    );

    expect(screen.getByText(catalog.com_error_retry_available)).toBeInTheDocument();
  });
});

describe('Error — token balance and context budget', () => {
  it('formats token credits and keeps generation rows behind a disclosure', () => {
    renderError({
      type: ViolationTypes.TOKEN_BALANCE,
      balance: 1250,
      tokenCost: 8400,
      promptTokens: 6300,
      generations: [
        { model: 'gpt-4o', promptTokens: 6300, completionTokens: 2100 },
        { model: 'gpt-4o-mini', promptTokens: 820, completionTokens: 240 },
      ],
    });

    expect(
      screen.getByText(
        localized('com_error_token_balance', numberFormat.format(8400), numberFormat.format(1250)),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(localized('com_error_token_balance_prompt', numberFormat.format(6300))),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('"model":');
    fireEvent.click(
      screen.getByRole('button', { name: catalog.com_error_token_balance_generations }),
    );
    expect(
      screen.getByText(
        localized(
          'com_error_token_balance_generation',
          'gpt-4o',
          numberFormat.format(6300),
          numberFormat.format(2100),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        localized(
          'com_error_token_balance_generation',
          'gpt-4o-mini',
          numberFormat.format(820),
          numberFormat.format(240),
        ),
      ),
    ).toBeInTheDocument();
  });

  it('formats input length and offers the standard context next steps', () => {
    renderError({ type: ErrorTypes.INPUT_LENGTH, info: '214500 / 128000' }, providerMessage);

    expect(
      screen.getByText(
        localized(
          'com_error_input_length',
          numberFormat.format(214500),
          numberFormat.format(128000),
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(catalog.com_error_context_next_steps)).toBeInTheDocument();
  });

  it('formats final overflow numbers and uses compaction next steps when available', () => {
    mockStartupData = { compactionEnabled: true };
    renderError(
      {
        type: ErrorTypes.FINAL_CONTEXT_OVERFLOW,
        projectedMessageTokens: 214500,
        availableMessageTokens: 128000,
      },
      providerMessage,
    );

    expect(
      screen.getByText(
        localized(
          'com_error_final_context_overflow',
          numberFormat.format(214500),
          numberFormat.format(128000),
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(catalog.com_error_context_next_steps_compact)).toBeInTheDocument();
  });

  it('renders empty-message context copy and formatted budget detail', () => {
    const info =
      'Message pruning removed all messages as none fit in the context window. ' +
      'Please increase the context window size or make your message shorter. ' +
      'Token budget: 128000 total, 127480 reserved for instructions and tools, 520 available.';
    renderError({ type: ErrorTypes.EMPTY_MESSAGES, info }, providerMessage);

    expect(screen.getByText(catalog.com_error_empty_messages)).toBeInTheDocument();
    expect(screen.getByText(catalog.com_error_context_next_steps)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: catalog.com_error_context_token_budget }));
    expect(
      screen.getByText(new RegExp(`Token budget: ${numberFormat.format(128000)} total`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${numberFormat.format(127480)} reserved`)),
    ).toBeInTheDocument();
  });
});

describe('Error — manual compaction', () => {
  it('renders the failed-compaction copy', () => {
    renderError({ type: ErrorTypes.COMPACTION_FAILED });

    expect(screen.getByText(catalog.com_error_compaction_failed)).toBeInTheDocument();
  });

  it.each([
    ['disabled', 'com_error_compaction_disabled'],
    ['instructions_exceed_budget', 'com_error_compaction_budget'],
    ['nothing_to_summarize', 'com_error_compaction_nothing'],
  ])('renders the copy for a compaction skipped because %s', (reason, key) => {
    renderError({ type: ErrorTypes.COMPACTION_SKIPPED, reason });

    expect(screen.getByText(catalog[key])).toBeInTheDocument();
  });

  it('falls back to the failed copy for an unknown skip reason', () => {
    renderError({ type: ErrorTypes.COMPACTION_SKIPPED, reason: 'exhausted' });

    expect(screen.getByText(catalog.com_error_compaction_failed)).toBeInTheDocument();
  });
});
