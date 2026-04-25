import React from 'react';
import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';
import type { ThemePalette } from './ThemeProvider';

jest.mock('../utils/applyTheme', () => jest.fn());

function ThemeConsumer({ onTheme }: { onTheme: (ctx: ReturnType<typeof useTheme>) => void }) {
  const ctx = useTheme();
  React.useEffect(() => {
    onTheme(ctx);
  });
  return null;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.cssText = '';
});

describe('palette prop', () => {
  const palette: ThemePalette = {
    light: { 'surface-primary': '255 255 255', 'text-primary': '0 0 0' },
    dark: { 'surface-primary': '30 30 30', 'text-primary': '220 220 220' },
  };

  it('applies light palette colors when theme is light', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="light" palette={palette}>
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    expect(captured?.themeRGB).toEqual(
      expect.objectContaining({
        'rgb-surface-primary': '255 255 255',
        'rgb-text-primary': '0 0 0',
      }),
    );
  });

  it('applies dark palette colors when theme is dark', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="dark" palette={palette}>
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    expect(captured?.themeRGB).toEqual(
      expect.objectContaining({
        'rgb-surface-primary': '30 30 30',
        'rgb-text-primary': '220 220 220',
      }),
    );
  });

  it('prefixes palette keys with rgb-', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="light" palette={palette}>
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    const keys = Object.keys(captured?.themeRGB ?? {});
    expect(keys.every((k) => k.startsWith('rgb-'))).toBe(true);
  });

  it('does not set themeRGB when palette is undefined', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="light">
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    expect(captured?.themeRGB).toBeUndefined();
  });

  it('does not set themeRGB when current mode has no palette entry', () => {
    const darkOnly: ThemePalette = {
      dark: { 'surface-primary': '30 30 30' },
    };
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="light" palette={darkOnly}>
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    expect(captured?.themeRGB).toBeUndefined();
  });

  it('registers a media query listener for system theme and cleans up on unmount', () => {
    const addSpy = jest.fn();
    const removeSpy = jest.fn();
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: addSpy,
      removeEventListener: removeSpy,
      dispatchEvent: jest.fn(),
    }));

    const { unmount } = render(
      <ThemeProvider initialTheme="system" palette={palette}>
        <div />
      </ThemeProvider>,
    );

    const paletteCalls = addSpy.mock.calls.filter(([event]: [string]) => event === 'change');
    expect(paletteCalls.length).toBeGreaterThanOrEqual(1);

    unmount();
    const removeCallCount = removeSpy.mock.calls.filter(
      ([event]: [string]) => event === 'change',
    ).length;
    expect(removeCallCount).toBeGreaterThanOrEqual(1);
  });

  it('switches palette colors when theme changes from light to dark', () => {
    let captured: ReturnType<typeof useTheme> | undefined;
    render(
      <ThemeProvider initialTheme="light" palette={palette}>
        <ThemeConsumer onTheme={(ctx) => (captured = ctx)} />
      </ThemeProvider>,
    );

    expect(captured?.themeRGB).toEqual(
      expect.objectContaining({ 'rgb-surface-primary': '255 255 255' }),
    );

    act(() => captured?.setTheme('dark'));

    expect(captured?.themeRGB).toEqual(
      expect.objectContaining({ 'rgb-surface-primary': '30 30 30' }),
    );
  });
});
