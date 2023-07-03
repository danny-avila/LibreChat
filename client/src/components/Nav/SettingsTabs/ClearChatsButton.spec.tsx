import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { ClearChatsButton } from './General';

describe('ClearChatsButton', () => {
  let mockOnClick;

  beforeEach(() => {
    mockOnClick = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText } = render(
      <ClearChatsButton confirmClear={false} showText={true} onClick={mockOnClick} />
    );

    expect(getByText('Clear all chats')).toBeInTheDocument();
    expect(getByText('Clear')).toBeInTheDocument();
  });

  it('renders confirm clear when confirmClear is true', () => {
    const { getByText } = render(
      <ClearChatsButton confirmClear={true} showText={true} onClick={mockOnClick} />
    );

    expect(getByText('Confirm Clear')).toBeInTheDocument();
  });

  it('calls onClick when the button is clicked', () => {
    const { getByText } = render(
      <ClearChatsButton confirmClear={false} showText={true} onClick={mockOnClick} />
    );

    fireEvent.click(getByText('Clear'));

    expect(mockOnClick).toHaveBeenCalled();
  });
});
