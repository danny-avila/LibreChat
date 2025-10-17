import { render, fireEvent } from 'test/layout-test-utils';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import React from 'react';
import AutoTranscribeAudioSwitch from '../AutoTranscribeAudioSwitch';

describe('AutoTranscribeAudioSwitch', () => {
  /**
   * Mock function to set the auto-send-text state.
   */
  let mockSetAutoTranscribeAudio:
    | jest.Mock<void, [boolean]>
    | ((value: boolean) => void)
    | undefined;

  beforeEach(() => {
    mockSetAutoTranscribeAudio = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoTranscribeAudioSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutoTranscribeAudio')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoTranscribeAudioSwitch onCheckedChange={mockSetAutoTranscribeAudio} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutoTranscribeAudio');
    fireEvent.click(switchElement);

    expect(mockSetAutoTranscribeAudio).toHaveBeenCalledWith(true);
  });
});
