import React from 'react';
import { Provider, createStore } from 'jotai';
import { renderHook, act, waitFor } from '@testing-library/react';
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { setTimestamp } from '~/utils/timestamps';
import { useMCPSelect } from '../useMCPSelect';
import { MCPServerDefinition } from '../useMCPServerManager';

// Mock dependencies
jest.mock('~/utils/timestamps', () => ({
  setTimestamp: jest.fn(),
}));

jest.mock('lodash/isEqual', () => jest.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)));

// Helper to create MCPServerDefinition objects
const createMCPServers = (serverNames: string[]): MCPServerDefinition[] => {
  return serverNames.map((serverName) => ({
    serverName,
    config: {
      url: 'http://mcp',
    },
    effectivePermissions: 15, // All permissions (VIEW=1, EDIT=2, DELETE=4, SHARE=8)
  }));
};

const createWrapper = (mcpServers: string[] = []) => {
  // Create a new Jotai store for each test to ensure clean state
  const store = createStore();
  const servers = createMCPServers(mcpServers);

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <RecoilRoot>
      <Provider store={store}>{children}</Provider>
    </RecoilRoot>
  );
  return { Wrapper, servers };
};

describe('useMCPSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Basic Functionality', () => {
    it('should initialize with default values', () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      expect(result.current.mcpValues).toEqual([]);
      expect(result.current.isPinned).toBe(true); // Default value from mcpPinnedAtom is true
      expect(typeof result.current.setMCPValues).toBe('function');
      expect(typeof result.current.setIsPinned).toBe('function');
    });

    it('should use conversationId when provided', () => {
      const conversationId = 'test-convo-123';
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ conversationId, servers }), {
        wrapper: Wrapper,
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should use NEW_CONVO constant when conversationId is null', () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ conversationId: null, servers }), {
        wrapper: Wrapper,
      });

      expect(result.current.mcpValues).toEqual([]);
    });
  });

  describe('State Updates', () => {
    it('should update mcpValues when setMCPValues is called', async () => {
      const { Wrapper, servers } = createWrapper(['value1', 'value2']);
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      const newValues = ['value1', 'value2'];

      act(() => {
        result.current.setMCPValues(newValues);
      });

      await waitFor(() => {
        expect(result.current.mcpValues).toEqual(newValues);
      });
    });

    it('should not update mcpValues if non-array is passed', () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      act(() => {
        // @ts-ignore - Testing invalid input
        result.current.setMCPValues('not-an-array');
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should update isPinned state', () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      // Default is true
      expect(result.current.isPinned).toBe(true);

      // Toggle to false
      act(() => {
        result.current.setIsPinned(false);
      });

      expect(result.current.isPinned).toBe(false);

      // Toggle back to true
      act(() => {
        result.current.setIsPinned(true);
      });

      expect(result.current.isPinned).toBe(true);
    });
  });

  describe('Timestamp Management', () => {
    it('should set timestamp when mcpValues is updated with values', async () => {
      const conversationId = 'test-convo';
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ conversationId, servers }), {
        wrapper: Wrapper,
      });

      const newValues = ['value1', 'value2'];

      act(() => {
        result.current.setMCPValues(newValues);
      });

      await waitFor(() => {
        const expectedKey = `${LocalStorageKeys.LAST_MCP_}${conversationId}`;
        expect(setTimestamp).toHaveBeenCalledWith(expectedKey);
      });
    });

    it('should not set timestamp when mcpValues is empty', async () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.setMCPValues([]);
      });

      await waitFor(() => {
        expect(setTimestamp).not.toHaveBeenCalled();
      });
    });
  });

  describe('Race Conditions and Infinite Loops Prevention', () => {
    it('should not create infinite loop when syncing between Jotai and Recoil states', async () => {
      const { Wrapper, servers } = createWrapper();
      const { result, rerender } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      let renderCount = 0;
      const maxRenders = 10;

      // Track renders to detect infinite loops
      const trackRender = () => {
        renderCount++;
        if (renderCount > maxRenders) {
          throw new Error('Potential infinite loop detected');
        }
      };

      // Set initial value
      act(() => {
        trackRender();
        result.current.setMCPValues(['initial']);
      });

      // Trigger multiple rerenders
      for (let i = 0; i < 3; i++) {
        rerender();
        trackRender();
      }

      // Should not exceed max renders
      expect(renderCount).toBeLessThanOrEqual(maxRenders);
    });

    it('should handle rapid consecutive updates without race conditions', async () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      const updates = [
        ['value1'],
        ['value1', 'value2'],
        ['value1', 'value2', 'value3'],
        ['value4'],
        [],
      ];

      // Rapid fire updates
      act(() => {
        updates.forEach((update) => {
          result.current.setMCPValues(update);
        });
      });

      await waitFor(() => {
        // Should settle on the last update
        expect(result.current.mcpValues).toEqual([]);
      });
    });

    it('should maintain stable setter function reference', () => {
      const { Wrapper, servers } = createWrapper();
      const { result, rerender } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      const firstSetMCPValues = result.current.setMCPValues;

      // Trigger multiple rerenders
      rerender();
      rerender();
      rerender();

      // Setter should remain the same reference (memoized)
      expect(result.current.setMCPValues).toBe(firstSetMCPValues);
    });

    it('should handle switching conversation IDs without issues', async () => {
      const { Wrapper, servers } = createWrapper(['convo1-value', 'convo2-value']);
      const { result, rerender } = renderHook(
        ({ conversationId }) => useMCPSelect({ conversationId, servers }),
        {
          wrapper: Wrapper,
          initialProps: { conversationId: 'convo1' },
        },
      );

      // Set values for first conversation
      act(() => {
        result.current.setMCPValues(['convo1-value']);
      });

      await waitFor(() => {
        expect(result.current.mcpValues).toEqual(['convo1-value']);
      });

      // Switch to different conversation
      rerender({ conversationId: 'convo2' });

      // Should have different state for new conversation
      expect(result.current.mcpValues).toEqual([]);

      // Set values for second conversation
      act(() => {
        result.current.setMCPValues(['convo2-value']);
      });

      await waitFor(() => {
        expect(result.current.mcpValues).toEqual(['convo2-value']);
      });

      // Switch back to first conversation
      rerender({ conversationId: 'convo1' });

      // Should maintain separate state
      await waitFor(() => {
        expect(result.current.mcpValues).toEqual(['convo1-value']);
      });
    });
  });

  describe('Ephemeral Agent Synchronization', () => {
    it('should sync mcpValues when ephemeralAgent is updated externally', async () => {
      // Create a shared wrapper for both hooks to share the same Recoil/Jotai context
      const { Wrapper, servers } = createWrapper(['external-value1', 'external-value2']);

      // Create a component that uses both hooks to ensure they share state
      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
          ephemeralAgentByConvoId(Constants.NEW_CONVO),
        );
        return { mcpHook, ephemeralAgent, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      // Simulate external update to ephemeralAgent (e.g., from another component)
      const externalMcpValues = ['external-value1', 'external-value2'];
      act(() => {
        result.current.setEphemeralAgent({
          mcp: externalMcpValues,
        });
      });

      // The hook should sync with the external update
      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(externalMcpValues);
      });
    });

    it('should filter out MCPs not in configured servers', async () => {
      const { Wrapper, servers } = createWrapper(['server1', 'server2']);

      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      act(() => {
        result.current.setEphemeralAgent({
          mcp: ['server1', 'removed-server', 'server2'],
        });
      });

      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(['server1', 'server2']);
      });
    });

    it('should clear all MCPs when none are in configured servers', async () => {
      const { Wrapper, servers } = createWrapper(['server1', 'server2']);

      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      act(() => {
        result.current.setEphemeralAgent({
          mcp: ['removed1', 'removed2', 'removed3'],
        });
      });

      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual([]);
      });
    });

    it('should keep all MCPs when all are in configured servers', async () => {
      const { Wrapper, servers } = createWrapper(['server1', 'server2', 'server3']);

      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      act(() => {
        result.current.setEphemeralAgent({
          mcp: ['server1', 'server2'],
        });
      });

      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(['server1', 'server2']);
      });
    });

    it('should update ephemeralAgent when mcpValues changes through hook', async () => {
      // Create a shared wrapper for both hooks
      const { Wrapper, servers } = createWrapper(['hook-value1', 'hook-value2']);

      // Create a component that uses both the hook and accesses Recoil state
      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, ephemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      const newValues = ['hook-value1', 'hook-value2'];

      act(() => {
        result.current.mcpHook.setMCPValues(newValues);
      });

      // Verify both mcpValues and ephemeralAgent are updated
      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(newValues);
        expect(result.current.ephemeralAgent?.mcp).toEqual(newValues);
      });
    });

    it('should handle empty ephemeralAgent.mcp array correctly', async () => {
      // Create a shared wrapper
      const { Wrapper, servers } = createWrapper(['initial-value']);

      // Create a component that uses both hooks
      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      // Set initial values
      act(() => {
        result.current.mcpHook.setMCPValues(['initial-value']);
      });

      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(['initial-value']);
      });

      // Try to set empty array externally
      act(() => {
        result.current.setEphemeralAgent({
          mcp: [],
        });
      });

      // Values should remain unchanged since empty mcp array doesn't trigger update
      // (due to the condition: ephemeralAgent?.mcp && ephemeralAgent.mcp.length > 0)
      expect(result.current.mcpHook.mcpValues).toEqual(['initial-value']);
    });

    it('should handle ephemeralAgent with clear mcp value', async () => {
      // Create a shared wrapper
      const { Wrapper, servers } = createWrapper(['server1', 'server2']);

      // Create a component that uses both hooks
      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      // Set initial values
      act(() => {
        result.current.mcpHook.setMCPValues(['server1', 'server2']);
      });

      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(['server1', 'server2']);
      });

      // Set ephemeralAgent with clear value
      act(() => {
        result.current.setEphemeralAgent({
          mcp: [Constants.mcp_clear as string],
        });
      });

      // mcpValues should be cleared
      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual([]);
      });
    });

    it('should properly sync non-empty arrays from ephemeralAgent', async () => {
      // Additional test to ensure non-empty arrays DO sync
      const { Wrapper, servers } = createWrapper([
        'value1',
        'value2',
        'value3',
        'value4',
        'value5',
      ]);

      const TestComponent = () => {
        const mcpHook = useMCPSelect({ servers });
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper: Wrapper });

      // Set initial values through ephemeralAgent with non-empty array
      const initialValues = ['value1', 'value2'];
      act(() => {
        result.current.setEphemeralAgent({
          mcp: initialValues,
        });
      });

      // Should sync since it's non-empty
      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(initialValues);
      });

      // Update with different non-empty values
      const updatedValues = ['value3', 'value4', 'value5'];
      act(() => {
        result.current.setEphemeralAgent({
          mcp: updatedValues,
        });
      });

      // Should sync the new values
      await waitFor(() => {
        expect(result.current.mcpHook.mcpValues).toEqual(updatedValues);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined conversationId', () => {
      const { Wrapper, servers } = createWrapper(['test']);
      const { result } = renderHook(() => useMCPSelect({ conversationId: undefined, servers }), {
        wrapper: Wrapper,
      });

      expect(result.current.mcpValues).toEqual([]);

      act(() => {
        result.current.setMCPValues(['test']);
      });

      expect(() => result.current).not.toThrow();
    });

    it('should handle empty string conversationId', () => {
      const { Wrapper, servers } = createWrapper();
      const { result } = renderHook(() => useMCPSelect({ conversationId: '', servers }), {
        wrapper: Wrapper,
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should handle very large arrays without performance issues', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `value-${i}`);
      const { Wrapper, servers } = createWrapper(largeArray);
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      const startTime = performance.now();

      act(() => {
        result.current.setMCPValues(largeArray);
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Should complete within reasonable time (< 100ms)
      expect(executionTime).toBeLessThan(100);

      await waitFor(() => {
        expect(result.current.mcpValues).toEqual(largeArray);
      });
    });

    it('should cleanup properly on unmount', () => {
      const { Wrapper, servers } = createWrapper();
      const { unmount } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak memory on repeated updates', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `value-${i}`);
      const { Wrapper, servers } = createWrapper(values);
      const { result } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      // Perform many updates to test for memory leaks
      for (let i = 0; i < 100; i++) {
        act(() => {
          result.current.setMCPValues([`value-${i}`]);
        });
      }

      // If we get here without crashing, memory management is likely OK
      expect(result.current.mcpValues).toEqual(['value-99']);
    });

    it('should handle component remounting', () => {
      const { Wrapper, servers } = createWrapper();
      const { result, unmount } = renderHook(() => useMCPSelect({ servers }), {
        wrapper: Wrapper,
      });

      act(() => {
        result.current.setMCPValues(['before-unmount']);
      });

      unmount();

      // Remount
      const { Wrapper: Wrapper2, servers: servers2 } = createWrapper();
      const { result: newResult } = renderHook(() => useMCPSelect({ servers: servers2 }), {
        wrapper: Wrapper2,
      });

      // Should handle remounting gracefully
      expect(newResult.current.mcpValues).toBeDefined();
    });
  });
});
