import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type t from 'librechat-data-provider';
import AgentAvatar from '../AgentAvatar';

jest.mock('lucide-react', () => ({
  Feather: ({ className, strokeWidth, ...props }: any) => (
    <svg
      data-testid="feather-icon"
      className={className}
      data-stroke-width={strokeWidth}
      {...props}
    >
      <title>{/* eslint-disable-line i18next/no-literal-string */}Feather Icon</title>
    </svg>
  ),
}));

jest.mock('@librechat/client', () => ({
  Skeleton: ({ className, ...props }: any) => (
    <div data-testid="skeleton" className={className} {...props} />
  ),
}));

describe('AgentAvatar', () => {
  it('should render image when avatar URL exists', () => {
    const agent = {
      id: '1',
      name: 'Test Agent',
      avatar: '/test-avatar.png',
    } as unknown as t.Agent;

    render(<AgentAvatar agent={agent} />);

    const img = screen.getByAltText('Test Agent avatar');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test-avatar.png');
    expect(img).toHaveClass('rounded-full', 'object-cover', 'shadow-lg');
  });

  it('should render Feather icon fallback when no avatar', () => {
    const agent = {
      id: '1',
      name: 'Test Agent',
    } as t.Agent;

    render(<AgentAvatar agent={agent} />);

    const featherIcon = screen.getByTestId('feather-icon');
    expect(featherIcon).toBeInTheDocument();
    expect(featherIcon).toHaveAttribute('data-stroke-width', '1.5');
  });

  it('should apply different size classes', () => {
    const agent = {
      id: '1',
      name: 'Test Agent',
      avatar: '/test-avatar.png',
    } as unknown as t.Agent;

    const { rerender } = render(<AgentAvatar agent={agent} size="sm" />);
    expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-12', 'w-12');

    rerender(<AgentAvatar agent={agent} size="lg" />);
    expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-20', 'w-20');

    rerender(<AgentAvatar agent={agent} size="xl" />);
    expect(screen.getByAltText('Test Agent avatar')).toHaveClass('h-24', 'w-24');
  });

  it('should apply custom className', () => {
    const agent = {
      id: '1',
      name: 'Test Agent',
      avatar: '/test-avatar.png',
    } as unknown as t.Agent;

    render(<AgentAvatar agent={agent} className="custom-class" />);

    const container = screen.getByAltText('Test Agent avatar').parentElement;
    expect(container).toHaveClass('custom-class');
  });

  it('should handle showBorder option', () => {
    const agent = {
      id: '1',
      name: 'Test Agent',
      avatar: '/test-avatar.png',
    } as unknown as t.Agent;

    const { rerender } = render(<AgentAvatar agent={agent} showBorder={true} />);
    expect(screen.getByAltText('Test Agent avatar')).toHaveClass('border-1');

    rerender(<AgentAvatar agent={agent} showBorder={false} />);
    expect(screen.getByAltText('Test Agent avatar')).not.toHaveClass('border-1');
  });
});
