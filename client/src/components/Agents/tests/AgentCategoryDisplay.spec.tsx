import React from 'react';
import { render, screen } from '@testing-library/react';
import AgentCategoryDisplay from '../AgentCategoryDisplay';

// Mock the useAgentCategories hook
jest.mock('~/hooks/Agents', () => ({
  useAgentCategories: () => ({
    categories: [
      {
        value: 'general',
        label: 'General',
        icon: <span data-testid="icon-general">{''}</span>,
        className: 'w-full',
      },
      {
        value: 'hr',
        label: 'HR',
        icon: <span data-testid="icon-hr">{''}</span>,
        className: 'w-full',
      },
      {
        value: 'rd',
        label: 'R&D',
        icon: <span data-testid="icon-rd">{''}</span>,
        className: 'w-full',
      },
      {
        value: 'finance',
        label: 'Finance',
        icon: <span data-testid="icon-finance">{''}</span>,
        className: 'w-full',
      },
    ],
    emptyCategory: {
      value: '',
      label: 'General',
      className: 'w-full',
    },
  }),
}));

describe('AgentCategoryDisplay', () => {
  it('should display the proper label for a category', () => {
    render(<AgentCategoryDisplay category="rd" />);
    expect(screen.getByText('R&D')).toBeInTheDocument();
  });

  it('should display the icon when showIcon is true', () => {
    render(<AgentCategoryDisplay category="finance" showIcon={true} />);
    expect(screen.getByTestId('icon-finance')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('should not display the icon when showIcon is false', () => {
    render(<AgentCategoryDisplay category="hr" showIcon={false} />);
    expect(screen.queryByTestId('icon-hr')).not.toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
  });

  it('should apply custom classnames', () => {
    render(<AgentCategoryDisplay category="general" className="test-class" />);
    expect(screen.getByText('General').parentElement).toHaveClass('test-class');
  });

  it('should not render anything for unknown categories', () => {
    const { container } = render(<AgentCategoryDisplay category="unknown" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should not render anything when no category is provided', () => {
    const { container } = render(<AgentCategoryDisplay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should not render anything for empty category when showEmptyFallback is false', () => {
    const { container } = render(<AgentCategoryDisplay category="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render empty category placeholder when showEmptyFallback is true', () => {
    render(<AgentCategoryDisplay category="" showEmptyFallback={true} />);
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('should apply custom iconClassName to the icon', () => {
    render(<AgentCategoryDisplay category="general" iconClassName="custom-icon-class" />);
    const iconElement = screen.getByTestId('icon-general').parentElement;
    expect(iconElement).toHaveClass('custom-icon-class');
  });
});
