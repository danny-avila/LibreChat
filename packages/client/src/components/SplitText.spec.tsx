import { render } from '@testing-library/react';
import SplitText from './SplitText';

describe('SplitText', () => {
  it.each(['سلام', 'می‌توانید', 'مرحبا', 'שלום'])(
    'keeps the RTL word %s together so the browser can shape it',
    (word) => {
      const { container } = render(<SplitText text={word} />);
      const animatedSegments = container.querySelectorAll('p > span > span.inline-block');

      expect(animatedSegments).toHaveLength(1);
      expect(animatedSegments[0]).toHaveTextContent(word);
      expect(container.querySelector('p')).toHaveAttribute('dir', 'auto');
    },
  );

  it('preserves the logical order of mixed Persian and Latin text', () => {
    const { container } = render(<SplitText text="سلام OpenAI 123!" />);
    const words = container.querySelectorAll('p > span');

    expect(Array.from(words, (word) => word.textContent?.trim())).toEqual([
      'سلام',
      'OpenAI',
      '123!',
    ]);
    expect(words[1].querySelectorAll('span.inline-block')).toHaveLength(1);
    expect(words[2].querySelectorAll('span.inline-block')).toHaveLength(1);
  });

  it('keeps per-grapheme animation for Latin-only text', () => {
    const { container } = render(<SplitText text="OpenAI" />);

    expect(container.querySelectorAll('p > span > span.inline-block')).toHaveLength(6);
  });

  it('renders emojis correctly', () => {
    const emojis = ['🚧', '❤️‍🔥', '💜', '🦎', '❌', '✅', '⚠️'];
    const originalText = emojis.join('');

    const { container } = render(<SplitText text={originalText} />);
    const textSpans = container.querySelectorAll('p > span > span.inline-block');

    // Reconstruct the text by joining all span contents
    const reconstructedText = Array.from(textSpans)
      .map((span) => span.textContent)
      .join('')
      .trim();
    // Compare the reconstructed text with the original
    expect(reconstructedText).toBe(originalText);

    // Check the first character specifically as the reconstructed text could hide issues
    for (let i = 0; i < emojis.length; i++) {
      expect(Array.from(textSpans)[i].textContent).toBe(emojis[i]);
    }
  });
});
