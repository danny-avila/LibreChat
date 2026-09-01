import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageContext } from '~/Providers';
import Reasoning from '../Reasoning';

type ContextOverrides = {
  isSubmitting?: boolean;
  isLatestMessage?: boolean;
};

function renderReasoning(
  { isSubmitting = true, isLatestMessage = true }: ContextOverrides = {},
  isLast = true,
) {
  return render(
    <MessageContext.Provider
      value={{ messageId: 'msg-1', isExpanded: false, isSubmitting, isLatestMessage }}
    >
      <Reasoning reasoning="<think>weighing the options</think>" isLast={isLast} />
    </MessageContext.Provider>,
  );
}

describe('Reasoning label shimmer', () => {
  it('shimmers the label while the reasoning is still being generated', () => {
    renderReasoning();
    expect(screen.getByText('Thinking...')).toHaveClass('shimmer');
  });

  /** The sweep has to ride the label row itself rather than a span nested inside
   *  it. That row is a flex item, so `.shimmer`'s `inline-block` is blockified
   *  away; nested, it is an inline-block whose `truncate` moves its baseline to
   *  its bottom margin edge, which grew the line box 18px -> 23px and lifted the
   *  label 2px off the lightbulb's axis for the whole of a generation. */
  it('keeps the sweep on the label row instead of a nested span', () => {
    renderReasoning();
    const label = screen.getByText('Thinking...');

    expect(label).toHaveClass('truncate');
    expect(label.querySelector('.shimmer')).toBeNull();
  });

  it('leaves settled thoughts unanimated', () => {
    renderReasoning({ isSubmitting: false });
    expect(screen.getByText('Thoughts')).not.toHaveClass('shimmer');
  });

  it('leaves an older row unanimated while a newer one streams', () => {
    renderReasoning({ isLatestMessage: false });
    expect(screen.getByText('Thoughts')).not.toHaveClass('shimmer');
  });

  it('leaves reasoning that has been overtaken by later content unanimated', () => {
    renderReasoning({}, false);
    expect(screen.getByText('Thoughts')).not.toHaveClass('shimmer');
  });
});
