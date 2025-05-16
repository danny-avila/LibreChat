import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import VersionPanel from '../VersionPanel';
import VersionContent from '../VersionContent';
import { Panel } from '~/common/types';

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(() => ({
    data: {
      name: 'Test Agent',
      description: 'Test Description',
      instructions: 'Test Instructions',
      tools: ['tool1', 'tool2'],
      capabilities: ['capability1', 'capability2'],
      versions: [
        {
          name: 'Version 1',
          description: 'Description 1',
          instructions: 'Instructions 1',
          tools: ['tool1'],
          capabilities: ['capability1'],
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
        },
        {
          name: 'Version 2',
          description: 'Description 2',
          instructions: 'Instructions 2',
          tools: ['tool1', 'tool2'],
          capabilities: ['capability1', 'capability2'],
          createdAt: '2023-01-02T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })),
  useRevertAgentVersionMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isLoading: false,
  })),
}));

jest.mock('../VersionContent', () => {
  return {
    __esModule: true,
    default: jest.fn(() => <div data-testid="version-content" />),
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key) => key),
  useToast: jest.fn(() => ({
    showToast: jest.fn(),
  })),
}));


describe('VersionPanel', () => {
  const mockSetActivePanel = jest.fn();

  const defaultProps = {
    agentsConfig: null,
    setActivePanel: mockSetActivePanel,
    selectedAgentId: 'agent-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders version panel with version history header', () => {
    render(<VersionPanel {...defaultProps} />);

    expect(screen.getByText('com_ui_agent_version_history')).toBeInTheDocument();
    expect(screen.getByTestId('version-content')).toBeInTheDocument();
  });

  test('calls setActivePanel when back button is clicked', () => {
    render(<VersionPanel {...defaultProps} />);

    const backButton = screen.getByRole('button');
    fireEvent.click(backButton);

    expect(mockSetActivePanel).toHaveBeenCalledWith(Panel.builder);
  });

  test('passes correct props to VersionContent', () => {
    render(<VersionPanel {...defaultProps} />);

    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAgentId: 'agent-123',
        isLoading: false,
        error: null,
        versionContext: expect.any(Object),
      }),
      expect.anything(),
    );
  });

  test('handles empty selectedAgentId', () => {
    render(<VersionPanel {...defaultProps} selectedAgentId="" />);

    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAgentId: '',
      }),
      expect.anything(),
    );
  });

  describe('edge cases', () => {
    const mockUseGetAgentByIdQuery = jest.requireMock('~/data-provider').useGetAgentByIdQuery;
    
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('handles when agent data is null', () => {
      mockUseGetAgentByIdQuery.mockReturnValueOnce({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<VersionPanel {...defaultProps} />);

      expect(VersionContent).toHaveBeenCalledWith(
        expect.objectContaining({
          versionContext: expect.objectContaining({
            versions: [],
            versionIds: [],
            currentAgent: null,
          }),
        }),
        expect.anything(),
      );
    });

    test('handles when agent has no versions array', () => {
      mockUseGetAgentByIdQuery.mockReturnValueOnce({
        data: {
          name: 'Test Agent',
          description: 'Test Description',
          instructions: 'Test Instructions',
          // No versions array
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<VersionPanel {...defaultProps} />);

      expect(VersionContent).toHaveBeenCalledWith(
        expect.objectContaining({
          versionContext: expect.objectContaining({
            versions: [],
          }),
        }),
        expect.anything(),
      );
    });

    test('handles loading state', () => {
      mockUseGetAgentByIdQuery.mockReturnValueOnce({
        data: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      render(<VersionPanel {...defaultProps} />);

      expect(VersionContent).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
        }),
        expect.anything(),
      );
    });

    test('handles error state', () => {
      const testError = new Error('Test error');
      mockUseGetAgentByIdQuery.mockReturnValueOnce({
        data: null,
        isLoading: false,
        error: testError,
        refetch: jest.fn(),
      });

      render(<VersionPanel {...defaultProps} />);

      expect(VersionContent).toHaveBeenCalledWith(
        expect.objectContaining({
          error: testError,
        }),
        expect.anything(),
      );
    });

    test('properly memoizes currentAgent and versions', () => {
      mockUseGetAgentByIdQuery.mockReturnValueOnce({
        data: {
          name: 'Test Agent',
          description: 'Test Description',
          instructions: 'Test Instructions',
          tools: ['tool1', 'tool2'],
          capabilities: ['capability1', 'capability2'],
          versions: [
            { name: 'Version 1', updatedAt: '2023-01-01T00:00:00Z' },
            { name: 'Version 2', updatedAt: '2023-01-02T00:00:00Z' },
          ],
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<VersionPanel {...defaultProps} />);

      expect(VersionContent).toHaveBeenCalledWith(
        expect.objectContaining({
          versionContext: expect.objectContaining({
            currentAgent: expect.objectContaining({
              name: 'Test Agent',
              description: 'Test Description',
              instructions: 'Test Instructions',
            }),
            versions: expect.arrayContaining([
              expect.objectContaining({ name: 'Version 2' }),
              expect.objectContaining({ name: 'Version 1' }),
            ]),
          }),
        }),
        expect.anything(),
      );
    });
  });
});
