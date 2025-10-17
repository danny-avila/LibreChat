import { createAgentCategoryMethods, type AgentCategoryMethods } from './agentCategory';
import { createPluginAuthMethods, type PluginAuthMethods } from './pluginAuth';
import { createAccessRoleMethods, type AccessRoleMethods } from './accessRole';
import { createUserGroupMethods, type UserGroupMethods } from './userGroup';
import { createAclEntryMethods, type AclEntryMethods } from './aclEntry';
import { createSessionMethods, type SessionMethods } from './session';
import { createMemoryMethods, type MemoryMethods } from './memory';
import { createTokenMethods, type TokenMethods } from './token';
import { createShareMethods, type ShareMethods } from './share';
import { createRoleMethods, type RoleMethods } from './role';
import { createUserMethods, type UserMethods } from './user';

export type AllMethods = UserMethods &
  SessionMethods &
  TokenMethods &
  RoleMethods &
  MemoryMethods &
  AgentCategoryMethods &
  UserGroupMethods &
  AclEntryMethods &
  ShareMethods &
  AccessRoleMethods &
  PluginAuthMethods;

/**
 * Creates all database methods for all collections
 */
export function createMethods(mongoose: typeof import('mongoose')): AllMethods {
  return {
    ...createUserMethods(mongoose),
    ...createSessionMethods(mongoose),
    ...createTokenMethods(mongoose),
    ...createRoleMethods(mongoose),
    ...createMemoryMethods(mongoose),
    ...createAgentCategoryMethods(mongoose),
    ...createAccessRoleMethods(mongoose),
    ...createUserGroupMethods(mongoose),
    ...createAclEntryMethods(mongoose),
    ...createShareMethods(mongoose),
    ...createPluginAuthMethods(mongoose),
  };
}

export type {
  UserMethods,
  SessionMethods,
  TokenMethods,
  RoleMethods,
  MemoryMethods,
  AgentCategoryMethods,
  UserGroupMethods,
  AclEntryMethods,
  ShareMethods,
  AccessRoleMethods,
  PluginAuthMethods,
};
