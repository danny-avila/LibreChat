import { createUserMethods, type UserMethods } from './user';
import { createSessionMethods, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods } from './role';
/* Memories */
import { createMemoryMethods, type MemoryMethods } from './memory';

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
  };
}

export type { MemoryMethods };
export type AllMethods = UserMethods & SessionMethods & TokenMethods & RoleMethods & MemoryMethods;
