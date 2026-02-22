import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from 'test/layout-test-utils';
import AutomaticPlaybackSwitch from '../AutomaticPlaybackSwitch';
import { RecoilRoot } from 'recoil';

describe('AutomaticPlaybackSwitch', () => {
  /**
   * Mock function to set the text-to-speech state.
   */
  let mockSetAutomaticPlayback: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetAutomaticPlayback = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutomaticPlaybackSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutomaticPlayback')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutomaticPlaybackSwitch onCheckedChange={mockSetAutomaticPlayback} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutomaticPlayback');
    fireEvent.click(switchElement);

    expect(mockSetAutomaticPlayback).toHaveBeenCalledWith(true);
  });
});
