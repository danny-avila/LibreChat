import React from 'react';
import { render, fireEvent } from 'test/layout-test-utils';
import '@testing-library/jest-dom/extend-expect';
import { AutoScrollSwitch } from './General';
import { RecoilRoot } from 'recoil';

describe('AutoScrollSwitch', () => {
  let mockSetAutoScroll;

  beforeEach(() => {
    mockSetAutoScroll = jest.fn();
  });

  it('renders correctly', () => {
    const { getByText, getByTestId } = render(
      <RecoilRoot>
        <AutoScrollSwitch onCheckedChange={undefined} />
      </RecoilRoot>,
    );

    expect(getByText('Auto scroll')).toBeInTheDocument();
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
