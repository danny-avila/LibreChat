import { processLaTeX } from './latex';

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
});
