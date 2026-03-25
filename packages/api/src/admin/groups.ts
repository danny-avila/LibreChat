import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  IGroup,
  IUser,
  CreateGroupRequest,
  UpdateGroupRequest,
} from '@librechat/data-schemas';
import type { FilterQuery, Types, ClientSession } from 'mongoose';
import type { ValidationError } from '~/types/error';
import type { ServerRequest } from '~/types/http';
import type { Response } from 'express';

interface GroupListFilter {
  source?: 'local' | 'entra';
  search?: string;
}

interface GroupIdParams {
  id: string;
}

interface GroupMemberParams extends GroupIdParams {
  userId: string;
}

export interface AdminGroupsDeps {
  listGroups: (filter?: GroupListFilter, session?: ClientSession) => Promise<IGroup[]>;
  findGroupById: (
    groupId: string | Types.ObjectId,
    projection?: Record<string, 0 | 1>,
    session?: ClientSession,
  ) => Promise<IGroup | null>;
  createGroup: (groupData: Partial<IGroup>, session?: ClientSession) => Promise<IGroup>;
  updateGroupById: (
    groupId: string | Types.ObjectId,
    data: Partial<Pick<IGroup, 'name' | 'description' | 'email' | 'avatar'>>,
    session?: ClientSession,
  ) => Promise<IGroup | null>;
  deleteGroup: (
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<IGroup | null>;
  addUserToGroup: (
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<{ user: IUser; group: IGroup | null }>;
  removeUserFromGroup: (
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<{ user: IUser; group: IGroup | null }>;
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
  ) => Promise<IUser[]>;
}

export function createAdminGroupsHandlers(deps: AdminGroupsDeps) {
  const {
    listGroups,
    findGroupById,
    createGroup,
    updateGroupById,
    deleteGroup,
    addUserToGroup,
    removeUserFromGroup,
    findUsers,
  } = deps;

  async function listGroupsHandler(req: ServerRequest, res: Response) {
    try {
      const { search, source } = req.query as { search?: string; source?: string };
      const filter: GroupListFilter = {};
      if (source === 'local' || source === 'entra') {
        filter.source = source;
      }
      if (search && typeof search === 'string') {
        filter.search = search;
      }
      const groups = await listGroups(filter);
      return res.status(200).json({ groups });
    } catch (error) {
      logger.error('[adminGroups] listGroups error:', error);
      return res.status(500).json({ error: 'Failed to list groups' });
    }
  }

  async function getGroupHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      const group = await findGroupById(id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ group });
    } catch (error) {
      logger.error('[adminGroups] getGroup error:', error);
      return res.status(500).json({ error: 'Failed to get group' });
    }
  }

  async function createGroupHandler(req: ServerRequest, res: Response) {
    try {
      const body = req.body as CreateGroupRequest;
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const group = await createGroup({
        name: body.name.trim(),
        description: body.description,
        email: body.email,
        avatar: body.avatar,
        source: body.source || 'local',
        memberIds: body.memberIds || [],
      });
      return res.status(201).json({ group });
    } catch (error) {
      if ((error as ValidationError).name === 'ValidationError') {
        return res.status(400).json({ error: (error as ValidationError).message });
      }
      logger.error('[adminGroups] createGroup error:', error);
      return res.status(500).json({ error: 'Failed to create group' });
    }
  }

  async function updateGroupHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      const body = req.body as UpdateGroupRequest;

      if (
        body.name !== undefined &&
        (!body.name || typeof body.name !== 'string' || !body.name.trim())
      ) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }

      const existing = await findGroupById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const updateData: Partial<Pick<IGroup, 'name' | 'description' | 'email' | 'avatar'>> = {};
      if (body.name !== undefined) {
        updateData.name = body.name;
      }
      if (body.description !== undefined) {
        updateData.description = body.description;
      }
      if (body.email !== undefined) {
        updateData.email = body.email;
      }
      if (body.avatar !== undefined) {
        updateData.avatar = body.avatar;
      }

      const group = await updateGroupById(id, updateData);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ group });
    } catch (error) {
      if ((error as ValidationError).name === 'ValidationError') {
        return res.status(400).json({ error: (error as ValidationError).message });
      }
      logger.error('[adminGroups] updateGroup error:', error);
      return res.status(500).json({ error: 'Failed to update group' });
    }
  }

  async function deleteGroupHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      const existing = await findGroupById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Group not found' });
      }
      await deleteGroup(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminGroups] deleteGroup error:', error);
      return res.status(500).json({ error: 'Failed to delete group' });
    }
  }

  async function getGroupMembersHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      const group = await findGroupById(id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const memberIds = group.memberIds || [];
      if (memberIds.length === 0) {
        return res.status(200).json({ members: [] });
      }

      const validObjectIds = memberIds.filter(isValidObjectIdString);
      const conditions: FilterQuery<IUser>[] = [{ idOnTheSource: { $in: memberIds } }];
      if (validObjectIds.length > 0) {
        conditions.push({ _id: { $in: validObjectIds } });
      }
      const users = await findUsers({ $or: conditions }, 'name email avatar idOnTheSource');

      const userMap = new Map<string, IUser>();
      for (const user of users) {
        if (user.idOnTheSource) {
          userMap.set(user.idOnTheSource, user);
        }
        if (user._id) {
          userMap.set(user._id.toString(), user);
        }
      }

      const members = memberIds.map((memberId) => {
        const user = userMap.get(memberId);
        return {
          userId: user?._id?.toString() ?? memberId,
          name: user?.name ?? memberId,
          email: user?.email ?? '',
          avatarUrl: user?.avatar,
        };
      });

      return res.status(200).json({ members });
    } catch (error) {
      logger.error('[adminGroups] getGroupMembers error:', error);
      return res.status(500).json({ error: 'Failed to get group members' });
    }
  }

  async function addGroupMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      const { userId } = req.body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const { group } = await addUserToGroup(userId, id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ group });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add member';
      const isNotFound = message === 'User not found' || message.startsWith('User not found:');
      logger.error('[adminGroups] addGroupMember error:', error);
      return res.status(isNotFound ? 404 : 500).json({ error: message });
    }
  }

  async function removeGroupMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { id, userId } = req.params as GroupMemberParams;
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid group ID format' });
      }
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }
      const { group } = await removeUserFromGroup(userId, id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      const isNotFound = message === 'User not found' || message.startsWith('User not found:');
      logger.error('[adminGroups] removeGroupMember error:', error);
      return res.status(isNotFound ? 404 : 500).json({ error: message });
    }
  }

  return {
    listGroups: listGroupsHandler,
    getGroup: getGroupHandler,
    createGroup: createGroupHandler,
    updateGroup: updateGroupHandler,
    deleteGroup: deleteGroupHandler,
    getGroupMembers: getGroupMembersHandler,
    addGroupMember: addGroupMemberHandler,
    removeGroupMember: removeGroupMemberHandler,
  };
}
