import { render, fireEvent } from 'test/layout-test-utils';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import React from 'react';
import TextToSpeechSwitch from '../TextToSpeechSwitch';

describe('TextToSpeechSwitch', () => {
  /**
   * Mock function to set the text-to-speech state.
   */
  let mockSetTextToSpeech: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetTextToSpeech = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <TextToSpeechSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('TextToSpeech')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <TextToSpeechSwitch onCheckedChange={mockSetTextToSpeech} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('TextToSpeech');
    fireEvent.click(switchElement);

    expect(mockSetTextToSpeech).toHaveBeenCalledWith(false);
  });
});
