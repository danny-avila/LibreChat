import 'test/matchMedia.mock';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { ThemeSelector } from './General';
import { RecoilRoot } from 'recoil';

describe('ThemeSelector', () => {
  let mockOnChange;

  beforeEach(() => {
    mockOnChange = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText, getByDisplayValue } = render(
      <RecoilRoot>
        <ThemeSelector theme="system" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Theme')).toBeInTheDocument();
    expect(getByDisplayValue('System')).toBeInTheDocument();
  });

  it('calls onChange when the select value changes', () => {
    const { getByDisplayValue } = render(
      <RecoilRoot>
        <ThemeSelector theme="system" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    fireEvent.change(getByDisplayValue('System'), { target: { value: 'dark' } });

    expect(mockOnChange).toHaveBeenCalledWith('dark');
  });
});
