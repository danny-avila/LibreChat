import { preprocessCodeArtifacts } from './artifacts';

describe('preprocessCodeArtifacts', () => {
  test('should return non-string inputs unchanged', () => {
    expect(preprocessCodeArtifacts(123 as unknown as string)).toBe('');
    expect(preprocessCodeArtifacts(null as unknown as string)).toBe('');
    expect(preprocessCodeArtifacts(undefined)).toBe('');
    expect(preprocessCodeArtifacts({} as unknown as string)).toEqual('');
  });

  test('should remove <thinking> tags and their content', () => {
    const input = '<thinking>This should be removed</thinking>Some content';
    const expected = 'Some content';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should remove unclosed <thinking> tags and their content', () => {
    const input = '<thinking>This should be removed\nSome content';
    const expected = '';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should remove artifact headers up to and including empty code block', () => {
    const input = ':::artifact{identifier="test"}\n```\n```\nSome content';
    const expected = ':::artifact{identifier="test"}\n```\n```\nSome content';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should keep artifact headers when followed by empty code block and content', () => {
    const input = ':::artifact{identifier="test"}\n```\n```\nSome content';
    const expected = ':::artifact{identifier="test"}\n```\n```\nSome content';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should handle multiple artifact headers correctly', () => {
    const input = ':::artifact{id="1"}\n```\n```\n:::artifact{id="2"}\n```\ncode\n```\nContent';
    const expected = ':::artifact{id="1"}\n```\n```\n:::artifact{id="2"}\n```\ncode\n```\nContent';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should handle complex input with multiple patterns', () => {
    const input = `
  <thinking>Remove this</thinking>
  Some text
  :::artifact{id="1"}
  \`\`\`
  \`\`\`
  <thinking>And this</thinking>
  :::artifact{id="2"}
  \`\`\`
  keep this code
  \`\`\`
  More text
      `;
    const expected = `
  
  Some text
  :::artifact{id="1"}
  \`\`\`
  \`\`\`
  
  :::artifact{id="2"}
  \`\`\`
  keep this code
  \`\`\`
  More text
      `;
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should remove artifact headers without code blocks', () => {
    const input = ':::artifact{identifier="test"}\nSome content without code block';
    const expected = '';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should remove artifact headers up to incomplete code block', () => {
    const input = ':::artifact{identifier="react-cal';
    const expected = '';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should keep artifact headers when any character follows code block', () => {
    const input = ':::artifact{identifier="react-calculator"}\n```t';
    const expected = ':::artifact{identifier="react-calculator"}\n```t';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });

  test('should keep artifact headers when whitespace follows code block', () => {
    const input = ':::artifact{identifier="react-calculator"}\n``` ';
    const expected = ':::artifact{identifier="react-calculator"}\n``` ';
    expect(preprocessCodeArtifacts(input)).toBe(expected);
  });
});
