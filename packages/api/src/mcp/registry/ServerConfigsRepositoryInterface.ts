import { ParsedServerConfig, AddServerResult } from '~/mcp/types';

/**
 * Interface for future DB implementation
 */
export interface IServerConfigsRepositoryInterface {
  add(serverName: string, config: ParsedServerConfig, userId?: string): Promise<AddServerResult>;

  //ACL Entry check if update is possible
  update(serverName: string, config: ParsedServerConfig, userId?: string): Promise<void>;

  //ACL Entry check if remove is possible
  remove(serverName: string, userId?: string): Promise<void>;

  //ACL Entry check if read is possible
  get(serverName: string, userId?: string): Promise<ParsedServerConfig | undefined>;

  //ACL Entry get all accessible mcp config definitions + any mcp configured with agents
  getAll(userId?: string): Promise<Record<string, ParsedServerConfig>>;

  reset(): Promise<void>;
}
