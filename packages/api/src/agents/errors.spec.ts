import { ErrorTypes } from 'librechat-data-provider';
import { GraphRecursionError } from '@langchain/langgraph';
import {
  GENERIC_PROVIDER_ERROR,
  getLangChainErrorCode,
  getProviderErrorMessage,
  resolveLangChainError,
  getUserFacingProviderError,
  isFatalAgentInitializationError,
  AGENT_ATTACHMENT_LIMIT_EXCEEDED,
  AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE,
  isStepLimitError,
} from './errors';
import { AgentInstructionPromptError } from './instructions';

describe('isFatalAgentInitializationError', () => {
  it('propagates cancellation even when optional MCP fallback is allowed', () => {
    const abort = new DOMException('Stopped', 'AbortError');
    const controller = new AbortController();
    expect(isFatalAgentInitializationError(abort, { signal: controller.signal })).toBe(false);
    controller.abort(abort);
    expect(
      isFatalAgentInitializationError(abort, {
        allowExpectedMCPFallback: true,
        signal: controller.signal,
      }),
    ).toBe(true);
  });
  it.each(
    [
      ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
      ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
      ErrorTypes.CODE_WORKSPACE_UNAVAILABLE,
      AGENT_ATTACHMENT_LIMIT_EXCEEDED,
      AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE,
    ].filter((code): code is string => typeof code === 'string'),
  )('classifies %s as fatal', (code) => {
    expect(isFatalAgentInitializationError({ code })).toBe(true);
  });
  it('classifies instruction prompt resolution failures as fatal', () => {
    const error = new AgentInstructionPromptError('not_found', 'Prompt missing', 404);

    expect(isFatalAgentInitializationError(error)).toBe(true);
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

  it('does not classify a missing code as fatal when an enum member is unavailable', () => {
    expect(isFatalAgentInitializationError(new Error('ordinary failure'))).toBe(false);
  });
});

describe('LangChain provider error text', () => {
  /** The exact tail `addLangChainErrorFields` appends to `error.message`. */
  const troubleshooting = (code: string) =>
    `\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/${code}/\n`;

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

    it('survives an error-like object whose message is not a string', () => {
      expect(getLangChainErrorCode({ message: { error: 'rate limited' } })).toBeUndefined();
    });
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

    it('coerces an Error whose message was overwritten with an object', () => {
      const error = Object.assign(new Error('replaced'), { message: { error: 'rate limited' } });
      expect(getUserFacingProviderError(error, false)).toBe('[object Object]');
    });
  });

  describe('getProviderErrorMessage', () => {
    it('reports the provider wording without the docs URL', () => {
      const error = new Error(`400 masking unavailable${troubleshooting('MODEL_NOT_FOUND')}`);
      expect(getProviderErrorMessage(error)).toBe('400 masking unavailable');
    });

    it('strips a troubleshooting suffix crossing the output boundary', () => {
      const explanation = 'x'.repeat(1990);
      const error = new Error(`${explanation}${troubleshooting('INVALID_PROMPT_INPUT')}`);
      expect(getProviderErrorMessage(error)).toBe(explanation);
    });

    it('bounds scanning before stripping a multi-megabyte suffix', () => {
      const explanation = 'x'.repeat(2000);
      const scan = jest.spyOn(String.prototype, 'indexOf');
      expect(getProviderErrorMessage(new Error(explanation + ' '.repeat(2_000_000)))).toBe(
        explanation,
      );
      expect(scan.mock.contexts.every((text) => text.length <= 2256)).toBe(true);
      scan.mockRestore();
    });

    it('bounds an unbounded provider body', () => {
      const error = new Error('x'.repeat(4096));
      expect(getProviderErrorMessage(error)).toBe('x'.repeat(2000));
    });

    it.each([
      ['a rejection thrown as a string', 'proxy refused the request', 'proxy refused the request'],
      ['an error with nothing to say', new Error('   '), undefined],
      [
        'a non-string message',
        Object.assign(new Error('replaced'), { message: { a: 1 } }),
        undefined,
      ],
      ['a non-object rejection', 42, undefined],
    ])('reads %s defensively', (_case, error, expected) => {
      expect(getProviderErrorMessage(error)).toBe(expected);
    });

    it('contains a hostile message accessor', () => {
      const error = Object.create(null, {
        message: {
          get() {
            throw new Error('hostile message getter');
          },
        },
      });
      expect(getProviderErrorMessage(error)).toBeUndefined();
    });
  });
});

describe('isStepLimitError', () => {
  it('recognizes the real error LangGraph throws when a graph runs out of supersteps', () => {
    /** Constructed exactly as `pregel/index.js` does on `loop.status === 'out_of_steps'`. */
    const thrown = new GraphRecursionError(
      'Recursion limit of 50 reached without hitting a stop condition. You can increase the limit by setting the "recursionLimit" config key.',
      { lc_error_code: 'GRAPH_RECURSION_LIMIT' },
    );

    expect(isStepLimitError(thrown)).toBe(true);
  });

  it('matches on `lc_error_code` alone, so a minified class name cannot break detection', () => {
    expect(isStepLimitError({ lc_error_code: 'GRAPH_RECURSION_LIMIT' })).toBe(true);
  });

  it('matches on `name` alone, so an error rebuilt without fields is still recognized', () => {
    expect(isStepLimitError({ name: 'GraphRecursionError' })).toBe(true);
  });

  it('unwraps a graph error rethrown inside a wrapper', () => {
    const wrapper = new Error('agent run failed', {
      cause: new Error('node failed', {
        cause: new GraphRecursionError('Recursion limit of 50 reached', {
          lc_error_code: 'GRAPH_RECURSION_LIMIT',
        }),
      }),
    });

    expect(isStepLimitError(wrapper)).toBe(true);
  });

  it('terminates on a self-referential cause chain instead of looping forever', () => {
    const looping: { name: string; cause?: unknown } = { name: 'SomeError' };
    looping.cause = looping;

    expect(isStepLimitError(looping)).toBe(false);
  });

  it('treats hostile error accessors as an ordinary failure', () => {
    const error = Object.create(null, {
      lc_error_code: {
        get() {
          throw new Error('hostile code getter');
        },
      },
      name: {
        get() {
          throw new Error('hostile name getter');
        },
      },
      cause: {
        get() {
          throw new Error('hostile cause getter');
        },
      },
    });

    expect(isStepLimitError(error)).toBe(false);
  });

  it.each([
    undefined,
    null,
    'GraphRecursionError',
    new Error('rate limited'),
    { lc_error_code: 'GRAPH_VALUE_ERROR' },
    { name: 'GraphInterrupt' },
  ])('leaves case %# on the ordinary error path', (error) => {
    expect(isStepLimitError(error)).toBe(false);
  });
});
