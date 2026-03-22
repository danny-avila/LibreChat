/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';

const mockGetValues = jest.fn(() => '');
const mockSetValue = jest.fn();
const mockUseLocalize = jest.fn((key: string) => key);

jest.mock('~/hooks', () => ({
  useLocalize: () => mockUseLocalize,
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(() => ({
    getValues: mockGetValues,
    setValue: mockSetValue,
  })),
}));

jest.mock('~/data-provider', () => ({
  useOpenClawSkillsQuery: jest.fn(),
}));

jest.mock('~/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

import { useChatContext } from '~/Providers';
import { useOpenClawSkillsQuery } from '~/data-provider';
import OpenClawSkillsPanel from '../OpenClawSkillsPanel';

const mockUseChatContext = useChatContext as jest.Mock;
const mockUseSkills = useOpenClawSkillsQuery as jest.Mock;

function setup(endpoint: string, skills: { name: string; description: string }[] | null, isLoading = false) {
  mockUseChatContext.mockReturnValue({ conversation: { endpoint } });
  mockUseSkills.mockReturnValue({ data: skills, isLoading });
}

describe('OpenClawSkillsPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders null for non-openclaw endpoint', () => {
    setup('openAI', []);
    const { container } = render(<OpenClawSkillsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows spinner while loading', () => {
    setup(EModelEndpoint.openclaw, null, true);
    render(<OpenClawSkillsPanel />);
    expect(screen.getByTestId('spinner')).toBeDefined();
  });

  it('shows empty state when no skills', () => {
    setup(EModelEndpoint.openclaw, []);
    render(<OpenClawSkillsPanel />);
    expect(screen.getByText('com_openclaw_skills_empty')).toBeDefined();
  });

  it('renders skill names with / prefix', () => {
    setup(EModelEndpoint.openclaw, [
      { name: 'commit', description: 'Create a git commit' },
      { name: 'review', description: 'Review code' },
    ]);
    render(<OpenClawSkillsPanel />);
    expect(screen.getByText('/commit')).toBeDefined();
    expect(screen.getByText('/review')).toBeDefined();
  });

  it('renders skill descriptions', () => {
    setup(EModelEndpoint.openclaw, [
      { name: 'commit', description: 'Create a git commit' },
    ]);
    render(<OpenClawSkillsPanel />);
    expect(screen.getByText('Create a git commit')).toBeDefined();
  });

  it('inserts /skillName into text field on click', () => {
    setup(EModelEndpoint.openclaw, [
      { name: 'commit', description: 'Create a git commit' },
    ]);
    mockGetValues.mockReturnValue('');
    render(<OpenClawSkillsPanel />);
    const button = screen.getByText('/commit').closest('button') as HTMLButtonElement;
    fireEvent.click(button);
    expect(mockSetValue).toHaveBeenCalledWith('text', '/commit', { shouldValidate: true });
  });

  it('appends /skillName with space separator when text already present', () => {
    setup(EModelEndpoint.openclaw, [
      { name: 'review', description: 'Review' },
    ]);
    mockGetValues.mockReturnValue('some text');
    render(<OpenClawSkillsPanel />);
    const button = screen.getByText('/review').closest('button') as HTMLButtonElement;
    fireEvent.click(button);
    expect(mockSetValue).toHaveBeenCalledWith('text', 'some text /review', { shouldValidate: true });
  });
});
