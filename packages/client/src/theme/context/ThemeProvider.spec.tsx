import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';

import { darkTheme } from '../themes/dark';
import { defaultTheme } from '../themes/default';
import { ThemeProvider, useTheme } from './ThemeProvider';

const matchMedia = (matches: boolean): MediaQueryList =>
  ({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }) as MediaQueryList;

function Controls() {
  const { resetTheme, setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={resetTheme}>Reset</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  window.matchMedia = jest.fn(() => matchMedia(false));
});

describe('ThemeProvider', () => {
  it('adapts legacy RGB props into a complete mode-aware definition', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy"
        themeRGB={{ 'rgb-accent-primary': '1 2 3' }}
      >
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('legacy');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe(
      defaultTheme['rgb-text-primary'],
    );

    act(() => screen.getByRole('button', { name: 'Dark' }).click());

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe(
      darkTheme['rgb-text-primary'],
    );
  });

  it('resets only theme-owned properties', async () => {
    document.documentElement.style.setProperty('--markdown-font-size', '18px');
    render(
      <ThemeProvider initialTheme="light" themeRGB={{ 'rgb-accent-primary': '1 2 3' }}>
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    });
    act(() => screen.getByRole('button', { name: 'Reset' }).click());

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('');
    });
    expect(document.documentElement.style.getPropertyValue('--markdown-font-size')).toBe('18px');
  });
});
