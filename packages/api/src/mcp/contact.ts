import { PermissionBits, ResourceType } from 'librechat-data-provider';
import type { AgentOwnerContact } from 'librechat-data-provider';

import type { ParsedServerConfig } from '~/mcp/types';
import { hasSupportContact, resolveAgentOwnerContact } from '~/agents/contact';

const OWNER_PERMISSION_BITS =
  PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE;

type MCPContactConfig = Pick<ParsedServerConfig, 'dbId' | 'author' | 'support_contact'>;

type OwnerUser = {
  _id?: string | { toString(): string };
  name?: string | null;
  username?: string | null;
};

export type MCPContactDependencies = {
  findFirstUserOwnerIds: (
    resourceType: string,
    resourceIds: string[],
    ownerPermissionBits: number,
  ) => Promise<Map<string, string>>;
  findUsers: (query: { _id: { $in: string[] } }, projection: string) => Promise<OwnerUser[]>;
  warn: (message: string, error: unknown) => void;
};

/** Resolves derived MCP owner contacts without mutating registry configurations. */
export async function resolveMCPServerOwnerContacts(
  servers: Record<string, MCPContactConfig>,
  dependencies: MCPContactDependencies,
): Promise<Map<string, AgentOwnerContact>> {
  const candidates = Object.entries(servers).filter(
    ([, config]) => config.dbId != null && !hasSupportContact(config),
  );
  if (candidates.length === 0) {
    return new Map();
  }

  let ownerIdsByResource = new Map<string, string>();
  try {
    ownerIdsByResource = await dependencies.findFirstUserOwnerIds(
      ResourceType.MCPSERVER,
      candidates.map(([, config]) => config.dbId as string),
      OWNER_PERMISSION_BITS,
    );
  } catch (error) {
    dependencies.warn('[MCP] Failed to resolve MCP server owner ACL entries', error);
  }

  const ownerIdsByServer = new Map<string, string>();
  const uniqueOwnerIds = new Set<string>();
  for (const [serverName, config] of candidates) {
    const ownerId = ownerIdsByResource.get(config.dbId as string) ?? config.author;
    if (ownerId) {
      ownerIdsByServer.set(serverName, ownerId);
      uniqueOwnerIds.add(ownerId);
    }
  }

  let ownersById = new Map<string, OwnerUser>();
  if (uniqueOwnerIds.size > 0) {
    try {
      const users = await dependencies.findUsers(
        { _id: { $in: [...uniqueOwnerIds] } },
        'name username',
      );
      ownersById = new Map(
        users.flatMap((user) => {
          const id = user._id?.toString();
          return id ? [[id, user] as const] : [];
        }),
      );
    } catch (error) {
      dependencies.warn('[MCP] Failed to resolve MCP server owner users', error);
    }
  }

  const contacts = new Map<string, AgentOwnerContact>();
  for (const [serverName, config] of candidates) {
    const ownerId = ownerIdsByServer.get(serverName);
    const contact = resolveAgentOwnerContact(
      config,
      ownerId ? (ownersById.get(ownerId) ?? null) : null,
    );
    if (contact) {
      contacts.set(serverName, contact);
    }
  }
  return contacts;
}
