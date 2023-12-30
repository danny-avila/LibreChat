import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from 'test/layout-test-utils';
import AutoScrollSwitch from './AutoScrollSwitch';
import { RecoilRoot } from 'recoil';

describe('AutoScrollSwitch', () => {
  /**
   * Mock function to set the auto-scroll state.
   */
  let mockSetAutoScroll: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetAutoScroll = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoScrollSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('autoScroll')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoScrollSwitch onCheckedChange={mockSetAutoScroll} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('autoScroll');
    fireEvent.click(switchElement);

    expect(mockSetAutoScroll).toHaveBeenCalledWith(true);
  });
});
