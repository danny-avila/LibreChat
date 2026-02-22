import 'test/matchMedia.mock';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { LangSelector } from './General';
import { RecoilRoot } from 'recoil';

describe('LangSelector', () => {
  let mockOnChange;

  beforeEach(() => {
    mockOnChange = jest.fn();
  });

  it('renders correctly', () => {
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
    const { getByText, getByRole } = render(
      <RecoilRoot>
        <LangSelector langcode="en-US" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Language')).toBeInTheDocument();
    const dropdownButton = getByRole('combobox');
    expect(dropdownButton).toHaveTextContent('English');
  });

  it('calls onChange when the select value changes', async () => {
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    };
    const { getByRole, getByTestId } = render(
      <RecoilRoot>
        <LangSelector langcode="en-US" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByRole('combobox')).toHaveTextContent('English');

    const dropdownButton = getByTestId('dropdown-menu');

    fireEvent.click(dropdownButton);

    const italianOption = getByRole('option', { name: 'Italiano' });
    fireEvent.click(italianOption);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith('it-IT');
    });
  });
});
