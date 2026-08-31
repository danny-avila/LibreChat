import React, { Profiler } from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

import QuoteButton from '../QuoteButton';

const CONVO_ID = 'convo-1';
const SELECTED_TEXT = 'Selected assistant text';

const rect = ({
  top,
  bottom,
  left,
  right,
}: {
  top: number;
  bottom: number;
  left: number;
  right: number;
}): DOMRect =>
  ({
    top,
    bottom,
    left,
    right,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  }) as DOMRect;

describe('QuoteButton', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('positions a new selection without scheduling a layout-state render', () => {
    const rangeRect = rect({ top: 100, bottom: 120, left: 200, right: 260 });
    const buttonRect = rect({ top: 0, bottom: 30, left: 0, right: 100 });
    const originalRangeRect = Range.prototype.getBoundingClientRect;
    const elementRect = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this instanceof HTMLButtonElement
          ? buttonRect
          : rect({ top: 0, bottom: 0, left: 0, right: 0 });
      });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rangeRect,
    });

    try {
      const onRender = jest.fn();
      render(
        <RecoilRoot>
          <div className="message-render">{SELECTED_TEXT}</div>
          <Profiler id="quote-button" onRender={onRender}>
            <QuoteButton conversationId={CONVO_ID} />
          </Profiler>
        </RecoilRoot>,
      );

      onRender.mockClear();
      const textNode = screen.getByText(SELECTED_TEXT).firstChild;
      if (!textNode) {
        throw new Error('Selection text node was not rendered');
      }
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, SELECTED_TEXT.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);

      fireEvent.mouseUp(document);

      expect(screen.getByTestId('add-to-chat-button')).toHaveStyle({
        top: '62px',
        left: '180px',
        visibility: 'visible',
      });
      expect(onRender).toHaveBeenCalledTimes(1);
    } finally {
      elementRect.mockRestore();
      if (originalRangeRect) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
          configurable: true,
          value: originalRangeRect,
        });
      } else {
        delete (Range.prototype as Partial<Range>).getBoundingClientRect;
      }
    }
  });
});
