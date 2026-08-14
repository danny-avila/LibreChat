import { render, screen } from '@testing-library/react';

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { maximizeChatSpace: 'maximizeChatSpace' },
}));

import ScrollToBottom from '../ScrollToBottom';

const renderButton = (overlayHeight?: number) =>
  render(<ScrollToBottom scrollHandler={jest.fn()} overlayHeight={overlayHeight} />);

const container = () => screen.getByLabelText('com_ui_scroll_to_bottom').parentElement;

describe('ScrollToBottom', () => {
  it('rests just above the composer when nothing is queued', () => {
    renderButton();

    expect(container()).toHaveStyle({ bottom: 'calc(1.25rem + 0px)' });
  });

  it('lifts clear of the in-flight steer overlay', () => {
    renderButton(96);

    expect(container()).toHaveStyle({ bottom: 'calc(1.25rem + 96px)' });
  });

  it('stays inside the message column on mobile', () => {
    renderButton();

    /** Without a mobile gutter the button escapes to the viewport edge while
     *  the steer bubbles inset, so the two visibly disagree. */
    expect(container()).toHaveClass('px-4', 'md:px-0');
  });

  it('keeps the desktop width constraint', () => {
    renderButton();

    expect(container()).toHaveClass('md:max-w-3xl', 'xl:max-w-4xl');
  });
});
