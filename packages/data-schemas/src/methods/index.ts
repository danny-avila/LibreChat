import { createUserMethods, type UserMethods } from './user';
import { createSessionMethods, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods } from './role';
/* Memories */
import { createMemoryMethods, type MemoryMethods } from './memory';
import { createShareMethods, type ShareMethods } from './share';

/**
 * Creates all database methods for all collections
 */
export function createMethods(mongoose: typeof import('mongoose')) {
  return {
    ...createUserMethods(mongoose),
    ...createSessionMethods(mongoose),
    ...createTokenMethods(mongoose),
    ...createRoleMethods(mongoose),
    ...createMemoryMethods(mongoose),
    ...createShareMethods(mongoose),
  };
}

export type { MemoryMethods, ShareMethods };
export type AllMethods = UserMethods &
  SessionMethods &
  TokenMethods &
  RoleMethods &
  MemoryMethods &
  ShareMethods;
