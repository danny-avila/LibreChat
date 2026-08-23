import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThinkingButton } from '../Thinking';

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: () => 'text-base',
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: ({ className }: { className?: string }) => (
    <button type="button" data-testid="copy-thoughts" className={className} />
  ),
}));

describe('ThinkingButton', () => {
  const props = {
    onClick: jest.fn(),
    label: 'Thoughts',
    content: 'A useful thought',
    contentId: 'thoughts-content',
  };

  it('keeps the expanded copy control out of the header layout flow', () => {
    const { rerender } = render(<ThinkingButton {...props} isExpanded={false} />);

    const toggle = screen.getByRole('button', { name: 'Thoughts' });
    expect(toggle.parentElement).toHaveClass('relative');
    expect(screen.queryByTestId('copy-thoughts')).not.toBeInTheDocument();

    rerender(<ThinkingButton {...props} isExpanded />);

    expect(screen.getByTestId('copy-thoughts')).toHaveClass(
      'absolute',
      'right-0',
      'top-1/2',
      '-translate-y-1/2',
    );
  });
});
