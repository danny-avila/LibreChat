import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowMetadata } from '~/flow/types';

export class MCPToolCallValidationHandler {
  private static readonly FLOW_TYPE = 'mcp_tool_validation';
  private static readonly FLOW_TTL = 10 * 60 * 1000;

  static async initiateValidationFlow(
    userId: string,
    serverName: string,
    toolName: string,
    toolArguments: Record<string, unknown>,
  ): Promise<{ validationId: string; flowMetadata: FlowMetadata }> {
    const validationId = this.generateValidationId(userId, serverName, toolName);
    const state = this.generateState();

    const flowMetadata: FlowMetadata = {
      userId,
      serverName,
      toolName,
      toolArguments,
      state,
      timestamp: Date.now(),
    };

    return { validationId, flowMetadata };
  }

  static async completeValidationFlow(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
  ): Promise<boolean> {
    try {
      const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
      if (!flowState) {
        throw new Error('Validation flow not found');
      }

      await flowManager.completeFlow(validationId, this.FLOW_TYPE, true);
      logger.info(`[MCPValidation] Validation flow completed successfully: ${validationId}`);
      return true;
    } catch (error) {
      logger.error('[MCPValidation] Failed to complete validation flow', { error, validationId });
      await flowManager.failFlow(validationId, this.FLOW_TYPE, error as Error);
      throw error;
    }
  }

  static async rejectValidationFlow(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
    reason?: string,
  ): Promise<boolean> {
    try {
      const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
      if (!flowState) {
        throw new Error('Validation flow not found');
      }

      const errorMessage = reason || 'User rejected tool call';
      await flowManager.failFlow(validationId, this.FLOW_TYPE, new Error(errorMessage));
      logger.info(`[MCPValidation] Validation flow rejected: ${validationId}`);
      return true;
    } catch (error) {
      logger.error('[MCPValidation] Failed to reject validation flow', { error, validationId });
      throw error;
    }
  }

  static async getFlowState(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
  ): Promise<FlowMetadata | null> {
    const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
    if (!flowState) {
      return null;
    }
    return flowState.metadata as FlowMetadata;
  }

  public static generateValidationId(
    userId: string,
    serverName: string,
    toolName: string,
  ): string {
    return `${userId}:${serverName}:${toolName}:${Date.now()}`;
  }

  public static getFlowType(): string {
    return this.FLOW_TYPE;
  }

  public static getFlowTTL(): number {
    return this.FLOW_TTL;
  }

  private static generateState(): string {
    return randomBytes(32).toString('base64url');
  }
}
