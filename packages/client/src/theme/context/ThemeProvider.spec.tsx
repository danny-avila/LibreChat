import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { defaultTheme } from '../themes/default';
import { darkTheme } from '../themes/dark';

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
  const { resetTheme, setTheme, setThemeDefinition, setThemeName, setThemeRGB, themeName } =
    useTheme();
  return (
    <>
      <output>{themeName}</output>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setThemeName('renamed')}>Rename</button>
      <button onClick={() => setThemeRGB({ 'rgb-accent-primary': '4 5 6' })}>Set legacy</button>
      <button onClick={() => setThemeDefinition(undefined)}>Clear definition</button>
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
    expect(screen.getByText('legacy')).toBeInTheDocument();
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

  it('persists legacy prop overrides for later mounts', async () => {
    const { unmount } = render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy"
        themeRGB={{ 'rgb-accent-primary': '1 2 3' }}
      >
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toMatchObject({
        name: 'legacy',
      });
    });
    expect(JSON.parse(localStorage.getItem('theme-colors') ?? '{}')).toEqual({
      'rgb-accent-primary': '1 2 3',
    });
    expect(localStorage.getItem('color-theme')).toBe('light');

    unmount();
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    render(
      <ThemeProvider initialTheme="light">
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('legacy');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
  });

  it('keeps the active definition name synchronized across reloads', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy"
        themeRGB={{ 'rgb-accent-primary': '1 2 3' }}
      >
        <Controls />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'Rename' }).click());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('renamed');
    });
    expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toMatchObject({
      name: 'renamed',
    });
    expect(localStorage.getItem('theme-name')).toBe('renamed');
  });

  it('removes legacy colors when the authoritative definition is cleared', async () => {
    render(
      <ThemeProvider initialTheme="light">
        <Controls />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'Set legacy' }).click());
    await waitFor(() => {
      expect(localStorage.getItem('theme-colors')).not.toBeNull();
    });

    act(() => screen.getByRole('button', { name: 'Clear definition' }).click());

    expect(localStorage.getItem('theme-definition')).toBeNull();
    expect(localStorage.getItem('theme-colors')).toBeNull();
  });
});
