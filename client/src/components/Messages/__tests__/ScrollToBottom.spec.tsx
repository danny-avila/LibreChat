import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import ScrollToBottom from '../ScrollToBottom';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const renderButton = ({
  maximizeChatSpace = false,
  overlayHeight,
}: {
  maximizeChatSpace?: boolean;
  overlayHeight?: number;
} = {}) =>
  render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.maximizeChatSpace, maximizeChatSpace);
      }}
    >
      <ScrollToBottom scrollHandler={jest.fn()} overlayHeight={overlayHeight} />
    </RecoilRoot>,
  );

describe('ScrollToBottom', () => {
  it('sits in the same padded column as the composer', () => {
    const { container } = renderButton();
    const column = container.querySelector('.sm\\:px-2');

    expect(column).toHaveClass('px-4', 'md:max-w-3xl', 'xl:max-w-4xl');
    expect(container.firstChild).toHaveClass('scrollbar-gutter-stable');
  });

  it('rests just above the composer when nothing is queued', () => {
    const { container } = renderButton();

    expect(container.firstChild).toHaveStyle({ bottom: 'calc(1.25rem + 0px)' });
  });

  it('lifts clear of the in-flight steer overlay', () => {
    const { container } = renderButton({ overlayHeight: 96 });

    expect(container.firstChild).toHaveStyle({ bottom: 'calc(1.25rem + 96px)' });
  });

  it('names the control for assistive tech', () => {
    renderButton();

    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_bottom' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('uses the full conversation width when the preference is on', () => {
    const { container } = renderButton({ maximizeChatSpace: true });
    const column = container.querySelector('.sm\\:px-2');

    expect(column).toHaveClass('max-w-full');
    expect(column).not.toHaveClass('md:max-w-3xl');
  });
});
