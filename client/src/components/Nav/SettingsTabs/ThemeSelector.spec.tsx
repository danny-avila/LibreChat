import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { ThemeSelector } from './General';

describe('ThemeSelector', () => {
  let mockOnChange;

  beforeEach(() => {
    mockOnChange = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText, getByDisplayValue } = render(
      <ThemeSelector theme="system" onChange={mockOnChange} />,
    );

    expect(getByText('Theme')).toBeInTheDocument();
    expect(getByDisplayValue('System')).toBeInTheDocument();
  });

  it('calls onChange when the select value changes', () => {
    const { getByDisplayValue } = render(<ThemeSelector theme="system" onChange={mockOnChange} />);

    fireEvent.change(getByDisplayValue('System'), { target: { value: 'dark' } });

    expect(mockOnChange).toHaveBeenCalledWith('dark');
  });
});
