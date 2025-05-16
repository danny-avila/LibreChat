import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import VersionContent from '../VersionContent';
import { VersionContext } from '../VersionPanel';

jest.mock('../VersionItem', () => {
  return {
    __esModule: true,
    default: jest.fn(() => <div data-testid="version-item" />),
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key) => {
    const translations = {
      com_ui_agent_version_no_agent: 'No agent selected',
      com_ui_agent_version_error: 'Error loading versions',
      com_ui_agent_version_empty: 'No versions available',
    };
    return translations[key] || key;
  }),
}));

jest.mock('~/components/svg', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

describe('VersionContent', () => {
  const mockVersionIds = [
    { id: 0, version: { name: 'First' }, isActive: true, originalIndex: 2 },
    { id: 1, version: { name: 'Second' }, isActive: false, originalIndex: 1 },
    { id: 2, version: { name: 'Third' }, isActive: false, originalIndex: 0 },
  ];

  const mockContext: VersionContext = {
    versions: [{ name: 'First' }, { name: 'Second' }, { name: 'Third' }],
    versionIds: mockVersionIds,
    currentAgent: { name: 'Test Agent', description: null, instructions: null },
    selectedAgentId: 'agent-123',
    activeVersion: { name: 'First' },
  };

  const defaultProps = {
    selectedAgentId: 'agent-123',
    isLoading: false,
    error: null,
    versionContext: mockContext,
    onRestore: jest.fn(),
  };

  test('renders loading spinner when isLoading is true', () => {
    render(<VersionContent {...defaultProps} isLoading={true} />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  test('renders error message when error is present', () => {
    render(<VersionContent {...defaultProps} error={new Error('Test error')} />);

    expect(screen.getByText('Error loading versions')).toBeInTheDocument();
  });

  test('renders no agent selected message when selectedAgentId is empty', () => {
    render(<VersionContent {...defaultProps} selectedAgentId="" />);

    expect(screen.getByText('No agent selected')).toBeInTheDocument();
  });

  test('renders empty state when no versions are available', () => {
    const emptyContext = {
      ...mockContext,
      versions: [],
      versionIds: [],
    };

    render(<VersionContent {...defaultProps} versionContext={emptyContext} />);

    expect(screen.getByText('No versions available')).toBeInTheDocument();
  });

  test('renders version items when versions are available', () => {
    render(<VersionContent {...defaultProps} />);

    const versionItems = screen.getAllByTestId('version-item');
    expect(versionItems).toHaveLength(3);
  });

  describe('edge cases', () => {
    test('handles when versionContext has empty versions array but has versionIds', () => {
      const incompleteContext = {
        ...mockContext,
        versions: [],
      };

      render(<VersionContent {...defaultProps} versionContext={incompleteContext} />);

      expect(screen.getAllByTestId('version-item')).toHaveLength(mockVersionIds.length);
    });

    test('handles when versionContext has empty versionIds array', () => {
      const incompleteContext = {
        ...mockContext,
        versionIds: [],
      };

      render(<VersionContent {...defaultProps} versionContext={incompleteContext} />);

      expect(screen.getByText('No versions available')).toBeInTheDocument();
    });

    test('handles error with specific error message', () => {
      const specificError = new Error('Something went wrong');
      render(<VersionContent {...defaultProps} error={specificError} />);

      expect(screen.getByText('Error loading versions')).toBeInTheDocument();
    });

    test('prioritizes loading state over error state', () => {
      render(<VersionContent {...defaultProps} isLoading={true} error={new Error('Test')} />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByText('Error loading versions')).not.toBeInTheDocument();
    });

    test('prioritizes empty selectedAgentId over other states', () => {
      render(
        <VersionContent
          {...defaultProps}
          selectedAgentId=""
          isLoading={true}
          error={new Error('Test')}
        />,
      );

      expect(screen.getByText('No agent selected')).toBeInTheDocument();
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      expect(screen.queryByText('Error loading versions')).not.toBeInTheDocument();
    });
  });
});
