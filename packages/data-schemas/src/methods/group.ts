import type { Model, Types, DeleteResult } from 'mongoose';
import type { IGroup } from '~/types';

export function createGroupMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find a group by its ID
   * @param groupId - The group ID
   * @returns The group document or null if not found
   */
  async function findGroupById(groupId: string | Types.ObjectId): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.findById(groupId).lean();
  }

  /**
   * Create a new group
   * @param groupData - Group data including name, source, and optional fields
   * @returns The created group
   */
  async function createGroup(groupData: Partial<IGroup>): Promise<IGroup> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.create(groupData);
  }

  /**
   * Update an existing group
   * @param groupId - The ID of the group to update
   * @param updateData - Data to update
   * @returns The updated group document or null if not found
   */
  async function updateGroup(
    groupId: string | Types.ObjectId,
    updateData: Partial<IGroup>,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.findByIdAndUpdate(groupId, { $set: updateData }, { new: true }).lean();
  }

  /**
   * Delete a group
   * @param groupId - The ID of the group to delete
   * @returns The result of the delete operation
   */
  async function deleteGroup(groupId: string | Types.ObjectId): Promise<DeleteResult> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.deleteOne({ _id: groupId });
  }

  /**
   * Find all groups
   * @returns Array of all group documents
   */
  async function getAllGroups(): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.find().lean();
  }

  /**
   * Find groups by source
   * @param source - The source ('local' or 'entra')
   * @returns Array of group documents
   */
  async function findGroupsBySource(source: 'local' | 'entra'): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.find({ source }).lean();
  }

  /**
   * Find a group by its external ID
   * @param idOnTheSource - The external ID
   * @param source - The source ('entra' or 'local')
   * @returns The group document or null if not found
   */
  async function findGroupByExternalId(
    idOnTheSource: string,
    source: 'local' | 'entra' = 'entra',
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.findOne({ idOnTheSource, source }).lean();
  }

  /**
   * Add a member to a group
   * @param groupId - The group ID
   * @param memberId - The member ID to add (idOnTheSource value)
   * @returns The updated group or null if not found
   */
  async function addMemberToGroup(
    groupId: string | Types.ObjectId,
    memberId: string,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { memberIds: memberId } },
      { new: true },
    ).lean();
  }

  /**
   * Remove a member from a group
   * @param groupId - The group ID
   * @param memberId - The member ID to remove (idOnTheSource value)
   * @returns The updated group or null if not found
   */
  async function removeMemberFromGroup(
    groupId: string | Types.ObjectId,
    memberId: string,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.findByIdAndUpdate(
      groupId,
      { $pull: { memberIds: memberId } },
      { new: true },
    ).lean();
  }

  /**
   * Find all groups that contain a specific member
   * @param memberId - The member ID (idOnTheSource value)
   * @returns Array of groups containing the member
   */
  async function findGroupsByMemberId(memberId: string): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    return await Group.find({ memberIds: memberId }).lean();
  }

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    getAllGroups,
    findGroupById,
    addMemberToGroup,
    findGroupsBySource,
    removeMemberFromGroup,
    findGroupsByMemberId,
    findGroupByExternalId,
  };
}

export type GroupMethods = ReturnType<typeof createGroupMethods>;
