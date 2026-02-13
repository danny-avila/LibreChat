import React from 'react';
import { render } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentCapabilities, ArtifactModes, Tools } from 'librechat-data-provider';

const mockSetEphemeralAgent = jest.fn();
const mockGetTimestampedValue = jest.fn();
const mockSetTimestamp = jest.fn();

jest.mock('recoil', () => {
  const actual = jest.requireActual('recoil');
  return {
    ...actual,
    useSetRecoilState: () => mockSetEphemeralAgent,
  };
});

jest.mock('~/utils/timestamps', () => ({
  getTimestampedValue: (...args) => mockGetTimestampedValue(...args),
  setTimestamp: (...args) => mockSetTimestamp(...args),
}));

const mockAgentsConfig = {
  agentsConfig: null,
};

jest.mock('~/hooks', () => ({
  useGetAgentsConfig: () => mockAgentsConfig,
  useToolToggle: () => ({
    toggleState: false,
    handleToggle: jest.fn(),
    isAuthenticated: true,
    isAuthLoading: false,
    isPinned: false,
    handlePinToggle: jest.fn(),
  }),
  useCodeApiKeyForm: () => ({
    isDialogOpen: false,
    setIsDialogOpen: jest.fn(),
    apiKey: '',
    setApiKey: jest.fn(),
  }),
  useSearchApiKeyForm: () => ({
    isDialogOpen: false,
    setIsDialogOpen: jest.fn(),
    apiKey: '',
    setApiKey: jest.fn(),
  }),
  useMCPServerManager: () => ({
    availableTools: [],
    selectedTools: [],
    handleToggleTool: jest.fn(),
  }),
}));

jest.mock('~/store', () => ({
  ephemeralAgentByConvoId: () => null,
}));

import BadgeRowProvider from '../BadgeRowContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>{children}</RecoilRoot>
    </QueryClientProvider>
  );
}

function renderProvider(conversationId?: string | null) {
  return render(
    <BadgeRowProvider conversationId={conversationId}>
      <div data-testid="child">child</div>
    </BadgeRowProvider>,
    { wrapper: Wrapper },
  );
}

describe('BadgeRowProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTimestampedValue.mockReturnValue(null);
    mockAgentsConfig.agentsConfig = null;
  });

  it('renders children', () => {
    const { getByTestId } = renderProvider();
    expect(getByTestId('child')).toBeInTheDocument();
  });

  describe('artifacts default initialization', () => {
    it('defaults artifacts to false when no localStorage value and no artifacts capability', () => {
      mockAgentsConfig.agentsConfig = { capabilities: [] };
      mockGetTimestampedValue.mockReturnValue(null);

      renderProvider('test-convo-1');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[AgentCapabilities.artifacts]).toBe(false);
    });

    it('defaults artifacts to ArtifactModes.DEFAULT when artifacts capability is present', () => {
      mockAgentsConfig.agentsConfig = {
        capabilities: [AgentCapabilities.artifacts],
      };
      mockGetTimestampedValue.mockReturnValue(null);

      renderProvider('test-convo-2');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[AgentCapabilities.artifacts]).toBe(ArtifactModes.DEFAULT);
    });

    it('respects localStorage false value even when artifacts capability is present', () => {
      mockAgentsConfig.agentsConfig = {
        capabilities: [AgentCapabilities.artifacts],
      };
      mockGetTimestampedValue.mockImplementation((key: string) => {
        if (key.includes('ARTIFACTS')) {
          return JSON.stringify(false);
        }
        return null;
      });

      renderProvider('test-convo-3');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[AgentCapabilities.artifacts]).toBe(false);
    });

    it('respects localStorage saved "default" value', () => {
      mockAgentsConfig.agentsConfig = { capabilities: [] };
      mockGetTimestampedValue.mockImplementation((key: string) => {
        if (key.includes('ARTIFACTS')) {
          return JSON.stringify(ArtifactModes.DEFAULT);
        }
        return null;
      });

      renderProvider('test-convo-4');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[AgentCapabilities.artifacts]).toBe(ArtifactModes.DEFAULT);
    });

    it('defaults artifacts to false when agentsConfig is null', () => {
      mockAgentsConfig.agentsConfig = null;
      mockGetTimestampedValue.mockReturnValue(null);

      renderProvider('test-convo-5');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[AgentCapabilities.artifacts]).toBe(false);
    });
  });

  describe('other tool defaults', () => {
    it('defaults all tools to false when no localStorage values', () => {
      mockAgentsConfig.agentsConfig = { capabilities: [] };
      mockGetTimestampedValue.mockReturnValue(null);

      renderProvider('test-convo-6');

      expect(mockSetEphemeralAgent).toHaveBeenCalled();
      const updater = mockSetEphemeralAgent.mock.calls[0][0];
      const result = typeof updater === 'function' ? updater(null) : updater;

      expect(result[Tools.execute_code]).toBe(false);
      expect(result[Tools.web_search]).toBe(false);
      expect(result[Tools.file_search]).toBe(false);
    });
  });
});
