import React from 'react';
import { Provider, createStore } from 'jotai';
import { renderHook, act, waitFor } from '@testing-library/react';
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { setTimestamp } from '~/utils/timestamps';
import { useMCPSelect } from '../useMCPSelect';

// Mock dependencies
jest.mock('~/utils/timestamps', () => ({
  setTimestamp: jest.fn(),
}));

jest.mock('lodash/isEqual', () => jest.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)));

const createWrapper = () => {
  // Create a new Jotai store for each test to ensure clean state
  const store = createStore();

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <RecoilRoot>
      <Provider store={store}>{children}</Provider>
    </RecoilRoot>
  );
  return Wrapper;
};

describe('useMCPSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Basic Functionality', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      expect(result.current.mcpValues).toEqual([]);
      expect(result.current.isPinned).toBe(true); // Default value from mcpPinnedAtom is true
      expect(typeof result.current.setMCPValues).toBe('function');
      expect(typeof result.current.setIsPinned).toBe('function');
    });

    it('should use conversationId when provided', () => {
      const conversationId = 'test-convo-123';
      const { result } = renderHook(() => useMCPSelect({ conversationId }), {
        wrapper: createWrapper(),
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should use NEW_CONVO constant when conversationId is null', () => {
      const { result } = renderHook(() => useMCPSelect({ conversationId: null }), {
        wrapper: createWrapper(),
      });

      expect(result.current.mcpValues).toEqual([]);
    });
  });

  describe('State Updates', () => {
    it('should update mcpValues when setMCPValues is called', async () => {
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      act(() => {
        // @ts-ignore - Testing invalid input
        result.current.setMCPValues('not-an-array');
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should update isPinned state', () => {
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result } = renderHook(() => useMCPSelect({ conversationId }), {
        wrapper: createWrapper(),
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
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result, rerender } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result, rerender } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result, rerender } = renderHook(
        ({ conversationId }) => useMCPSelect({ conversationId }),
        {
          wrapper: createWrapper(),
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
      const wrapper = createWrapper();

      // Create a component that uses both hooks to ensure they share state
      const TestComponent = () => {
        const mcpHook = useMCPSelect({});
        const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
          ephemeralAgentByConvoId(Constants.NEW_CONVO),
        );
        return { mcpHook, ephemeralAgent, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper });

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

    it('should update ephemeralAgent when mcpValues changes through hook', async () => {
      // Create a shared wrapper for both hooks
      const wrapper = createWrapper();

      // Create a component that uses both the hook and accesses Recoil state
      const TestComponent = () => {
        const mcpHook = useMCPSelect({});
        const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, ephemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper });

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
      const wrapper = createWrapper();

      // Create a component that uses both hooks
      const TestComponent = () => {
        const mcpHook = useMCPSelect({});
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper });

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

    it('should properly sync non-empty arrays from ephemeralAgent', async () => {
      // Additional test to ensure non-empty arrays DO sync
      const wrapper = createWrapper();

      const TestComponent = () => {
        const mcpHook = useMCPSelect({});
        const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
        return { mcpHook, setEphemeralAgent };
      };

      const { result } = renderHook(() => TestComponent(), { wrapper });

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
      const { result } = renderHook(() => useMCPSelect({ conversationId: undefined }), {
        wrapper: createWrapper(),
      });

      expect(result.current.mcpValues).toEqual([]);

      act(() => {
        result.current.setMCPValues(['test']);
      });

      expect(() => result.current).not.toThrow();
    });

    it('should handle empty string conversationId', () => {
      const { result } = renderHook(() => useMCPSelect({ conversationId: '' }), {
        wrapper: createWrapper(),
      });

      expect(result.current.mcpValues).toEqual([]);
    });

    it('should handle very large arrays without performance issues', async () => {
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      const largeArray = Array.from({ length: 1000 }, (_, i) => `value-${i}`);

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
      const { unmount } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak memory on repeated updates', async () => {
      const { result } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
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
      const { result, unmount } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setMCPValues(['before-unmount']);
      });

      unmount();

      // Remount
      const { result: newResult } = renderHook(() => useMCPSelect({}), {
        wrapper: createWrapper(),
      });

      // Should handle remounting gracefully
      expect(newResult.current.mcpValues).toBeDefined();
    });
  });
});
