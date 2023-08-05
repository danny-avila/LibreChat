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
    const { getByText, getByDisplayValue } = render(
      <RecoilRoot>
        <LangSelector langcode="en" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    expect(getByText('Language')).toBeInTheDocument();
    expect(getByDisplayValue('English')).toBeInTheDocument();
  });

  it('calls onChange when the select value changes', () => {
    const { getByDisplayValue } = render(
      <RecoilRoot>
        <LangSelector langcode="en" onChange={mockOnChange} />
      </RecoilRoot>,
    );

    fireEvent.change(getByDisplayValue('English'), { target: { value: 'it' } });

    expect(mockOnChange).toHaveBeenCalledWith('it');
  });
});
