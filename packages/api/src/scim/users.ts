import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { IUser, CreateUserRequest, UserDeleteResult } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Request, Response } from 'express';
import { userToScim } from './serializer';
import { sendScimError, parseSCIMPagination, buildListResponse, isValidObjectId } from './utils';
import { buildUserFilterQuery } from './filter';
import type { ScimPatchRequest, ScimUser } from './types';

const SCIM_USER_FIELDS =
  '_id name username email emailVerified avatar provider role idOnTheSource active createdAt updatedAt';

export interface ScimUsersDeps {
  findUsers(
    criteria: FilterQuery<IUser>,
    fields?: string | null,
    opts?: { limit?: number; offset?: number; sort?: Record<string, 1 | -1> },
  ): Promise<IUser[]>;
  countUsers(filter?: FilterQuery<IUser>): Promise<number>;
  getUserById(userId: string, fields?: string | null): Promise<IUser | null>;
  createUser(
    data: CreateUserRequest,
    balanceConfig?: undefined,
    disableTTL?: boolean,
    returnUser?: boolean,
  ): Promise<Types.ObjectId | Partial<IUser>>;
  updateUser(userId: string, data: Partial<IUser>): Promise<IUser | null>;
  deleteUserById(userId: string): Promise<UserDeleteResult>;
}

function resolveDisplayName(body: ScimUser): string | undefined {
  const joined = [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ');
  const fromName = body.name?.formatted ?? (joined || undefined);
  return body.displayName ?? fromName;
}

function resolveEmail(body: ScimUser): string | undefined {
  return body.userName ?? body.emails?.find((e) => e.primary)?.value ?? body.emails?.[0]?.value;
}

export function createScimUsersHandlers(deps: ScimUsersDeps): {
  listUsers: (req: Request, res: Response) => Promise<Response>;
  getUser: (req: Request, res: Response) => Promise<Response>;
  createUser: (req: Request, res: Response) => Promise<Response>;
  replaceUser: (req: Request, res: Response) => Promise<Response>;
  patchUser: (req: Request, res: Response) => Promise<Response>;
  deleteUser: (req: Request, res: Response) => Promise<Response>;
} {
  const { findUsers, countUsers, getUserById, createUser, updateUser, deleteUserById } = deps;

  async function listUsers(req: Request, res: Response) {
    try {
      const query = req.query as Record<string, unknown>;
      const { startIndex, count } = parseSCIMPagination(query);
      const filterQuery = buildUserFilterQuery(query.filter as string | undefined);
      const offset = startIndex - 1;

      const [users, total] = await Promise.all([
        findUsers(filterQuery, SCIM_USER_FIELDS, { limit: count, offset, sort: { createdAt: -1 } }),
        countUsers(filterQuery),
      ]);

      return res.status(200).json(buildListResponse(users.map(userToScim), total, { startIndex, count }));
    } catch (err) {
      logger.error('[SCIM] listUsers error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function getUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `User ${id} not found`);

      const user = await getUserById(id, SCIM_USER_FIELDS);
      if (!user) return sendScimError(res, 404, `User ${id} not found`);

      return res.status(200).json(userToScim(user));
    } catch (err) {
      logger.error('[SCIM] getUser error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function createUserHandler(req: Request, res: Response) {
    try {
      const body = req.body as ScimUser;
      const email = resolveEmail(body);
      if (!email) return sendScimError(res, 400, 'userName (email) is required', 'invalidValue');

      const existing = await findUsers({ email }, '_id');
      if (existing.length > 0) {
        return sendScimError(res, 409, `User with email ${email} already exists`, 'uniqueness');
      }

      const name = resolveDisplayName(body);
      const userData: CreateUserRequest = {
        email,
        name,
        provider: 'scim',
        emailVerified: true,
        role: SystemRoles.USER,
        idOnTheSource: body.externalId,
        active: body.active ?? true,
        // SCIM users authenticate via SSO; generate a random unusable password for schema compliance
        password: randomBytes(32).toString('hex'),
      };

      const result = await createUser(userData, undefined, true, true);
      const userId = (result as Partial<IUser>)._id?.toString() ?? (result as Types.ObjectId).toString();
      const user = await getUserById(userId, SCIM_USER_FIELDS);
      if (!user) return sendScimError(res, 500, 'User created but could not be retrieved');

      return res.status(201).json(userToScim(user));
    } catch (err) {
      logger.error('[SCIM] createUser error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function replaceUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `User ${id} not found`);

      const existing = await getUserById(id, '_id');
      if (!existing) return sendScimError(res, 404, `User ${id} not found`);

      const body = req.body as ScimUser;
      const updates: Partial<IUser> = {};

      const name = resolveDisplayName(body);
      if (name !== undefined) updates.name = name;
      if (body.externalId !== undefined) updates.idOnTheSource = body.externalId;
      if (body.active !== undefined) {
        updates.active = body.active;
        if (!body.active) updates.refreshToken = [];
      }

      const user = await updateUser(id, updates);
      if (!user) return sendScimError(res, 404, `User ${id} not found`);

      return res.status(200).json(userToScim(user));
    } catch (err) {
      logger.error('[SCIM] replaceUser error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function patchUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `User ${id} not found`);

      const existing = await getUserById(id, '_id active');
      if (!existing) return sendScimError(res, 404, `User ${id} not found`);

      const body = req.body as ScimPatchRequest;
      if (!Array.isArray(body?.Operations)) {
        return sendScimError(res, 400, 'Missing Operations array', 'invalidSyntax');
      }

      const updates: Partial<IUser> = {};

      for (const op of body.Operations) {
        const opLower = op.op?.toLowerCase();
        const path = op.path?.toLowerCase();

        if (opLower === 'replace' || opLower === 'add') {
          if (path === 'active') {
            updates.active = Boolean(op.value);
            if (!op.value) updates.refreshToken = [];
          } else if (path === 'displayname' || path === 'name.formatted') {
            updates.name = String(op.value);
          } else if (path === 'externalid') {
            updates.idOnTheSource = String(op.value);
          } else if (!path && typeof op.value === 'object' && op.value !== null) {
            // replace without path: value is an object with attributes
            const attrs = op.value as Record<string, unknown>;
            if (attrs.active !== undefined) {
              updates.active = Boolean(attrs.active);
              if (!attrs.active) updates.refreshToken = [];
            }
            if (attrs.displayName !== undefined) updates.name = String(attrs.displayName);
            if (attrs.externalId !== undefined) updates.idOnTheSource = String(attrs.externalId);
          }
        }
      }

      if (!Object.keys(updates).length) {
        const user = await getUserById(id, SCIM_USER_FIELDS);
        return res.status(200).json(userToScim(user!));
      }

      const user = await updateUser(id, updates);
      if (!user) return sendScimError(res, 404, `User ${id} not found`);

      return res.status(200).json(userToScim(user));
    } catch (err) {
      logger.error('[SCIM] patchUser error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `User ${id} not found`);

      const result = await deleteUserById(id);
      if (!result.deletedCount) return sendScimError(res, 404, `User ${id} not found`);

      return res.status(204).send();
    } catch (err) {
      logger.error('[SCIM] deleteUser error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  return { listUsers, getUser, createUser: createUserHandler, replaceUser, patchUser, deleteUser };
}

export type ScimUsersHandlers = ReturnType<typeof createScimUsersHandlers>;
