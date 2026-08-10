import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
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
  const { resetTheme, setTheme, setThemeDefinition, setThemeName, setThemeRGB, themeName } =
    useTheme();
  return (
    <>
      <output>{themeName}</output>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setThemeName('renamed')}>Rename</button>
      <button onClick={() => setThemeName(undefined)}>Clear name</button>
      <button onClick={() => setThemeRGB({ 'rgb-accent-primary': '4 5 6' })}>Set legacy</button>
      <button
        onClick={() => {
          setThemeRGB({ 'rgb-accent-primary': '7 8 9' });
          setThemeName('batched');
        }}
      >
        Batch legacy
      </button>
      <button
        onClick={() => {
          setThemeName('name-first');
          setThemeRGB({ 'rgb-accent-primary': '10 11 12' });
        }}
      >
        Batch name first
      </button>
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
  it('preserves CSS fallbacks for colors omitted by legacy RGB props', async () => {
    document.documentElement.style.setProperty('--text-primary', '9 9 9');
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
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('9 9 9');

    act(() => screen.getByRole('button', { name: 'Dark' }).click());

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('9 9 9');
  });

  it('keeps theme definition identity authoritative over legacy naming', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy-name"
        themeDefinition={{
          version: 1,
          name: 'definition-name',
          modes: { light: { colors: { 'rgb-accent-primary': '1 2 3' } } },
        }}
      >
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('definition-name');
    });
    expect(screen.getByText('definition-name')).toBeInTheDocument();
    expect(localStorage.getItem('theme-name')).toBe('definition-name');
  });

  it('keeps valid legacy overrides when another token is malformed', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeRGB={{
          'rgb-accent-primary': '1 2 3',
          'rgb-text-primary': 'invalid',
        }}
      >
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    });
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('');
    expect(JSON.parse(localStorage.getItem('theme-colors') ?? '{}')).toEqual({
      'rgb-accent-primary': '1 2 3',
    });
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
    expect(localStorage.getItem('theme-definition')).toBeNull();
    expect(localStorage.getItem('theme-name')).toBeNull();
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

  it('coordinates batched legacy color and name updates', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy"
        themeRGB={{ 'rgb-accent-primary': '1 2 3' }}
      >
        <Controls />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'Batch legacy' }).click());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('batched');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('7 8 9');
    expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toMatchObject({
      name: 'batched',
      modes: {
        light: { colors: { 'rgb-accent-primary': '7 8 9' } },
      },
    });
    expect(JSON.parse(localStorage.getItem('theme-colors') ?? '{}')).toEqual({
      'rgb-accent-primary': '7 8 9',
    });
  });

  it('coordinates batched legacy name and color updates when no definition is active', async () => {
    render(
      <ThemeProvider initialTheme="light">
        <Controls />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'Batch name first' }).click());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('name-first');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('10 11 12');
    expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toMatchObject({
      name: 'name-first',
      modes: {
        light: { colors: { 'rgb-accent-primary': '10 11 12' } },
      },
    });
  });

  it('keeps a valid stored theme when a prop definition is invalid', async () => {
    const storedDefinition = {
      version: 1 as const,
      name: 'stored',
      modes: { light: { colors: { 'rgb-accent-primary': '9 8 7' } } },
    };
    localStorage.setItem('theme-definition', JSON.stringify(storedDefinition));
    localStorage.setItem('theme-name', 'stored');

    render(
      <ThemeProvider
        initialTheme="light"
        themeDefinition={{
          version: 1,
          name: 'invalid',
          modes: { light: { colors: { 'rgb-accent-primary': 'not-rgb' } } },
        }}
      >
        <Controls />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('stored');
    });
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('9 8 7');
    expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toEqual(storedDefinition);
    expect(localStorage.getItem('theme-name')).toBe('stored');
  });

  it('uses a stable identity when a legacy consumer clears an active theme name', async () => {
    render(
      <ThemeProvider
        initialTheme="light"
        themeName="legacy"
        themeRGB={{ 'rgb-accent-primary': '1 2 3' }}
      >
        <Controls />
      </ThemeProvider>,
    );

    act(() => screen.getByRole('button', { name: 'Clear name' }).click());

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('custom');
    });
    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('theme-definition') ?? '{}')).toMatchObject({
      name: 'custom',
    });
    expect(localStorage.getItem('theme-name')).toBe('custom');
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('1 2 3');
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
