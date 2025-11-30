/* eslint-disable @typescript-eslint/no-unused-vars */
import { AllMethods, createMethods, logger } from '@librechat/data-schemas';
import type { IServerConfigsRepositoryInterface } from '~/mcp/registry/ServerConfigsRepositoryInterface';
import type { ParsedServerConfig } from '~/mcp/types';

/**
 * DB backed config storage
 * Handles CRUD Methods of dynamic mcp servers
 * Will handle Permission ACL
 */
export class ServerConfigsDB implements IServerConfigsRepositoryInterface {
  private _dbMethods: AllMethods;
  constructor(mongoose: typeof import('mongoose')) {
    if (!mongoose) {
      throw new Error('ServerConfigsDB requires mongoose instance');
    }
    this._dbMethods = createMethods(mongoose);
  }

  public async add(serverName: string, config: ParsedServerConfig, userId?: string): Promise<void> {
    logger.debug('ServerConfigsDB add not yet implemented');
    return;
  }

  public async update(
    serverName: string,
    config: ParsedServerConfig,
    userId?: string,
  ): Promise<void> {
    logger.debug('ServerConfigsDB update not yet implemented');
    return;
  }

  public async remove(serverName: string, userId?: string): Promise<void> {
    logger.debug('ServerConfigsDB remove not yet implemented');
    return;
  }

  public async get(serverName: string, userId?: string): Promise<ParsedServerConfig | undefined> {
    logger.debug('ServerConfigsDB get not yet implemented');
    return;
  }

  /**
   * Return all DB stored configs (scoped by user Id if provided)
   * @param userId optional user id. if not provided only publicly shared mcp configs will be returned
   * @returns record of parsed configs
   */
  public async getAll(userId?: string): Promise<Record<string, ParsedServerConfig>> {
    // TODO: Implement DB-backed config retrieval
    logger.debug('[ServerConfigsDB] getAll not yet implemented', { userId });
    return {};
  }

  public async reset(): Promise<void> {
    logger.warn('Attempt to reset the DB config storage');
    return;
  }
}
