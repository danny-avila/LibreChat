import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeSelector from './ThemeSelector';
import { ThemeContext } from '../theme';

jest.mock('./MorphIcon', () => {
  const { createMorphIconMock } = jest.requireActual('../test/mockMorphIcon');
  const { Sun, Moon, Monitor } = jest.requireActual('lucide');
  return {
    MorphIcon: createMorphIconMock([
      [Sun, 'sun'],
      [Moon, 'moon'],
      [Monitor, 'monitor'],
    ]),
  };
});

function renderTheme(theme: string, setTheme = jest.fn()) {
  return render(
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        setThemeRGB: jest.fn(),
        setThemeName: jest.fn(),
        resetTheme: jest.fn(),
      }}
    >
      <ThemeSelector returnThemeOnly />
    </ThemeContext.Provider>,
  );
}

describe('ThemeSelector MorphIcon map', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'lastThemeChange', {
      writable: true,
      configurable: true,
      value: 0,
    });
  });

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

  it('toggles theme when the button is activated', () => {
    const setTheme = jest.fn();
    // isDark('light') is false → next is dark
    renderTheme('light', setTheme);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_toggle_theme' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
