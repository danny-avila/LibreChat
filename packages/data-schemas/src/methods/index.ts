import { createUserMethods, type UserMethods } from './user';
import { createSessionMethods, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods } from './role';

/**
 * Creates all database methods for all collections
 */
export function createAllMethods(mongoose: typeof import('mongoose')) {
  return {
    ...createUserMethods(mongoose),
    ...createSessionMethods(mongoose),
    ...createTokenMethods(mongoose),
    ...createRoleMethods(mongoose),
  };
}

export type AllMethods = UserMethods & SessionMethods & TokenMethods & RoleMethods;

// Also export individual factory functions for granular usage if needed
export { createUserMethods, type UserMethods } from './user';
export { createSessionMethods, type SessionMethods } from './session';
export { createTokenMethods, type TokenMethods } from './token';
export { createRoleMethods, type RoleMethods } from './role';
