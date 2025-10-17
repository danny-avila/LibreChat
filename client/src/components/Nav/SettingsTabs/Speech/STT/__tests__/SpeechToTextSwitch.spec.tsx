import { render, fireEvent } from 'test/layout-test-utils';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import React from 'react';
import SpeechToTextSwitch from '../SpeechToTextSwitch';

describe('SpeechToTextSwitch', () => {
  /**
   * Mock function to set the speech-to-text state.
   */
  let mockSetSpeechToText: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetSpeechToText = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <SpeechToTextSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('SpeechToText')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <SpeechToTextSwitch onCheckedChange={mockSetSpeechToText} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('SpeechToText');
    fireEvent.click(switchElement);

    expect(mockSetSpeechToText).toHaveBeenCalledWith(false);
  });
});
