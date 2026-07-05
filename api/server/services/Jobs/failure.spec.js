const {
  detectStepFailure,
  extractStepResponseText,
  hasErrorContentPart,
  looksLikeFailureText,
} = require('./failure');

describe('Jobs failure detection', () => {
  it('returns captured headless SSE errors first', () => {
    expect(
      detectStepFailure({
        response: { error: false },
        responseText: 'ok',
        capturedError: 'Provider unavailable',
      }),
    ).toBe('Provider unavailable');
  });

  it('detects response.error with message text', () => {
    expect(
      detectStepFailure({
        response: { error: true },
        responseText: 'Something went wrong. credit issue',
      }),
    ).toContain('Something went wrong');
  });

  it('detects error content parts when text is empty', () => {
    const response = {
      text: '',
      content: [
        {
          type: 'error',
          error:
            'An error occurred while processing the request: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}',
        },
      ],
    };

    expect(hasErrorContentPart(response.content)).toBe(true);
    expect(detectStepFailure({ response })).toContain('credit balance is too low');
  });

  it('extracts error content parts into response text', () => {
    const text = extractStepResponseText({
      content: [{ type: 'error', error: 'An error occurred while processing the request: 400' }],
    });
    expect(text).toContain('An error occurred while processing the request');
  });

  it('detects provider failure hints without JSON wrapper', () => {
    expect(
      looksLikeFailureText(
        'An error occurred while processing the request: credit balance is too low',
      ),
    ).toBe(true);
  });

  it('returns null for a normal step response', () => {
    expect(
      detectStepFailure({
        responseText: 'Drafted section one.\nSTATUS: CONTINUE',
      }),
    ).toBeNull();
  });
});
