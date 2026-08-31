import { ErrorTypes } from 'librechat-data-provider';
import {
  GENERIC_PROVIDER_ERROR,
  getLangChainErrorCode,
  resolveLangChainError,
  getUserFacingProviderError,
  stripLangChainTroubleshootingUrl,
  isFatalAgentInitializationError,
  AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE,
} from './errors';

describe('isFatalAgentInitializationError', () => {
  it.each([
    ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
    ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
    AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE,
  ])('classifies %s as fatal', (code) => {
    expect(isFatalAgentInitializationError({ code })).toBe(true);
  });

  it('allows skill-added MCP tools to fall back while keeping resource recovery fatal', () => {
    const options = { allowExpectedMCPFallback: true };
    expect(
      isFatalAgentInitializationError({ code: AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE }, options),
    ).toBe(false);
    expect(
      isFatalAgentInitializationError({ code: ErrorTypes.RESOURCE_RECOVERY_REQUIRED }, options),
    ).toBe(true);
  });

  it.each([undefined, null, new Error('optional tool failed'), { code: 'OPTIONAL_TOOL_FAILED' }])(
    'keeps non-fatal failures eligible for legacy soft handling',
    (error) => {
      expect(isFatalAgentInitializationError(error)).toBe(false);
    },
  );
});

describe('LangChain provider error text', () => {
  /** The exact tail `addLangChainErrorFields` appends to `error.message`. */
  const troubleshooting = (code: string) =>
    `\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/${code}/\n`;

  describe('stripLangChainTroubleshootingUrl', () => {
    it('removes the docs URL and the whitespace that framed it', () => {
      const message = `429 budget exceeded${troubleshooting('MODEL_RATE_LIMIT')}`;
      expect(stripLangChainTroubleshootingUrl(message)).toBe('429 budget exceeded');
    });

    it('removes every occurrence when a wrapped error carries more than one', () => {
      const message = `outer${troubleshooting('MODEL_RATE_LIMIT')}inner${troubleshooting(
        'MODEL_NOT_FOUND',
      )}`;
      expect(stripLangChainTroubleshootingUrl(message)).toBe('outer inner');
    });

    it('leaves provider text without the tail untouched', () => {
      const message = '400 Bad Request\nRequest contains an invalid argument';
      expect(stripLangChainTroubleshootingUrl(message)).toBe(message);
    });
  });

  describe('getLangChainErrorCode', () => {
    it('prefers the field LangChain stamps on the error', () => {
      const error = Object.assign(new Error('429 budget exceeded'), {
        lc_error_code: 'MODEL_RATE_LIMIT',
      });
      expect(getLangChainErrorCode(error)).toBe('MODEL_RATE_LIMIT');
    });

    it('recovers the code from the message when the field did not survive', () => {
      const error = new Error(`404 page not found${troubleshooting('MODEL_NOT_FOUND')}`);
      expect(getLangChainErrorCode(error)).toBe('MODEL_NOT_FOUND');
    });

    it.each([undefined, null, 'plain text', new Error('429 Too Many Requests')])(
      'returns undefined for an unclassified error',
      (error) => {
        expect(getLangChainErrorCode(error)).toBeUndefined();
      },
    );
  });

  describe('resolveLangChainError', () => {
    it.each([
      ['MODEL_RATE_LIMIT', ErrorTypes.MODEL_RATE_LIMIT],
      ['MODEL_NOT_FOUND', ErrorTypes.MODEL_NOT_FOUND],
    ])('maps %s to the typed payload the client localizes', (code, type) => {
      const error = Object.assign(new Error('failed'), { lc_error_code: code });
      expect(resolveLangChainError(error)).toBe(JSON.stringify({ type }));
    });

    it('leaves codes without localized copy to the provider message', () => {
      const error = Object.assign(new Error('failed'), { lc_error_code: 'OUTPUT_PARSING_FAILURE' });
      expect(resolveLangChainError(error)).toBeUndefined();
    });
  });

  describe('getUserFacingProviderError', () => {
    it('strips the docs URL from the forwarded provider message', () => {
      const error = new Error(`429 budget exceeded${troubleshooting('MODEL_RATE_LIMIT')}`);
      expect(getUserFacingProviderError(error, false)).toBe('429 budget exceeded');
    });

    it('withholds provider text when content protection is enabled', () => {
      const error = new Error(`429 budget exceeded${troubleshooting('MODEL_RATE_LIMIT')}`);
      expect(getUserFacingProviderError(error, true)).toBe(GENERIC_PROVIDER_ERROR);
    });

    it('falls back when stripping leaves nothing behind', () => {
      const error = new Error(troubleshooting('MODEL_RATE_LIMIT').trim());
      expect(getUserFacingProviderError(error, false)).toBe(GENERIC_PROVIDER_ERROR);
    });

    it('does not attempt to read a message off a non-Error rejection', () => {
      expect(getUserFacingProviderError('boom', false)).toBe('An error occurred');
    });
  });
});
