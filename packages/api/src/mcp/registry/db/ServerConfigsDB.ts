/* eslint-disable @typescript-eslint/no-unused-vars */
import { ParsedServerConfig } from '~/mcp/types';
import { IServerConfigsRepositoryInterface } from '../ServerConfigsRepositoryInterface';
import { logger } from '@librechat/data-schemas';

/**
 * DB backed config storage
 * Handles CRUD Methods of dynamic mcp servers
 * Will handle Permission ACL
 */
export class ServerConfigsDB implements IServerConfigsRepositoryInterface {
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
    logger.debug('ServerConfigsDB getAll not yet implemented');
    return {};
  }

  public async reset(): Promise<void> {
    logger.warn('Attempt to reset the DB config storage');
    return;
  }
}
