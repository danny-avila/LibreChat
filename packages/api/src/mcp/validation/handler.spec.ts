import { MCPToolCallValidationHandler } from './handler';
import type { FlowStateManager } from '~/flow/manager';

function createMockFlowManager(
  overrides: Partial<FlowStateManager<boolean>> = {},
): FlowStateManager<boolean> {
  return {
    getFlowState: jest.fn().mockResolvedValue({ metadata: {} }),
    completeFlow: jest.fn().mockResolvedValue(undefined),
    failFlow: jest.fn().mockResolvedValue(undefined),
    initFlow: jest.fn().mockResolvedValue(undefined),
    createFlow: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FlowStateManager<boolean>;
}

describe('MCPToolCallValidationHandler', () => {
  describe('initiateValidationFlow', () => {
    it('should return a validationId and flowMetadata', async () => {
      const result = await MCPToolCallValidationHandler.initiateValidationFlow(
        'user1',
        'server1',
        'tool1',
        { key: 'value' },
      );

      expect(result.validationId).toMatch(/^user1:server1:tool1:\d+$/);
      expect(result.flowMetadata).toEqual({
        userId: 'user1',
        serverName: 'server1',
        toolName: 'tool1',
        toolArguments: { key: 'value' },
        timestamp: expect.any(Number),
      });
    });

    it('should not include state in flowMetadata', async () => {
      const result = await MCPToolCallValidationHandler.initiateValidationFlow(
        'user1',
        'server1',
        'tool1',
        {},
      );
      expect(result.flowMetadata).not.toHaveProperty('state');
    });
  });

  describe('completeValidationFlow', () => {
    it('should complete flow when state exists', async () => {
      const flowManager = createMockFlowManager();
      const result = await MCPToolCallValidationHandler.completeValidationFlow(
        'validation-1',
        flowManager,
      );

      expect(result).toBe(true);
      expect(flowManager.completeFlow).toHaveBeenCalledWith(
        'validation-1',
        'mcp_tool_validation',
        true,
      );
    });

    it('should throw when flow state is not found', async () => {
      const flowManager = createMockFlowManager({
        getFlowState: jest.fn().mockResolvedValue(null),
      });

      await expect(
        MCPToolCallValidationHandler.completeValidationFlow('missing', flowManager),
      ).rejects.toThrow('Validation flow not found');
    });

    it('should not call failFlow on error', async () => {
      const flowManager = createMockFlowManager({
        completeFlow: jest.fn().mockRejectedValue(new Error('write failed')),
      });

      await expect(
        MCPToolCallValidationHandler.completeValidationFlow('validation-1', flowManager),
      ).rejects.toThrow('write failed');
      expect(flowManager.failFlow).not.toHaveBeenCalled();
    });
  });

  describe('rejectValidationFlow', () => {
    it('should fail flow with default reason', async () => {
      const flowManager = createMockFlowManager();
      const result = await MCPToolCallValidationHandler.rejectValidationFlow(
        'validation-1',
        flowManager,
      );

      expect(result).toBe(true);
      expect(flowManager.failFlow).toHaveBeenCalledWith(
        'validation-1',
        'mcp_tool_validation',
        expect.objectContaining({ message: 'User rejected tool call' }),
      );
    });

    it('should fail flow with custom reason', async () => {
      const flowManager = createMockFlowManager();
      await MCPToolCallValidationHandler.rejectValidationFlow(
        'validation-1',
        flowManager,
        'Not trusted',
      );

      expect(flowManager.failFlow).toHaveBeenCalledWith(
        'validation-1',
        'mcp_tool_validation',
        expect.objectContaining({ message: 'Not trusted' }),
      );
    });

    it('should throw when flow state is not found', async () => {
      const flowManager = createMockFlowManager({
        getFlowState: jest.fn().mockResolvedValue(null),
      });

      await expect(
        MCPToolCallValidationHandler.rejectValidationFlow('missing', flowManager),
      ).rejects.toThrow('Validation flow not found');
    });
  });

  describe('getFlowState', () => {
    it('should return metadata when flow exists', async () => {
      const metadata = { userId: 'user1', serverName: 'server1' };
      const flowManager = createMockFlowManager({
        getFlowState: jest.fn().mockResolvedValue({ metadata }),
      });

      const result = await MCPToolCallValidationHandler.getFlowState('validation-1', flowManager);
      expect(result).toEqual(metadata);
    });

    it('should return null when flow does not exist', async () => {
      const flowManager = createMockFlowManager({
        getFlowState: jest.fn().mockResolvedValue(null),
      });

      const result = await MCPToolCallValidationHandler.getFlowState('missing', flowManager);
      expect(result).toBeNull();
    });
  });

  describe('generateValidationId', () => {
    it('should include userId, serverName, toolName, and timestamp', () => {
      const id = MCPToolCallValidationHandler.generateValidationId('user1', 'server1', 'tool1');
      const parts = id.split(':');
      expect(parts[0]).toBe('user1');
      expect(parts[1]).toBe('server1');
      expect(parts[2]).toBe('tool1');
      expect(Number(parts[3])).toBeGreaterThan(0);
    });
  });

  describe('getFlowType', () => {
    it('should return the flow type string', () => {
      expect(MCPToolCallValidationHandler.getFlowType()).toBe('mcp_tool_validation');
    });
  });
});
