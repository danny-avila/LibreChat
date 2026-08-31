// ThemeSelector.spec.tsx
import 'test/matchMedia.mock';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { clickDropdown, flushDropdownEffects } from 'test/dropdown';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import { ThemeSelector } from './Selectors';

describe('ThemeSelector', () => {
  let mockOnChange;

  beforeEach(() => {
    mockOnChange = jest.fn();
  });

  it('renders correctly', async () => {
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
    const { getByText, getByRole } = render(
      <RecoilRoot>
        <ThemeSelector theme="system" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Theme')).toBeInTheDocument();
    const dropdownButton = getByRole('combobox');
    expect(dropdownButton).toHaveTextContent('System');

    await flushDropdownEffects();
  });

  it('calls onChange when the select value changes', async () => {
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
    const { getByText, getByTestId } = render(
      <RecoilRoot>
        <ThemeSelector theme="system" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Theme')).toBeInTheDocument();

    const dropdownButton = getByTestId('theme-selector');

    await clickDropdown(dropdownButton);

    const darkOption = getByText('Dark');
    await clickDropdown(darkOption);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith('dark');
    });
  });
});
