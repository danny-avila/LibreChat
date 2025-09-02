const { parseParamFromPrompt } = require('./titlePrompts');
describe('parseParamFromPrompt', () => {
  // Original simple format tests
  test('extracts parameter from simple format', () => {
    const prompt = '<title>Simple Title</title>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('Simple Title');
  });

  // Parameter format tests
  test('extracts parameter from parameter format', () => {
    const prompt =
      '<function_calls> <invoke name="submit_title"> <parameter name="title">Complex Title</parameter> </invoke>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('Complex Title');
  });

  // Edge cases and error handling
  test('returns NO TOOL INVOCATION message for non-matching content', () => {
    const prompt = 'Some random text without parameters';
    expect(parseParamFromPrompt(prompt, 'title')).toBe(
      'NO TOOL INVOCATION: Some random text without parameters',
    );
  });

  test('returns default message for empty prompt', () => {
    expect(parseParamFromPrompt('', 'title')).toBe('No title provided');
  });

  test('returns default message for null prompt', () => {
    expect(parseParamFromPrompt(null, 'title')).toBe('No title provided');
  });

  // Multiple parameter tests
  test('works with different parameter names', () => {
    const prompt = '<name>John Doe</name>';
    expect(parseParamFromPrompt(prompt, 'name')).toBe('John Doe');
  });

  test('handles multiline content', () => {
    const prompt = `<parameter name="description">This is a
    multiline
    description</parameter>`;
    expect(parseParamFromPrompt(prompt, 'description')).toBe(
      'This is a\n    multiline\n    description',
    );
  });

  // Whitespace handling
  test('trims whitespace from extracted content', () => {
    const prompt = '<title>  Padded Title  </title>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('Padded Title');
  });

  test('handles whitespace in parameter format', () => {
    const prompt = '<parameter name="title">  Padded Parameter Title  </parameter>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('Padded Parameter Title');
  });

  // Invalid format tests
  test('handles malformed tags', () => {
    const prompt = '<title>Incomplete Tag';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('NO TOOL INVOCATION: <title>Incomplete Tag');
  });

  test('handles empty tags', () => {
    const prompt = '<title></title>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('');
  });

  test('handles empty parameter tags', () => {
    const prompt = '<parameter name="title"></parameter>';
    expect(parseParamFromPrompt(prompt, 'title')).toBe('');
  });
});
