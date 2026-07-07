/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
import useSideNavLinks from '../useSideNavLinks';

// Mock all heavy component imports so renderHook doesn't need a full DOM tree
jest.mock('~/components/SidePanel/MCPBuilder/MCPBuilderPanel', () => () => null);
jest.mock('~/components/SidePanel/Agents/AgentPanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Builder/PanelSwitch', () => () => null);
jest.mock('~/components/SidePanel/Parameters/Panel', () => () => null);
jest.mock('~/components/SidePanel/Memories', () => ({ MemoryPanel: () => null }));
jest.mock('~/components/SidePanel/Files/Panel', () => () => null);
jest.mock('~/components/Prompts', () => ({ PromptsAccordion: () => null }));
jest.mock('~/components/Skills', () => ({ SkillsAccordion: () => null }));

// Icons — return plain objects so lucide-react doesn't complain
jest.mock('@librechat/client', () => ({
  MCPIcon: () => null,
  AttachmentIcon: () => null,
  OpenAIMinimalIcon: () => null,
}));
jest.mock('lucide-react', () => ({
  Bot: () => null,
  Brain: () => null,
  NotebookPen: () => null,
  ScrollText: () => null,
  ArrowRightToLine: () => null,
  SlidersHorizontal: () => null,
}));

// Track which permissionType+permission pairs were queried so we can return
// true/false selectively.
const mockUseHasAccess = jest.fn();

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', role: 'USER' } }),
  useHasAccess: (args: { permissionType: string; permission: string }) => mockUseHasAccess(args),
  useGetAgentsConfig: () => ({ agentsConfig: null }),
  useAgentCapabilities: () => ({ skillsEnabled: false }),
  useMCPServerManager: () => ({ availableMCPServers: [] }),
}));

const defaultProps = {
  keyProvided: false,
  endpoint: EModelEndpoint.openAI as EModelEndpoint,
  endpointType: undefined,
  interfaceConfig: {} as Partial<TInterfaceConfig>,
  endpointsConfig: {} as TEndpointsConfig,
  includeHidePanel: false,
};

describe('useSideNavLinks — memories link gating', () => {
  beforeEach(() => {
    // Default: deny everything unless overridden in a specific test
    mockUseHasAccess.mockReturnValue(false);
  });

  it('does NOT include memories link for a non-admin user WITHOUT memory permissions', () => {
    const { result } = renderHook(() => useSideNavLinks(defaultProps));
    expect(result.current.some((l) => l.id === 'memories')).toBe(false);
  });

  it('includes memories link for a non-admin (USER role) user WITH MEMORIES USE+READ permissions', () => {
    // Grant USE and READ for MEMORIES; deny everything else
    mockUseHasAccess.mockImplementation(
      ({ permissionType, permission }: { permissionType: string; permission: string }) => {
        if (permissionType === 'MEMORIES') {
          return permission === 'USE' || permission === 'READ';
        }
        return false;
      },
    );

    const { result } = renderHook(() => useSideNavLinks(defaultProps));
    expect(result.current.some((l) => l.id === 'memories')).toBe(true);
  });
});
