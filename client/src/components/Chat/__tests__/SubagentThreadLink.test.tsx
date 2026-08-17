import React from 'react';
import { render, screen } from '@testing-library/react';
import SubagentThreadLink from '../SubagentThreadLink';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    key === 'com_ui_subagent_back_to_parent' ? 'Back to parent chat' : 'Open child chat',
}));

jest.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="left-icon" />,
  ChevronRight: () => <span data-testid="right-icon" />,
}));

describe('SubagentThreadLink', () => {
  it('links a child chat back to its parent conversation', () => {
    render(<SubagentThreadLink threadId="parent-thread" relation="parent" />);

    expect(screen.getByRole('link', { name: 'Back to parent chat' })).toHaveAttribute(
      'href',
      '/c/parent-thread',
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('links a parent tool result to the host-issued child conversation', () => {
    render(<SubagentThreadLink threadId="child/thread" relation="child" />);

    expect(screen.getByRole('link', { name: 'Open child chat' })).toHaveAttribute(
      'href',
      '/c/child%2Fthread',
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('does not render an empty thread selector', () => {
    const { container } = render(<SubagentThreadLink threadId="   " relation="child" />);
    expect(container).toBeEmptyDOMElement();
  });
});
