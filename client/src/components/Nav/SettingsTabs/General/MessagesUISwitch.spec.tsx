import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from 'test/layout-test-utils';
import MessagesUISwitch from './MessagesUISwitch';
import { RecoilRoot } from 'recoil';

describe('MessagesUISwitch', () => {
  /**
   * Mock function to set the auto-scroll state.
   */
  let mockSetMessagesUI: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetMessagesUI = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <MessagesUISwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('messagesUI')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <MessagesUISwitch onCheckedChange={mockSetMessagesUI} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('messagesUI');
    fireEvent.click(switchElement);

    expect(mockSetMessagesUI).toHaveBeenCalledWith(true);
  });
});
