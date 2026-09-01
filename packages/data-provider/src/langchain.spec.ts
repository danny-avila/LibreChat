import { stripLangChainTroubleshootingUrl, parseLangChainErrorCode } from './langchain';

/** The exact tail `addLangChainErrorFields` appends to `error.message`. */
const troubleshooting = (code: string) =>
  `\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/${code}/\n`;

describe('stripLangChainTroubleshootingUrl', () => {
  it('removes the docs URL and the whitespace that framed it', () => {
    expect(
      stripLangChainTroubleshootingUrl(`429 budget exceeded${troubleshooting('MODEL_RATE_LIMIT')}`),
    ).toBe('429 budget exceeded');
  });

  it('removes every occurrence when a wrapped error carries more than one', () => {
    const message = `outer${troubleshooting('MODEL_RATE_LIMIT')}inner${troubleshooting('MODEL_NOT_FOUND')}`;
    expect(stripLangChainTroubleshootingUrl(message)).toBe('outer inner');
  });

  it('leaves provider text without the tail untouched', () => {
    const message = '400 Bad Request\nRequest contains an invalid argument';
    expect(stripLangChainTroubleshootingUrl(message)).toBe(message);
  });

  it('coerces a non-string message the way string interpolation would', () => {
    expect(stripLangChainTroubleshootingUrl({ error: 'rate limited' })).toBe('[object Object]');
    expect(stripLangChainTroubleshootingUrl(429)).toBe('429');
  });

  it.each([undefined, null])('treats an absent message as empty', (message) => {
    expect(stripLangChainTroubleshootingUrl(message)).toBe('');
  });
});

describe('parseLangChainErrorCode', () => {
  it.each(['MODEL_RATE_LIMIT', 'MODEL_NOT_FOUND', 'OUTPUT_PARSING_FAILURE'])(
    'reads %s back out of the appended URL',
    (code) => {
      expect(parseLangChainErrorCode(`failed${troubleshooting(code)}`)).toBe(code);
    },
  );

  it.each(['429 Too Many Requests', '', undefined, { message: 'nested' }])(
    'returns undefined when the text carries no classification',
    (message) => {
      expect(parseLangChainErrorCode(message)).toBeUndefined();
    },
  );
});
