import { logger } from '@librechat/data-schemas';
import type {
  IGroup,
  IUser,
  CreateGroupRequest,
  UpdateGroupRequest,
} from '@librechat/data-schemas';
import type { FilterQuery, Types, ClientSession } from 'mongoose';
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
  findGroupsByMemberId: (
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ) => Promise<IGroup[]>;
  findUser: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
  ) => Promise<IUser | null>;
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
    findUser,
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
      logger.error('[adminGroups] createGroup error:', error);
      return res.status(500).json({ error: 'Failed to create group' });
    }
  }

  async function updateGroupHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      const body = req.body as UpdateGroupRequest;

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
      return res.status(200).json({ group });
    } catch (error) {
      logger.error('[adminGroups] updateGroup error:', error);
      return res.status(500).json({ error: 'Failed to update group' });
    }
  }

  async function deleteGroupHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
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
      const group = await findGroupById(id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const memberIds = group.memberIds || [];
      const members = await Promise.all(
        memberIds.map(async (memberId) => {
          const user = await findUser(
            { $or: [{ idOnTheSource: memberId }, { _id: memberId }] },
            'name email avatar',
          );
          return {
            userId: user?._id?.toString() ?? memberId,
            name: user?.name ?? memberId,
            email: user?.email ?? '',
            avatarUrl: user?.avatar,
            joinedAt: group.updatedAt?.toISOString() ?? new Date().toISOString(),
          };
        }),
      );

      return res.status(200).json({ members });
    } catch (error) {
      logger.error('[adminGroups] getGroupMembers error:', error);
      return res.status(500).json({ error: 'Failed to get group members' });
    }
  }

  async function addGroupMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as GroupIdParams;
      const { userId } = req.body as { userId: string };

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }

      const { group } = await addUserToGroup(userId, id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ group });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add member';
      logger.error('[adminGroups] addGroupMember error:', error);
      return res.status(message.includes('not found') ? 404 : 500).json({ error: message });
    }
  }

  async function removeGroupMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { id, userId } = req.params as GroupMemberParams;
      const { group } = await removeUserFromGroup(userId, id);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove member';
      logger.error('[adminGroups] removeGroupMember error:', error);
      return res.status(message.includes('not found') ? 404 : 500).json({ error: message });
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
