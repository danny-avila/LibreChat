import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { IGroup, IUser } from '@librechat/data-schemas';
import type { FilterQuery, ClientSession } from 'mongoose';
import type { Request, Response } from 'express';
import { groupToScim } from './serializer';
import { sendScimError, parseSCIMPagination, buildListResponse, isValidObjectId } from './utils';
import { buildGroupFilterQuery, extractMemberIdFromPath } from './filter';
import type { ScimPatchRequest, ScimGroup, ScimGroupMember } from './types';

export interface ScimGroupsDeps {
  findUsers(
    criteria: FilterQuery<IUser>,
    fields?: string | null,
  ): Promise<IUser[]>;
  countGroups(
    filter?: { source?: 'scim'; search?: string },
    session?: ClientSession,
  ): Promise<number>;
  listGroups(
    filter?: { source?: 'scim'; search?: string; limit?: number; offset?: number },
    session?: ClientSession,
  ): Promise<IGroup[]>;
  findGroupById(
    groupId: string | Types.ObjectId,
    projection?: Record<string, 0 | 1>,
    session?: ClientSession,
  ): Promise<IGroup | null>;
  createGroup(groupData: Partial<IGroup>, session?: ClientSession): Promise<IGroup>;
  updateGroupById(
    groupId: string | Types.ObjectId,
    data: Partial<Pick<IGroup, 'name' | 'description' | 'email' | 'avatar'>>,
    session?: ClientSession,
  ): Promise<IGroup | null>;
  deleteGroup(
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup | null>;
  addUserToGroup(
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ user: IUser; group: IGroup | null }>;
  removeMemberById(
    groupId: string | Types.ObjectId,
    memberId: string,
    session?: ClientSession,
  ): Promise<IGroup | null>;
}

/** Hydrate memberIds → SCIM members with resolved MongoDB user IDs as value */
async function hydrateMembers(
  memberIds: string[],
  findUsers: ScimGroupsDeps['findUsers'],
): Promise<ScimGroupMember[]> {
  if (!memberIds.length) return [];

  const objIds = memberIds.filter((id) => isValidObjectId(id));
  const extIds = memberIds.filter((id) => !isValidObjectId(id));

  const orClauses: FilterQuery<IUser>[] = [];
  if (objIds.length) orClauses.push({ _id: { $in: objIds } });
  if (extIds.length) orClauses.push({ idOnTheSource: { $in: extIds } });
  if (!orClauses.length) return memberIds.map((v) => ({ value: v, $ref: `/scim/v2/Users/${v}` }));

  const users = await findUsers({ $or: orClauses }, '_id name idOnTheSource');

  const memberIdToUserId = new Map<string, string>();
  for (const u of users) {
    const uid = u._id.toString();
    if (u.idOnTheSource) memberIdToUserId.set(u.idOnTheSource, uid);
    memberIdToUserId.set(uid, uid);
  }

  return memberIds.map((memberId) => {
    const userId = memberIdToUserId.get(memberId) ?? memberId;
    return { value: userId, $ref: `/scim/v2/Users/${userId}` };
  });
}

export function createScimGroupsHandlers(deps: ScimGroupsDeps): {
  listGroups: (req: Request, res: Response) => Promise<Response>;
  getGroup: (req: Request, res: Response) => Promise<Response>;
  createGroup: (req: Request, res: Response) => Promise<Response>;
  replaceGroup: (req: Request, res: Response) => Promise<Response>;
  patchGroup: (req: Request, res: Response) => Promise<Response>;
  deleteGroup: (req: Request, res: Response) => Promise<Response>;
} {
  const {
    findUsers,
    countGroups,
    listGroups,
    findGroupById,
    createGroup,
    updateGroupById,
    deleteGroup,
    addUserToGroup,
    removeMemberById,
  } = deps;

  async function listGroupsHandler(req: Request, res: Response) {
    try {
      const query = req.query as Record<string, unknown>;
      const { startIndex, count } = parseSCIMPagination(query);
      const extraFilter = buildGroupFilterQuery(query.filter as string | undefined);
      // SCIM-managed groups only; merge with any filter from query
      const baseFilter: Record<string, unknown> = { source: 'scim', ...extraFilter };
      const offset = startIndex - 1;

      const [groups, total] = await Promise.all([
        listGroups({ source: 'scim', limit: count, offset }),
        countGroups({ source: 'scim' }),
      ]);

      void baseFilter; // extraFilter is for documentation; listGroups doesn't accept arbitrary queries
      const resources = await Promise.all(
        groups.map(async (g) => {
          const members = await hydrateMembers(g.memberIds ?? [], findUsers);
          return groupToScim(g, members);
        }),
      );

      return res.status(200).json(buildListResponse(resources, total, { startIndex, count }));
    } catch (err) {
      logger.error('[SCIM] listGroups error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function getGroupHandler(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `Group ${id} not found`);

      const group = await findGroupById(id);
      if (!group) return sendScimError(res, 404, `Group ${id} not found`);

      const members = await hydrateMembers(group.memberIds ?? [], findUsers);
      return res.status(200).json(groupToScim(group, members));
    } catch (err) {
      logger.error('[SCIM] getGroup error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function createGroupHandler(req: Request, res: Response) {
    try {
      const body = req.body as ScimGroup;
      if (!body.displayName) {
        return sendScimError(res, 400, 'displayName is required', 'invalidValue');
      }

      const group = await createGroup({
        name: body.displayName,
        source: 'scim',
        idOnTheSource: body.externalId,
        memberIds: [],
      });

      // Add initial members
      const initialMembers = body.members ?? [];
      if (initialMembers.length) {
        await Promise.all(
          initialMembers
            .filter((m) => isValidObjectId(m.value))
            .map((m) => addUserToGroup(m.value, group._id.toString())),
        );
      }

      const fresh = await findGroupById(group._id.toString());
      const members = await hydrateMembers(fresh?.memberIds ?? [], findUsers);
      return res.status(201).json(groupToScim(fresh ?? group, members));
    } catch (err) {
      logger.error('[SCIM] createGroup error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function replaceGroupHandler(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `Group ${id} not found`);

      const existing = await findGroupById(id);
      if (!existing) return sendScimError(res, 404, `Group ${id} not found`);

      const body = req.body as ScimGroup;
      if (!body.displayName) {
        return sendScimError(res, 400, 'displayName is required', 'invalidValue');
      }

      await updateGroupById(id, { name: body.displayName });

      // Replace membership: remove all current members, add new ones
      const currentMemberIds = existing.memberIds ?? [];
      await Promise.all(currentMemberIds.map((m: string) => removeMemberById(id, m)));

      if (body.members?.length) {
        await Promise.all(
          body.members
            .filter((m) => isValidObjectId(m.value))
            .map((m) => addUserToGroup(m.value, id)),
        );
      }

      const fresh = await findGroupById(id);
      const members = await hydrateMembers(fresh?.memberIds ?? [], findUsers);
      return res.status(200).json(groupToScim(fresh!, members));
    } catch (err) {
      logger.error('[SCIM] replaceGroup error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function patchGroupHandler(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `Group ${id} not found`);

      const existing = await findGroupById(id, { _id: 1 });
      if (!existing) return sendScimError(res, 404, `Group ${id} not found`);

      const body = req.body as ScimPatchRequest;
      if (!Array.isArray(body?.Operations)) {
        return sendScimError(res, 400, 'Missing Operations array', 'invalidSyntax');
      }

      for (const op of body.Operations) {
        const opLower = op.op?.toLowerCase();
        const path = op.path ?? '';

        if (opLower === 'replace' && path.toLowerCase() === 'displayname') {
          await updateGroupById(id, { name: String(op.value) });
        } else if (opLower === 'add' && path.toLowerCase() === 'members') {
          const membersToAdd = Array.isArray(op.value)
            ? (op.value as Array<{ value: string }>)
            : [];
          await Promise.all(
            membersToAdd
              .filter((m) => isValidObjectId(m.value))
              .map((m) => addUserToGroup(m.value, id)),
          );
        } else if (opLower === 'remove') {
          const memberIdFromPath = extractMemberIdFromPath(path);
          if (memberIdFromPath) {
            // remove single member by their SCIM user ID (MongoDB objectId)
            // look up user to get their stored memberId (idOnTheSource or _id)
            const [user] = await findUsers({ _id: memberIdFromPath }, '_id idOnTheSource');
            const storedId = user?.idOnTheSource ?? memberIdFromPath;
            await removeMemberById(id, storedId);
          } else if (path.toLowerCase() === 'members') {
            // value is an array of members to remove
            const membersToRemove = Array.isArray(op.value)
              ? (op.value as Array<{ value: string }>)
              : [];
            for (const m of membersToRemove) {
              const [user] = await findUsers({ _id: m.value }, '_id idOnTheSource');
              const storedId = user?.idOnTheSource ?? m.value;
              await removeMemberById(id, storedId);
            }
          }
        }
      }

      const fresh = await findGroupById(id);
      const members = await hydrateMembers(fresh?.memberIds ?? [], findUsers);
      return res.status(200).json(groupToScim(fresh!, members));
    } catch (err) {
      logger.error('[SCIM] patchGroup error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  async function deleteGroupHandler(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectId(id)) return sendScimError(res, 404, `Group ${id} not found`);

      const deleted = await deleteGroup(id);
      if (!deleted) return sendScimError(res, 404, `Group ${id} not found`);

      return res.status(204).send();
    } catch (err) {
      logger.error('[SCIM] deleteGroup error:', err);
      return sendScimError(res, 500, 'Internal server error');
    }
  }

  return {
    listGroups: listGroupsHandler,
    getGroup: getGroupHandler,
    createGroup: createGroupHandler,
    replaceGroup: replaceGroupHandler,
    patchGroup: patchGroupHandler,
    deleteGroup: deleteGroupHandler,
  };
}

export type ScimGroupsHandlers = ReturnType<typeof createScimGroupsHandlers>;
