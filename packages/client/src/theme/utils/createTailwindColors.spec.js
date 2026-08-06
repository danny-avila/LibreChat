const { createTailwindColors } = require('./createTailwindColors');

describe('createTailwindColors', () => {
  it('combines intrinsic border alpha with Tailwind opacity modifiers', () => {
    const colors = createTailwindColors();

    expect(colors['border-light']).toBe(
      'rgb(var(--border-light) / calc(var(--border-light-alpha, 1) * <alpha-value>))',
    );
    expect(colors['border-medium']).toBe(
      'rgb(var(--border-medium) / calc(var(--border-medium-alpha, 1) * <alpha-value>))',
    );
    expect(colors['border-heavy']).toBe(
      'rgb(var(--border-heavy) / calc(var(--border-heavy-alpha, 1) * <alpha-value>))',
    );
    expect(colors['border-xheavy']).toBe(
      'rgb(var(--border-xheavy) / calc(var(--border-xheavy-alpha, 1) * <alpha-value>))',
    );
  });
});
