import { preprocessLaTeX, preprocessTilde } from './latex';

describe('preprocessLaTeX', () => {
  test('returns the same string if no LaTeX patterns are found', () => {
    const content = 'This is a test string without LaTeX or dollar signs';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('returns the same string if no dollar signs are present', () => {
    const content = 'This has LaTeX \\(x^2\\) and \\[y^2\\] but no dollars';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('preserves valid inline LaTeX delimiters \\(...\\)', () => {
    const content = 'This is inline LaTeX: \\(x^2 + y^2 = z^2\\)';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('preserves valid block LaTeX delimiters \\[...\\]', () => {
    const content = 'This is block LaTeX: \\[E = mc^2\\]';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('preserves valid double dollar delimiters', () => {
    const content = 'This is valid: $$x^2 + y^2 = z^2$$';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('converts single dollar delimiters to double dollars', () => {
    const content = 'Inline math: $x^2 + y^2 = z^2$';
    const expected = 'Inline math: $$x^2 + y^2 = z^2$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('converts multiple single dollar expressions', () => {
    const content = 'First $a + b = c$ and second $x^2 + y^2 = z^2$';
    const expected = 'First $$a + b = c$$ and second $$x^2 + y^2 = z^2$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency dollar signs', () => {
    const content = 'Price is $50 and $100';
    const expected = 'Price is \\$50 and \\$100';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency with spaces', () => {
    const content = '$50 is $20 + $30';
    const expected = '\\$50 is \\$20 + \\$30';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency with commas', () => {
    const content = 'The price is $1,000,000 for this item.';
    const expected = 'The price is \\$1,000,000 for this item.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency with decimals', () => {
    const content = 'Total: $29.50 plus tax';
    const expected = 'Total: \\$29.50 plus tax';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('converts LaTeX expressions while escaping currency', () => {
    const content = 'LaTeX $x^2$ and price $50';
    const expected = 'LaTeX $$x^2$$ and price \\$50';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles Goldbach Conjecture example', () => {
    const content = '- **Goldbach Conjecture**: $2n = p + q$ (every even integer > 2)';
    const expected = '- **Goldbach Conjecture**: $$2n = p + q$$ (every even integer > 2)';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('does not escape already escaped dollar signs', () => {
    const content = 'Already escaped \\$50 and \\$100';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('does not convert already escaped single dollars', () => {
    const content = 'Escaped \\$x^2\\$ should not change';
    expect(preprocessLaTeX(content)).toBe(content);
  });

  test('escapes mhchem commands', () => {
    const content = '$\\ce{H2O}$ and $\\pu{123 J}$';
    const expected = '$$\\\\ce{H2O}$$ and $$\\\\pu{123 J}$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles empty string', () => {
    expect(preprocessLaTeX('')).toBe('');
  });

  test('handles complex mixed content', () => {
    const content = `Valid double $$y^2$$
Currency $100 and $200
Single dollar math $x^2 + y^2$
Chemical $\\ce{H2O}$
Valid brackets \\[z^2\\]`;
    const expected = `Valid double $$y^2$$
Currency \\$100 and \\$200
Single dollar math $$x^2 + y^2$$
Chemical $$\\\\ce{H2O}$$
Valid brackets \\[z^2\\]`;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles multiple equations with currency', () => {
    const content = `- **Euler's Totient Function**: $\\phi(n) = n \\prod_{p|n} \\left(1 - \\frac{1}{p}\\right)$
- **Total Savings**: $500 + $200 + $150 = $850`;
    const expected = `- **Euler's Totient Function**: $$\\phi(n) = n \\prod_{p|n} \\left(1 - \\frac{1}{p}\\right)$$
- **Total Savings**: \\$500 + \\$200 + \\$150 = \\$850`;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles inline code blocks', () => {
    const content = 'Outside $x^2$ and inside code: `$100`';
    const expected = 'Outside $$x^2$$ and inside code: `$100`';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles multiline code blocks', () => {
    const content = '```\n$100\n$variable\n```\nOutside $x^2$';
    const expected = '```\n$100\n$variable\n```\nOutside $$x^2$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('preserves LaTeX expressions with special characters', () => {
    const content = 'The set is defined as $\\{x | x > 0\\}$.';
    const expected = 'The set is defined as $$\\{x | x > 0\\}$$.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles complex physics equations', () => {
    const content = `- **Schrödinger Equation**: $i\\hbar\\frac{\\partial}{\\partial t}|\\psi\\rangle = \\hat{H}|\\psi\\rangle$
- **Einstein Field Equations**: $G_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$`;
    const expected = `- **Schrödinger Equation**: $$i\\hbar\\frac{\\partial}{\\partial t}|\\psi\\rangle = \\hat{H}|\\psi\\rangle$$
- **Einstein Field Equations**: $$G_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$$`;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles financial calculations with currency', () => {
    const content = `- **Simple Interest**: $A = P + Prt = $1,000 + ($1,000)(0.05)(2) = $1,100$
- **ROI**: $\\text{ROI} = \\frac{$1,200 - $1,000}{$1,000} \\times 100\\% = 20\\%$`;
    const expected = `- **Simple Interest**: $$A = P + Prt = \\$1,000 + (\\$1,000)(0.05)(2) = \\$1,100$$
- **ROI**: $$\\text{ROI} = \\frac{\\$1,200 - \\$1,000}{\\$1,000} \\times 100\\% = 20\\%$$`;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('does not convert partial or malformed expressions', () => {
    const content = 'A single $ sign should not be converted';
    const expected = 'A single $ sign should not be converted';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles nested parentheses in LaTeX', () => {
    const content =
      'Matrix determinant: $\\det(A) = \\sum_{\\sigma \\in S_n} \\text{sgn}(\\sigma) \\prod_{i=1}^n a_{i,\\sigma(i)}$';
    const expected =
      'Matrix determinant: $$\\det(A) = \\sum_{\\sigma \\in S_n} \\text{sgn}(\\sigma) \\prod_{i=1}^n a_{i,\\sigma(i)}$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('preserves spacing in equations', () => {
    const content = 'Equation: $f(x) = 2x + 3$ where x is a variable.';
    const expected = 'Equation: $$f(x) = 2x + 3$$ where x is a variable.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles LaTeX with newlines inside should not be converted', () => {
    const content = `This has $x
y$ which spans lines`;
    const expected = `This has $x
y$ which spans lines`;
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles multiple dollar signs in text', () => {
    const content = 'Price $100 then equation $x + y = z$ then another price $50';
    const expected = 'Price \\$100 then equation $$x + y = z$$ then another price \\$50';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles complex LaTeX with currency in same expression', () => {
    const content = 'Calculate $\\text{Total} = \\$500 + \\$200$';
    const expected = 'Calculate $$\\text{Total} = \\$500 + \\$200$$';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('preserves already escaped dollars in LaTeX', () => {
    const content = 'The formula $f(x) = \\$2x$ represents cost';
    const expected = 'The formula $$f(x) = \\$2x$$ represents cost';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles adjacent LaTeX and currency', () => {
    const content = 'Formula $x^2$ costs $25';
    const expected = 'Formula $$x^2$$ costs \\$25';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles LaTeX with special characters and currency', () => {
    const content = 'Set $\\{x | x > \\$0\\}$ for positive prices';
    const expected = 'Set $$\\{x | x > \\$0\\}$$ for positive prices';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('does not convert when closing dollar is preceded by backtick', () => {
    const content = 'The error "invalid $lookup namespace" occurs when using `$lookup` operator';
    const expected = 'The error "invalid $lookup namespace" occurs when using `$lookup` operator';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles mixed backtick and non-backtick cases', () => {
    const content = 'Use $x + y$ in math but `$lookup` in code';
    const expected = 'Use $$x + y$$ in math but `$lookup` in code';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency amounts without commas', () => {
    const content =
      'The total amount invested is $1157.90 (existing amount) + $500 (new investment) = $1657.90.';
    const expected =
      'The total amount invested is \\$1157.90 (existing amount) + \\$500 (new investment) = \\$1657.90.';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles large currency amounts', () => {
    const content = 'You can win $1000000 or even $9999999.99!';
    const expected = 'You can win \\$1000000 or even \\$9999999.99!';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes currency with many decimal places', () => {
    const content = 'Bitcoin: $0.00001234, Gas: $3.999, Rate: $1.234567890';
    const expected = 'Bitcoin: \\$0.00001234, Gas: \\$3.999, Rate: \\$1.234567890';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('escapes abbreviated currency notation', () => {
    const content = '$250k is 25% of $1M';
    const expected = '\\$250k is 25% of \\$1M';
    expect(preprocessLaTeX(content)).toBe(expected);
  });

  test('handles various abbreviated currency formats', () => {
    const content = 'Revenue: $5M to $10M, funding: $1.5B, price: $5K';
    const expected = 'Revenue: \\$5M to \\$10M, funding: \\$1.5B, price: \\$5K';
    expect(preprocessLaTeX(content)).toBe(expected);
  });
});

describe('preprocessTilde', () => {
  const T = '∼'; // U+223C TILDE OPERATOR

  test('returns the same string when no tilde is present', () => {
    const content = 'This is a test string without any tilde';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('neutralizes paired approximation tildes that would become subscript', () => {
    const content =
      'The first leg down. ~50% of IPOs close day 2 below day 1. Modest (a few percent to ~10%).';
    const expected = `The first leg down. ${T}50% of IPOs close day 2 below day 1. Modest (a few percent to ${T}10%).`;
    expect(preprocessTilde(content)).toBe(expected);
  });

  test('neutralizes a single approximation tilde', () => {
    expect(preprocessTilde('about ~50 people')).toBe(`about ${T}50 people`);
  });

  test('neutralizes approximation tilde before currency', () => {
    expect(preprocessTilde('costs ~$50 total')).toBe(`costs ${T}$50 total`);
  });

  test('neutralizes approximation tilde with a space and negative number', () => {
    expect(preprocessTilde('mega-IPO is ~ -3% from day-1')).toBe(`mega-IPO is ${T} -3% from day-1`);
  });

  test('neutralizes approximation tilde after an opening parenthesis', () => {
    expect(preprocessTilde('range (~10% to ~20%)')).toBe(`range (${T}10% to ${T}20%)`);
  });

  test('preserves genuine subscripts attached to a word', () => {
    const content = 'Water is H~2~O and the value is x~1~';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('preserves a space-delimited closed-number subscript', () => {
    const content = 'the term a ~2~ in the series';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('preserves home directory paths', () => {
    const content = 'Open ~/Documents/file and ~/.config';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('preserves GFM strikethrough', () => {
    const content = 'This is ~~deleted text~~ here';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('neutralizes escaped approximation tildes (markdown decodes the backslash)', () => {
    expect(preprocessTilde('literal \\~50 percent')).toBe(`literal ${T}50 percent`);
  });

  test('neutralizes an escaped approximation tilde pair', () => {
    expect(preprocessTilde('\\~50% down then \\~10% more')).toBe(`${T}50% down then ${T}10% more`);
  });

  test('preserves tildes in markdown link URLs', () => {
    const content = 'see [src](https://example.com/~50/file) here';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('preserves tildes in autolink URLs', () => {
    const content = 'visit https://example.com/~50/file now';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('converts approximation tildes in link display text', () => {
    expect(preprocessTilde('[~50% off](url)')).toBe(`[${T}50% off](url)`);
  });

  test('preserves tildes inside dollar math delimiters', () => {
    const content = 'value $~10$ and $$~20$$ here';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('preserves tildes inside backslash math delimiters', () => {
    const content = 'inline \\(~10\\) and block \\[~20\\] math';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('ignores tildes inside inline code', () => {
    const content = 'Outside ~50% and inside `~50%` code';
    const expected = `Outside ${T}50% and inside \`~50%\` code`;
    expect(preprocessTilde(content)).toBe(expected);
  });

  test('ignores tildes inside multiline code blocks', () => {
    const content = '```\n~50% in code\n~/path\n```\nOutside ~10%';
    const expected = `\`\`\`\n~50% in code\n~/path\n\`\`\`\nOutside ${T}10%`;
    expect(preprocessTilde(content)).toBe(expected);
  });

  test('does not match a tilde attached to a preceding number', () => {
    const content = 'range 5~10 items';
    expect(preprocessTilde(content)).toBe(content);
  });

  test('handles empty string', () => {
    expect(preprocessTilde('')).toBe('');
  });
});
