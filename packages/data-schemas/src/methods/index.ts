import { createUserMethods, type UserMethods } from './user';
import { createSessionMethods, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods } from './role';

/**
 * Creates all database methods for all collections
 */
export function createMethods(mongoose: typeof import('mongoose')) {
  return {
    ...createUserMethods(mongoose),
    ...createSessionMethods(mongoose),
    ...createTokenMethods(mongoose),
    ...createRoleMethods(mongoose),
  };
}

export type AllMethods = UserMethods & SessionMethods & TokenMethods & RoleMethods;
