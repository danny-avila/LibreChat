import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { ClearChatsButton } from './General';
import { RecoilRoot } from 'recoil';

describe('ClearChatsButton', () => {
  let mockOnClick;

  beforeEach(() => {
    mockOnClick = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText } = render(
      <RecoilRoot>
        <ClearChatsButton confirmClear={false} showText={true} onClick={mockOnClick} />
      </RecoilRoot>,
    );

    expect(getByText('清空所有对话')).toBeInTheDocument();
    expect(getByText('清空')).toBeInTheDocument();
  });

  it('renders confirm clear when confirmClear is true', () => {
    const { getByText } = render(
      <RecoilRoot>
        <ClearChatsButton confirmClear={true} showText={true} onClick={mockOnClick} />
      </RecoilRoot>,
    );

    expect(getByText('确认清空')).toBeInTheDocument();
  });

  it('calls onClick when the button is clicked', () => {
    const { getByText } = render(
      <RecoilRoot>
        <ClearChatsButton confirmClear={false} showText={true} onClick={mockOnClick} />
      </RecoilRoot>,
    );

    fireEvent.click(getByText('清空'));

    expect(mockOnClick).toHaveBeenCalled();
  });
});
