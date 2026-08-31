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
