import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowMetadata } from '~/flow/types';

export class MCPToolCallValidationHandler {
  private static readonly FLOW_TYPE = 'mcp_tool_validation';

  static async initiateValidationFlow(
    userId: string,
    serverName: string,
    toolName: string,
    toolArguments: Record<string, unknown>,
  ): Promise<{ validationId: string; flowMetadata: FlowMetadata }> {
    const validationId = this.generateValidationId(userId, serverName, toolName);

    const flowMetadata: FlowMetadata = {
      userId,
      serverName,
      toolName,
      toolArguments,
      timestamp: Date.now(),
    };

    return { validationId, flowMetadata };
  }

  static async completeValidationFlow(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
  ): Promise<boolean> {
    const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
    if (!flowState) {
      throw new Error('Validation flow not found');
    }

    await flowManager.completeFlow(validationId, this.FLOW_TYPE, true);
    logger.info(`[MCPValidation] Validation flow completed successfully: ${validationId}`);
    return true;
  }

  static async rejectValidationFlow(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
    reason?: string,
  ): Promise<boolean> {
    const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
    if (!flowState) {
      throw new Error('Validation flow not found');
    }

    const errorMessage = reason || 'User rejected tool call';
    await flowManager.failFlow(validationId, this.FLOW_TYPE, new Error(errorMessage));
    logger.info(`[MCPValidation] Validation flow rejected: ${validationId}`);
    return true;
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

  public static generateValidationId(userId: string, serverName: string, toolName: string): string {
    const nonce = randomBytes(8).toString('hex');
    return `${userId}:${serverName}:${toolName}:${Date.now()}:${nonce}`;
  }

  public static getFlowType(): string {
    return this.FLOW_TYPE;
  }
}
