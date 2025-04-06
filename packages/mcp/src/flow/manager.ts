import Keyv from 'keyv';
import type { Logger } from 'winston';
import type { FlowState, FlowMetadata, FlowManagerOptions } from './types';

export class FlowStateManager<T = unknown> {
  private keyv: Keyv;
  private ttl: number;
  private logger: Logger;
  private intervals: Set<NodeJS.Timeout>;

  private static getDefaultLogger(): Logger {
    return {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    } as Logger;
  }

  constructor(store: Keyv, options?: FlowManagerOptions) {
    if (!options) {
      options = { ttl: 60000 * 3 };
    }
    const { ci = false, ttl, logger } = options;

    if (!ci && !(store instanceof Keyv)) {
      throw new Error('Invalid store provided to FlowStateManager');
    }

    this.ttl = ttl;
    this.keyv = store;
    this.logger = logger || FlowStateManager.getDefaultLogger();
    this.intervals = new Set();
    this.setupCleanupHandlers();
  }

  private setupCleanupHandlers() {
    const cleanup = () => {
      this.logger.info('Cleaning up FlowStateManager intervals...');
      this.intervals.forEach((interval) => clearInterval(interval));
      this.intervals.clear();
      process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGQUIT', cleanup);
    process.on('SIGHUP', cleanup);
  }

  private getFlowKey(flowId: string, type: string): string {
    return `${type}:${flowId}`;
  }

  /**
   * Creates a new flow and waits for its completion
   */
  async createFlow(
    flowId: string,
    type: string,
    metadata: FlowMetadata = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const flowKey = this.getFlowKey(flowId, type);

    let existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      this.logger.debug(`[${flowKey}] Flow already exists`);
      return this.monitorFlow(flowKey, type, signal);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      this.logger.debug(`[${flowKey}] Flow exists on 2nd check`);
      return this.monitorFlow(flowKey, type, signal);
    }

    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata,
      createdAt: Date.now(),
    };

    this.logger.debug('Creating initial flow state:', flowKey);
    await this.keyv.set(flowKey, initialState, this.ttl);
    return this.monitorFlow(flowKey, type, signal);
  }

  private monitorFlow(flowKey: string, type: string, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const checkInterval = 2000;
      let elapsedTime = 0;

      const intervalId = setInterval(async () => {
        try {
          const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

          if (!flowState) {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
            this.logger.error(`[${flowKey}] Flow state not found`);
            reject(new Error(`${type} Flow state not found`));
            return;
          }

          if (signal?.aborted) {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
            this.logger.warn(`[${flowKey}] Flow aborted`);
            const message = `${type} flow aborted`;
            await this.keyv.delete(flowKey);
            reject(new Error(message));
            return;
          }

          if (flowState.status !== 'PENDING') {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
            this.logger.debug(`[${flowKey}] Flow completed`);

            if (flowState.status === 'COMPLETED' && flowState.result !== undefined) {
              resolve(flowState.result);
            } else if (flowState.status === 'FAILED') {
              await this.keyv.delete(flowKey);
              reject(new Error(flowState.error ?? `${type} flow failed`));
            }
            return;
          }

          elapsedTime += checkInterval;
          if (elapsedTime >= this.ttl) {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
            this.logger.error(
              `[${flowKey}] Flow timed out | Elapsed time: ${elapsedTime} | TTL: ${this.ttl}`,
            );
            await this.keyv.delete(flowKey);
            reject(new Error(`${type} flow timed out`));
          }
          this.logger.debug(
            `[${flowKey}] Flow state elapsed time: ${elapsedTime}, checking again...`,
          );
        } catch (error) {
          this.logger.error(`[${flowKey}] Error checking flow state:`, error);
          clearInterval(intervalId);
          this.intervals.delete(intervalId);
          reject(error);
        }
      }, checkInterval);

      this.intervals.add(intervalId);
    });
  }

  /**
   * Completes a flow successfully
   */
  async completeFlow(flowId: string, type: string, result: T): Promise<boolean> {
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
   */
  async getFlowState(flowId: string, type: string): Promise<FlowState<T> | null> {
    const flowKey = this.getFlowKey(flowId, type);
    return this.keyv.get(flowKey);
  }

  /**
   * Creates a new flow and waits for its completion, only executing the handler if no existing flow is found
   * @param flowId - The ID of the flow
   * @param type - The type of flow
   * @param handler - Async function to execute if no existing flow is found
   * @param signal - Optional AbortSignal to cancel the flow
   */
  async createFlowWithHandler(
    flowId: string,
    type: string,
    handler: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const flowKey = this.getFlowKey(flowId, type);
    let existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      this.logger.debug(`[${flowKey}] Flow already exists`);
      return this.monitorFlow(flowKey, type, signal);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      this.logger.debug(`[${flowKey}] Flow exists on 2nd check`);
      return this.monitorFlow(flowKey, type, signal);
    }

    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata: {},
      createdAt: Date.now(),
    };
    this.logger.debug(`[${flowKey}] Creating initial flow state`);
    await this.keyv.set(flowKey, initialState, this.ttl);

    try {
      const result = await handler();
      await this.completeFlow(flowId, type, result);
      return result;
    } catch (error) {
      await this.failFlow(flowId, type, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
