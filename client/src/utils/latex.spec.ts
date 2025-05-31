import { processLaTeX, preprocessLaTeX } from './latex';

describe('processLaTeX', () => {
  test('returns the same string if no LaTeX patterns are found', () => {
    const content = 'This is a test string without LaTeX';
    expect(processLaTeX(content)).toBe(content);
  });

  test('converts inline LaTeX expressions correctly', () => {
    const content = 'This is an inline LaTeX expression: \\(x^2 + y^2 = z^2\\)';
    const expected = 'This is an inline LaTeX expression: $x^2 + y^2 = z^2$';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('converts block LaTeX expressions correctly', () => {
    const content = 'This is a block LaTeX expression: \\[E = mc^2\\]';
    const expected = 'This is a block LaTeX expression: $$E = mc^2$$';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('converts mixed LaTeX expressions correctly', () => {
    const content = 'Inline \\(a + b = c\\) and block \\[x^2 + y^2 = z^2\\]';
    const expected = 'Inline $a + b = c$ and block $$x^2 + y^2 = z^2$$';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('escapes dollar signs followed by a digit or space and digit', () => {
    const content = 'Price is $50 and $ 100';
    const expected = 'Price is \\$50 and \\$ 100';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('handles strings with no content', () => {
    const content = '';
    expect(processLaTeX(content)).toBe('');
  });

  test('does not alter already valid inline Markdown LaTeX', () => {
    const content = 'This is a valid inline LaTeX: $x^2 + y^2 = z^2$';
    expect(processLaTeX(content)).toBe(content);
  });

  test('does not alter already valid block Markdown LaTeX', () => {
    const content = 'This is a valid block LaTeX: $$E = mc^2$$';
    expect(processLaTeX(content)).toBe(content);
  });

  test('correctly processes a mix of valid Markdown LaTeX and LaTeX patterns', () => {
    const content = 'Valid $a + b = c$ and LaTeX to convert \\(x^2 + y^2 = z^2\\)';
    const expected = 'Valid $a + b = c$ and LaTeX to convert $x^2 + y^2 = z^2$';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('correctly handles strings with LaTeX and non-LaTeX dollar signs', () => {
    const content = 'Price $100 and LaTeX \\(x^2 + y^2 = z^2\\)';
    const expected = 'Price \\$100 and LaTeX $x^2 + y^2 = z^2$';
    expect(processLaTeX(content)).toBe(expected);
  });

  test('ignores non-LaTeX content enclosed in dollar signs', () => {
    const content = 'This is not LaTeX: $This is just text$';
    expect(processLaTeX(content)).toBe(content);
  });

  test('correctly processes complex block LaTeX with line breaks', () => {
    const complexBlockLatex = `Certainly! Here's an example of a mathematical formula written in LaTeX:

    \\[
    \\sum_{i=1}^{n} \\left( \\frac{x_i}{y_i} \\right)^2
    \\]
    
    This formula represents the sum of the squares of the ratios of \\(x\\) to \\(y\\) for \\(n\\) terms, where \\(x_i\\) and \\(y_i\\) represent the values of \\(x\\) and \\(y\\) for each term.
    
    LaTeX is a typesetting system commonly used for mathematical and scientific documents. It provides a wide range of formatting options and symbols for expressing mathematical expressions.`;
    const expectedOutput = `Certainly! Here's an example of a mathematical formula written in LaTeX:

    $$
    \\sum_{i=1}^{n} \\left( \\frac{x_i}{y_i} \\right)^2
    $$
    
    This formula represents the sum of the squares of the ratios of $x$ to $y$ for $n$ terms, where $x_i$ and $y_i$ represent the values of $x$ and $y$ for each term.
    
    LaTeX is a typesetting system commonly used for mathematical and scientific documents. It provides a wide range of formatting options and symbols for expressing mathematical expressions.`;
    expect(processLaTeX(complexBlockLatex)).toBe(expectedOutput);
  });

  describe('processLaTeX with code block exception', () => {
    test('ignores dollar signs inside inline code', () => {
      const content = 'This is inline code: `$100`';
      expect(processLaTeX(content)).toBe(content);
    });

    test('ignores dollar signs inside multi-line code blocks', () => {
      const content = '```\n$100\n# $1000\n```';
      expect(processLaTeX(content)).toBe(content);
    });

    test('processes LaTeX outside of code blocks', () => {
      const content =
        'Outside \\(x^2 + y^2 = z^2\\) and inside code block: ```\n$100\n# $1000\n```';
      const expected = 'Outside $x^2 + y^2 = z^2$ and inside code block: ```\n$100\n# $1000\n```';
      expect(processLaTeX(content)).toBe(expected);
    });
  });
});

describe('preprocessLaTeX', () => {
  test('returns the same string if no LaTeX patterns are found', () => {
    const content = 'This is a test string without LaTeX';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('escapes dollar signs followed by digits', () => {
    const content = 'Price is $50 and $100';
    const expected = 'Price is \\$50 and \\$100';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('does not escape dollar signs not followed by digits', () => {
    const content = 'This $variable is not escaped';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('preserves existing LaTeX expressions', () => {
    const content = 'Inline $x^2 + y^2 = z^2$ and block $$E = mc^2$$';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('handles mixed LaTeX and currency', () => {
    const content = 'LaTeX $x^2$ and price $50';
    const expected = 'LaTeX $x^2$ and price \\$50';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('converts LaTeX delimiters', () => {
    const content = 'Brackets \\[x^2\\] and parentheses \\(y^2\\)';
    const expected = 'Brackets $$x^2$$ and parentheses $y^2$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes mhchem commands', () => {
    const content = '$\\ce{H2O}$ and $\\pu{123 J}$';
    const expected = '$\\\\ce{H2O}$ and $\\\\pu{123 J}$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles complex mixed content', () => {
    const content = `
      LaTeX inline $x^2$ and block $$y^2$$
      Currency $100 and $200
      Chemical $\\ce{H2O}$
      Brackets \\[z^2\\]
    `;
    const expected = `
      LaTeX inline $x^2$ and block $$y^2$$
      Currency \\$100 and \\$200
      Chemical $\\\\ce{H2O}$
      Brackets $$z^2$$
    `;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles empty string', () => {
    expect(preprocessLaTeX('')).toBe('');
  });

  test('preserves code blocks', () => {
    const content = '```\n$100\n```\nOutside $200';
    const expected = '```\n$100\n```\nOutside \\$200';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles multiple currency values in a sentence', () => {
    const content = 'I have $50 in my wallet and $100 in the bank.';
    const expected = 'I have \\$50 in my wallet and \\$100 in the bank.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('preserves LaTeX expressions with numbers', () => {
    const content = 'The equation is $f(x) = 2x + 3$ where x is a variable.';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('handles currency values with commas', () => {
    const content = 'The price is $1,000,000 for this item.';
    const expected = 'The price is \\$1,000,000 for this item.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('preserves LaTeX expressions with special characters', () => {
    const content = 'The set is defined as $\\{x | x > 0\\}$.';
    expect(preprocessLaTeX(content)).toBe(content);
  });
});
