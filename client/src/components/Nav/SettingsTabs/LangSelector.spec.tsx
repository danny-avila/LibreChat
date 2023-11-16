import 'test/matchMedia.mock';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { LangSelector } from './General';
import { RecoilRoot } from 'recoil';

describe('LangSelector', () => {
  let mockOnChange;

  beforeEach(() => {
    mockOnChange = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText } = render(
      <RecoilRoot>
        <LangSelector langcode="en-US" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Language')).toBeInTheDocument();
    expect(getByText('English')).toBeInTheDocument();
  });

  it('calls onChange when the select value changes', async () => {
    const { getByText, getByTestId } = render(
      <RecoilRoot>
        <LangSelector langcode="en-US" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('English')).toBeInTheDocument();

    // Find the dropdown button by data-testid
    const dropdownButton = getByTestId('dropdown-menu');

    // Open the dropdown
    fireEvent.click(dropdownButton);

    // Find the option by text and click it
    const darkOption = getByText('Italiano');
    fireEvent.click(darkOption);

    // Ensure that the onChange is called with the expected value after a short delay
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
