import { render, fireEvent } from 'test/layout-test-utils';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import React from 'react';
import CacheTTSSwitch from '../CacheTTSSwitch';

describe('CacheTTSSwitch', () => {
  /**
   * Mock function to set the cache-tts state.
   */
  let mockSetCacheTTS: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetCacheTTS = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <CacheTTSSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('CacheTTS')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <CacheTTSSwitch onCheckedChange={mockSetCacheTTS} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('CacheTTS');
    fireEvent.click(switchElement);

    expect(mockSetCacheTTS).toHaveBeenCalledWith(false);
  });
});
