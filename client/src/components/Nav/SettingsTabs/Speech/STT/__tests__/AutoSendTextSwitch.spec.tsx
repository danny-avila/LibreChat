import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from 'test/layout-test-utils';
import AutoSendTextSwitch from '../AutoSendTextSwitch';
import { RecoilRoot } from 'recoil';

describe('AutoSendTextSwitch', () => {
  /**
   * Mock function to set the auto-send-text state.
   */
  let mockSetAutoSendText: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetAutoSendText = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoSendTextSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutoSendText')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoSendTextSwitch onCheckedChange={mockSetAutoSendText} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutoSendText');
    fireEvent.click(switchElement);

    expect(mockSetAutoSendText).toHaveBeenCalledWith(true);
  });
});
