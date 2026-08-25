import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeSelector from './ThemeSelector';
import { ThemeContext } from '../theme';

jest.mock('./MorphIcon', () => {
  const { createMorphIconMock } = jest.requireActual('../test/mockMorphIcon');
  const { Sun, Moon, Monitor, Contrast } = jest.requireActual('lucide');
  return {
    MorphIcon: createMorphIconMock([
      [Sun, 'sun'],
      [Moon, 'moon'],
      [Monitor, 'monitor'],
      [Contrast, 'contrast'],
    ]),
  };
});

jest.mock('../hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const renderTheme = (theme: string, highContrast = false, setTheme = jest.fn()) => {
  const view = render(
    <ThemeContext.Provider
      value={
        {
          theme,
          setTheme,
          resolvedMode: 'light',
          highContrast,
          setThemeRGB: () => undefined,
          setThemeDefinition: () => undefined,
          setThemeName: () => undefined,
          resetTheme: () => undefined,
        } as React.ContextType<typeof ThemeContext>
      }
    >
      <ThemeSelector returnThemeOnly />
    </ThemeContext.Provider>,
  );
  return { setTheme, unmount: view.unmount };
};

beforeEach(() => {
  /** `changeTheme` throttles itself through this global for 500ms. */
  window.lastThemeChange = undefined;
  window.matchMedia = jest.fn().mockImplementation(
    (media: string) =>
      ({
        matches: false,
        media,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }) as unknown as MediaQueryList,
  );
});

describe('ThemeSelector MorphIcon map', () => {
  it('shows monitor for system, moon for dark, sun for light', () => {
    const system = renderTheme('system');
    expect(screen.getByTestId('monitor')).toBeInTheDocument();
    expect(screen.getByTestId('monitor')).toHaveAttribute('data-size', '24');
    system.unmount();

    const dark = renderTheme('dark');
    expect(screen.getByTestId('moon')).toBeInTheDocument();
    dark.unmount();

    renderTheme('light');
    expect(screen.getByTestId('sun')).toBeInTheDocument();
  });

  /** An unmapped icon falls back to `morph-icon`, so a missing high contrast
   *  entry in the icon record would surface here rather than as a blank glyph. */
  it('shows the contrast icon for both high contrast modes', () => {
    const light = renderTheme('high-contrast-light', true);
    expect(screen.getByTestId('contrast')).toBeInTheDocument();
    light.unmount();

    renderTheme('high-contrast-dark', true);
    expect(screen.getByTestId('contrast')).toBeInTheDocument();
  });

  it('toggles theme when the button is activated', () => {
    // isDark('light') is false → next is dark
    const { setTheme } = renderTheme('light');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_toggle_theme' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('ThemeSelector scheme toggle', () => {
  it('flips the scheme and keeps an explicit contrast choice', () => {
    const { setTheme } = renderTheme('high-contrast-light', true);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('high-contrast-dark');
  });

  /** Under `system` the contrast comes from `prefers-contrast`, so the stored
   *  mode never names it and only the resolved value can carry it forward. */
  it('keeps an OS-requested contrast when the stored mode is system', () => {
    const { setTheme } = renderTheme('system', true);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('high-contrast-dark');
  });

  it('leaves an ordinary system mode on the plain schemes', () => {
    const { setTheme } = renderTheme('system', false);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('answers Ctrl+Shift+T with the same choice', () => {
    const { setTheme } = renderTheme('system', true);
    fireEvent.keyDown(window, { key: 'T', ctrlKey: true, shiftKey: true });
    expect(setTheme).toHaveBeenCalledWith('high-contrast-dark');
  });
});
