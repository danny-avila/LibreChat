// types/flows.ts

// flowStateManager.ts
import Keyv from 'keyv';
import { Time } from 'librechat-data-provider';
import type { Logger } from 'winston';
import type { FlowState, FlowMetadata, FlowManagerOptions } from './types';

export class FlowStateManager {
  private keyv: Keyv;
  private ttl: number;
  private logger: Logger;

  private static getDefaultLogger(): Logger {
    return {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    } as Logger;
  }

  constructor(store: Keyv, options: FlowManagerOptions = {}) {
    const { ttl = Time.TWO_MINUTES, logger } = options;

    if (!(store instanceof Keyv)) {
      throw new Error('Invalid store provided to FlowStateManager');
    }

    this.keyv = store;
    this.ttl = ttl;
    this.logger = logger || FlowStateManager.getDefaultLogger();
  }

  private getFlowKey(flowId: string, type: string): string {
    return `${type}:${flowId}`;
  }

  /**
   * Creates a new flow and waits for its completion
   * @template T - The type of the expected result
   */
  async createFlow<T>(flowId: string, type: string, metadata: FlowMetadata = {}): Promise<T> {
    const flowKey = this.getFlowKey(flowId, type);

    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata,
      createdAt: Date.now(),
    };

    await this.keyv.set(flowKey, initialState, this.ttl);

    return new Promise<T>((resolve, reject) => {
      const checkInterval = 1000;
      let elapsedTime = 0;

      const intervalId = setInterval(async () => {
        const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

        if (!flowState) {
          clearInterval(intervalId);
          reject(new Error(`${type} flow timed out`));
          return;
        }

        if (flowState.status !== 'PENDING') {
          clearInterval(intervalId);
          await this.keyv.delete(flowKey);

          if (flowState.status === 'COMPLETED' && flowState.result !== undefined) {
            resolve(flowState.result);
          } else if (flowState.status === 'FAILED') {
            reject(new Error(flowState.error ?? `${type} flow failed`));
          }
        }

        elapsedTime += checkInterval;
        if (elapsedTime >= this.ttl) {
          clearInterval(intervalId);
          await this.keyv.delete(flowKey);
          reject(new Error(`${type} flow timed out`));
        }
      }, checkInterval);
    });
  }

  /**
   * Completes a flow successfully
   * @template T - The type of the result data
   */
  async completeFlow<T>(flowId: string, type: string, result: T): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);
    const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

    if (!flowState) {
      return false;
    }

    const updatedState: FlowState<T> = {
      ...flowState,
      status: 'COMPLETED',
      result,
      completedAt: Date.now(),
    };

    await this.keyv.set(flowKey, updatedState, this.ttl);
    return true;
  }

  /**
   * Marks a flow as failed
   */
  async failFlow(flowId: string, type: string, error: Error | string): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);
    const flowState = (await this.keyv.get(flowKey)) as FlowState | undefined;

    if (!flowState) {
      return false;
    }

    const updatedState: FlowState = {
      ...flowState,
      status: 'FAILED',
      error: error instanceof Error ? error.message : error,
      failedAt: Date.now(),
    };

    await this.keyv.set(flowKey, updatedState, this.ttl);
    return true;
  }

  /**
   * Gets current flow state
   * @template T - The type of the expected result
   */
  async getFlowState<T>(flowId: string, type: string): Promise<FlowState<T> | null> {
    const flowKey = this.getFlowKey(flowId, type);
    return this.keyv.get(flowKey);
  }
}
