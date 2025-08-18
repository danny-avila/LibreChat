import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import { Panel } from '~/common/types';
import VersionContent from '../VersionContent';
import VersionPanel from '../VersionPanel';

const mockAgentData = {
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
};

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(() => ({
    data: mockAgentData,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })),
  useRevertAgentVersionMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isLoading: false,
  })),
}));

jest.mock('../VersionContent', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="version-content" />),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn().mockImplementation(() => (key) => key),
  useToast: jest.fn(() => ({ showToast: jest.fn() })),
}));

// Mock the AgentPanelContext
jest.mock('~/Providers/AgentPanelContext', () => ({
  ...jest.requireActual('~/Providers/AgentPanelContext'),
  useAgentPanelContext: jest.fn(),
}));

describe('VersionPanel', () => {
  const mockSetActivePanel = jest.fn();
  const mockUseAgentPanelContext = jest.requireMock(
    '~/Providers/AgentPanelContext',
  ).useAgentPanelContext;

  const mockUseGetAgentByIdQuery = jest.requireMock('~/data-provider').useGetAgentByIdQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetAgentByIdQuery.mockReturnValue({
      data: mockAgentData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    // Set up the default context mock
    mockUseAgentPanelContext.mockReturnValue({
      setActivePanel: mockSetActivePanel,
      agent_id: 'agent-123',
      activePanel: Panel.version,
    });
  });

  test('renders panel UI and handles navigation', () => {
    render(<VersionPanel />);
    expect(screen.getByText('com_ui_agent_version_history')).toBeInTheDocument();
    expect(screen.getByTestId('version-content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(mockSetActivePanel).toHaveBeenCalledWith(Panel.builder);
  });

  test('VersionContent receives correct props', () => {
    render(<VersionPanel />);
    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAgentId: 'agent-123',
        isLoading: false,
        error: null,
        versionContext: expect.objectContaining({
          currentAgent: expect.any(Object),
          versions: expect.any(Array),
          versionIds: expect.any(Array),
        }),
      }),
      expect.anything(),
    );
  });

  test('handles data state variations', () => {
    // Test with empty agent_id
    mockUseAgentPanelContext.mockReturnValueOnce({
      setActivePanel: mockSetActivePanel,
      agent_id: '',
      activePanel: Panel.version,
    });
    render(<VersionPanel />);
    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({ selectedAgentId: '' }),
      expect.anything(),
    );

    // Test with null data
    mockUseGetAgentByIdQuery.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseAgentPanelContext.mockReturnValueOnce({
      setActivePanel: mockSetActivePanel,
      agent_id: 'agent-123',
      activePanel: Panel.version,
    });
    render(<VersionPanel />);
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

    // 3. versions is undefined
    mockUseGetAgentByIdQuery.mockReturnValueOnce({
      data: { ...mockAgentData, versions: undefined },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    render(<VersionPanel />);
    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({
        versionContext: expect.objectContaining({ versions: [] }),
      }),
      expect.anything(),
    );

    // 4. loading state
    mockUseGetAgentByIdQuery.mockReturnValueOnce({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });
    render(<VersionPanel />);
    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true }),
      expect.anything(),
    );

    // 5. error state
    const testError = new Error('Test error');
    mockUseGetAgentByIdQuery.mockReturnValueOnce({
      data: null,
      isLoading: false,
      error: testError,
      refetch: jest.fn(),
    });
    render(<VersionPanel />);
    expect(VersionContent).toHaveBeenCalledWith(
      expect.objectContaining({ error: testError }),
      expect.anything(),
    );
  });

  test('memoizes agent data correctly', () => {
    mockUseGetAgentByIdQuery.mockReturnValueOnce({
      data: mockAgentData,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<VersionPanel />);
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
