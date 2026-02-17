import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { TUser, TPrincipalSearchResult } from 'librechat-data-provider';
import type { Model, ClientSession } from 'mongoose';
import type { IGroup, IRole, IUser } from '~/types';

export function createUserGroupMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find a group by its ID
   * @param groupId - The group ID
   * @param projection - Optional projection of fields to return
   * @param session - Optional MongoDB session for transactions
   * @returns The group document or null if not found
   */
  async function findGroupById(
    groupId: string | Types.ObjectId,
    projection: Record<string, unknown> = {},
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = Group.findOne({ _id: groupId }, projection);
    if (session) {
      query.session(session);
    }
    return await query.lean();
  }

  /**
   * Find a group by its external ID (e.g., Entra ID)
   * @param idOnTheSource - The external ID
   * @param source - The source ('entra' or 'local')
   * @param projection - Optional projection of fields to return
   * @param session - Optional MongoDB session for transactions
   * @returns The group document or null if not found
   */
  async function findGroupByExternalId(
    idOnTheSource: string,
    source: 'entra' | 'local' = 'entra',
    projection: Record<string, unknown> = {},
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = Group.findOne({ idOnTheSource, source }, projection);
    if (session) {
      query.session(session);
    }
    return await query.lean();
  }

  /**
   * Find groups by name pattern (case-insensitive partial match)
   * @param namePattern - The name pattern to search for
   * @param source - Optional source filter ('entra', 'local', or null for all)
   * @param limit - Maximum number of results to return
   * @param session - Optional MongoDB session for transactions
   * @returns Array of matching groups
   */
  async function findGroupsByNamePattern(
    namePattern: string,
    source: 'entra' | 'local' | null = null,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const regex = new RegExp(namePattern, 'i');
    const query: Record<string, unknown> = {
      $or: [{ name: regex }, { email: regex }, { description: regex }],
    };

    if (source) {
      query.source = source;
    }

    const dbQuery = Group.find(query).limit(limit);
    if (session) {
      dbQuery.session(session);
    }
    return await dbQuery.lean();
  }

  /**
   * Find all groups a user is a member of by their ID or idOnTheSource
   * @param userId - The user ID
   * @param session - Optional MongoDB session for transactions
   * @returns Array of groups the user is a member of
   */
  async function findGroupsByMemberId(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const userQuery = User.findById(userId, 'idOnTheSource');
    if (session) {
      userQuery.session(session);
    }
    const user = (await userQuery.lean()) as { idOnTheSource?: string } | null;

    if (!user) {
      return [];
    }

    const userIdOnTheSource = user.idOnTheSource || userId.toString();

    const query = Group.find({ memberIds: userIdOnTheSource });
    if (session) {
      query.session(session);
    }
    return await query.lean();
  }

  /**
   * Create a new group
   * @param groupData - Group data including name, source, and optional idOnTheSource
   * @param session - Optional MongoDB session for transactions
   * @returns The created group
   */
  async function createGroup(groupData: Partial<IGroup>, session?: ClientSession): Promise<IGroup> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = session ? { session } : {};
    return await Group.create([groupData], options).then((groups) => groups[0]);
  }

  /**
   * Update or create a group by external ID
   * @param idOnTheSource - The external ID
   * @param source - The source ('entra' or 'local')
   * @param updateData - Data to update or set if creating
   * @param session - Optional MongoDB session for transactions
   * @returns The updated or created group
   */
  async function upsertGroupByExternalId(
    idOnTheSource: string,
    source: 'entra' | 'local',
    updateData: Partial<IGroup>,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = {
      new: true,
      upsert: true,
      ...(session ? { session } : {}),
    };

    return await Group.findOneAndUpdate({ idOnTheSource, source }, { $set: updateData }, options);
  }

  /**
   * Add a user to a group
   * Only updates Group.memberIds (one-way relationship)
   * Note: memberIds stores idOnTheSource values, not ObjectIds
   *
   * @param userId - The user ID
   * @param groupId - The group ID to add
   * @param session - Optional MongoDB session for transactions
   * @returns The user and updated group documents
   */
  async function addUserToGroup(
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const options = { new: true, ...(session ? { session } : {}) };

    const user = (await User.findById(userId, 'idOnTheSource', options).lean()) as {
      idOnTheSource?: string;
      _id: Types.ObjectId;
    } | null;
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const userIdOnTheSource = user.idOnTheSource || userId.toString();
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { memberIds: userIdOnTheSource } },
      options,
    ).lean();

    return { user: user as IUser, group: updatedGroup };
  }

  /**
   * Remove a user from a group
   * Only updates Group.memberIds (one-way relationship)
   * Note: memberIds stores idOnTheSource values, not ObjectIds
   *
   * @param userId - The user ID
   * @param groupId - The group ID to remove
   * @param session - Optional MongoDB session for transactions
   * @returns The user and updated group documents
   */
  async function removeUserFromGroup(
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const options = { new: true, ...(session ? { session } : {}) };

    const user = (await User.findById(userId, 'idOnTheSource', options).lean()) as {
      idOnTheSource?: string;
      _id: Types.ObjectId;
    } | null;
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const userIdOnTheSource = user.idOnTheSource || userId.toString();
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pullAll: { memberIds: [userIdOnTheSource] } },
      options,
    ).lean();

    return { user: user as IUser, group: updatedGroup };
  }

  /**
   * Get all groups a user is a member of
   * @param userId - The user ID
   * @param session - Optional MongoDB session for transactions
   * @returns Array of group documents
   */
  async function getUserGroups(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    return await findGroupsByMemberId(userId, session);
  }

  /**
   * Get a list of all principal identifiers for a user (user ID + group IDs + public)
   * For use in permission checks
   * @param params - Parameters object
   * @param params.userId - The user ID
   * @param params.role - Optional user role (if not provided, will query from DB)
   * @param session - Optional MongoDB session for transactions
   * @returns Array of principal objects with type and id
   */
  async function getUserPrincipals(
    params: {
      userId: string | Types.ObjectId;
      role?: string | null;
    },
    session?: ClientSession,
  ): Promise<Array<{ principalType: string; principalId?: string | Types.ObjectId }>> {
    const { userId, role } = params;
    /** `userId` must be an `ObjectId` for USER principal since ACL entries store `ObjectId`s */
    const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const principals: Array<{ principalType: string; principalId?: string | Types.ObjectId }> = [
      { principalType: PrincipalType.USER, principalId: userObjectId },
    ];

    // If role is not provided, query user to get it
    let userRole = role;
    if (userRole === undefined) {
      const User = mongoose.models.User as Model<IUser>;
      const query = User.findById(userId).select('role');
      if (session) {
        query.session(session);
      }
      const user = await query.lean();
      userRole = user?.role;
    }

    // Add role as a principal if user has one
    if (userRole && userRole.trim()) {
      principals.push({ principalType: PrincipalType.ROLE, principalId: userRole });
    }

    const userGroups = await getUserGroups(userId, session);
    if (userGroups && userGroups.length > 0) {
      userGroups.forEach((group) => {
        principals.push({ principalType: PrincipalType.GROUP, principalId: group._id });
      });
    }

    principals.push({ principalType: PrincipalType.PUBLIC });

    return principals;
  }

  /**
   * Sync a user's Entra ID group memberships
   * @param userId - The user ID
   * @param entraGroups - Array of Entra groups with id and name
   * @param session - Optional MongoDB session for transactions
   * @returns The updated user with new group memberships
   */
  async function syncUserEntraGroups(
    userId: string | Types.ObjectId,
    entraGroups: Array<{ id: string; name: string; description?: string; email?: string }>,
    session?: ClientSession,
  ): Promise<{
    user: IUser;
    addedGroups: IGroup[];
    removedGroups: IGroup[];
  }> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const query = User.findById(userId, { idOnTheSource: 1 });
    if (session) {
      query.session(session);
    }
    const user = (await query.lean()) as { idOnTheSource?: string; _id: Types.ObjectId } | null;

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    /** Get user's idOnTheSource for storing in group.memberIds */
    const userIdOnTheSource = user.idOnTheSource || userId.toString();

    const entraIdMap = new Map<string, boolean>();
    const addedGroups: IGroup[] = [];
    const removedGroups: IGroup[] = [];

    for (const entraGroup of entraGroups) {
      entraIdMap.set(entraGroup.id, true);

      let group = await findGroupByExternalId(entraGroup.id, 'entra', {}, session);

      if (!group) {
        group = await createGroup(
          {
            name: entraGroup.name,
            description: entraGroup.description,
            email: entraGroup.email,
            idOnTheSource: entraGroup.id,
            source: 'entra',
            memberIds: [userIdOnTheSource],
          },
          session,
        );

        addedGroups.push(group);
      } else if (!group.memberIds?.includes(userIdOnTheSource)) {
        const { group: updatedGroup } = await addUserToGroup(userId, group._id, session);
        if (updatedGroup) {
          addedGroups.push(updatedGroup);
        }
      }
    }

    const groupsQuery = Group.find(
      { source: 'entra', memberIds: userIdOnTheSource },
      { _id: 1, idOnTheSource: 1 },
    );
    if (session) {
      groupsQuery.session(session);
    }
    const existingGroups = (await groupsQuery.lean()) as Array<{
      _id: Types.ObjectId;
      idOnTheSource?: string;
    }>;

    for (const group of existingGroups) {
      if (group.idOnTheSource && !entraIdMap.has(group.idOnTheSource)) {
        const { group: removedGroup } = await removeUserFromGroup(userId, group._id, session);
        if (removedGroup) {
          removedGroups.push(removedGroup);
        }
      }
    }

    const userQuery = User.findById(userId);
    if (session) {
      userQuery.session(session);
    }
    const updatedUser = await userQuery.lean();

    if (!updatedUser) {
      throw new Error(`User not found after update: ${userId}`);
    }

    return {
      user: updatedUser,
      addedGroups,
      removedGroups,
    };
  }

  /**
   * Calculate relevance score for a search result
   * @param item - The search result item
   * @param searchPattern - The search pattern
   * @returns Relevance score (0-100)
   */
  function calculateRelevanceScore(item: TPrincipalSearchResult, searchPattern: string): number {
    const exactRegex = new RegExp(`^${searchPattern}$`, 'i');
    const startsWithPattern = searchPattern.toLowerCase();

    /** Get searchable text based on type */
    const searchableFields =
      item.type === PrincipalType.USER
        ? [item.name, item.email, item.username].filter(Boolean)
        : [item.name, item.email, item.description].filter(Boolean);

    let maxScore = 0;

    for (const field of searchableFields) {
      if (!field) continue;
      const fieldLower = field.toLowerCase();
      let score = 0;

      /** Exact match gets highest score */
      if (exactRegex.test(field)) {
        score = 100;
      } else if (fieldLower.startsWith(startsWithPattern)) {
        /** Starts with query gets high score */
        score = 80;
      } else if (fieldLower.includes(startsWithPattern)) {
        /** Contains query gets medium score */
        score = 50;
      } else {
        /** Default score for regex match */
        score = 10;
      }

      maxScore = Math.max(maxScore, score);
    }

    return maxScore;
  }

  /**
   * Sort principals by relevance score and type priority
   * @param results - Array of results with _searchScore property
   * @returns Sorted array
   */
  function sortPrincipalsByRelevance<
    T extends { _searchScore?: number; type: string; name?: string; email?: string },
  >(results: T[]): T[] {
    return results.sort((a, b) => {
      if (b._searchScore !== a._searchScore) {
        return (b._searchScore || 0) - (a._searchScore || 0);
      }
      if (a.type !== b.type) {
        return a.type === PrincipalType.USER ? -1 : 1;
      }
      const aName = a.name || a.email || '';
      const bName = b.name || b.email || '';
      return aName.localeCompare(bName);
    });
  }

  /**
   * Transform user object to TPrincipalSearchResult format
   * @param user - User object from database
   * @returns Transformed user result
   */
  function transformUserToTPrincipalSearchResult(user: TUser): TPrincipalSearchResult {
    return {
      id: user.id,
      type: PrincipalType.USER,
      name: user.name || user.email,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      provider: user.provider,
      source: 'local',
      idOnTheSource: (user as TUser & { idOnTheSource?: string }).idOnTheSource || user.id,
    };
  }

  /**
   * Transform group object to TPrincipalSearchResult format
   * @param group - Group object from database
   * @returns Transformed group result
   */
  function transformGroupToTPrincipalSearchResult(group: IGroup): TPrincipalSearchResult {
    return {
      id: group._id?.toString(),
      type: PrincipalType.GROUP,
      name: group.name,
      email: group.email,
      avatar: group.avatar,
      description: group.description,
      source: group.source || 'local',
      memberCount: group.memberIds ? group.memberIds.length : 0,
      idOnTheSource: group.idOnTheSource || group._id?.toString(),
    };
  }

  /**
   * Search for principals (users and groups) by pattern matching on name/email
   * Returns combined results in TPrincipalSearchResult format without sorting
   * @param searchPattern - The pattern to search for
   * @param limitPerType - Maximum number of results to return
   * @param typeFilter - Optional array of types to filter by, or null for all types
   * @param session - Optional MongoDB session for transactions
   * @returns Array of principals in TPrincipalSearchResult format
   */
  async function searchPrincipals(
    searchPattern: string,
    limitPerType: number = 10,
    typeFilter: Array<PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE> | null = null,
    session?: ClientSession,
  ): Promise<TPrincipalSearchResult[]> {
    if (!searchPattern || searchPattern.trim().length === 0) {
      return [];
    }

    const trimmedPattern = searchPattern.trim();
    const promises: Promise<TPrincipalSearchResult[]>[] = [];

    if (!typeFilter || typeFilter.includes(PrincipalType.USER)) {
      /** Note: searchUsers is imported from ~/models and needs to be passed in or implemented */
      const userFields = 'name email username avatar provider idOnTheSource';
      /** For now, we'll use a direct query instead of searchUsers */
      const User = mongoose.models.User as Model<IUser>;
      const regex = new RegExp(trimmedPattern, 'i');
      const userQuery = User.find({
        $or: [{ name: regex }, { email: regex }, { username: regex }],
      })
        .select(userFields)
        .limit(limitPerType);

      if (session) {
        userQuery.session(session);
      }

      promises.push(
        userQuery.lean().then((users) =>
          users.map((user) => {
            const userWithId = user as IUser & { idOnTheSource?: string };
            return transformUserToTPrincipalSearchResult({
              id: userWithId._id?.toString() || '',
              name: userWithId.name,
              email: userWithId.email,
              username: userWithId.username,
              avatar: userWithId.avatar,
              provider: userWithId.provider,
            } as TUser);
          }),
        ),
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (!typeFilter || typeFilter.includes(PrincipalType.GROUP)) {
      promises.push(
        findGroupsByNamePattern(trimmedPattern, null, limitPerType, session).then((groups) =>
          groups.map(transformGroupToTPrincipalSearchResult),
        ),
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (!typeFilter || typeFilter.includes(PrincipalType.ROLE)) {
      const Role = mongoose.models.Role as Model<IRole>;
      if (Role) {
        const regex = new RegExp(trimmedPattern, 'i');
        const roleQuery = Role.find({ name: regex }).select('name').limit(limitPerType);

        if (session) {
          roleQuery.session(session);
        }

        promises.push(
          roleQuery.lean().then((roles) =>
            roles.map((role) => ({
              /** Role name as ID */
              id: role.name,
              type: PrincipalType.ROLE,
              name: role.name,
              source: 'local' as const,
              idOnTheSource: role.name,
            })),
          ),
        );
      }
    } else {
      promises.push(Promise.resolve([]));
    }

    const results = await Promise.all(promises);
    const combined = results.flat();
    return combined;
  }

  /**
   * Removes a user from all groups they belong to.
   * @param userId - The user ID (or ObjectId) of the member to remove
   */
  async function removeUserFromAllGroups(userId: string | Types.ObjectId): Promise<void> {
    const Group = mongoose.models.Group as Model<IGroup>;
    await Group.updateMany({ memberIds: userId }, { $pullAll: { memberIds: [userId] } });
  }

  /**
   * Finds a single group matching the given filter.
   * @param filter - MongoDB filter query
   */
  async function findGroupByQuery(
    filter: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = Group.findOne(filter);
    if (session) {
      query.session(session);
    }
    return query.lean();
  }

  /**
   * Updates a group by its ID.
   * @param groupId - The group's ObjectId
   * @param data - Fields to set via $set
   */
  async function updateGroupById(
    groupId: string | Types.ObjectId,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = { new: true, ...(session ? { session } : {}) };
    return Group.findByIdAndUpdate(groupId, { $set: data }, options).lean();
  }

  /**
   * Bulk-updates groups matching a filter.
   * @param filter - MongoDB filter query
   * @param update - Update operations
   * @param options - Optional query options (e.g., { session })
   */
  async function bulkUpdateGroups(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { session?: ClientSession },
  ) {
    const Group = mongoose.models.Group as Model<IGroup>;
    return Group.updateMany(filter, update, options || {});
  }

  return {
    findGroupById,
    findGroupByExternalId,
    findGroupsByNamePattern,
    findGroupsByMemberId,
    createGroup,
    upsertGroupByExternalId,
    addUserToGroup,
    removeUserFromGroup,
    removeUserFromAllGroups,
    findGroupByQuery,
    updateGroupById,
    bulkUpdateGroups,
    getUserGroups,
    getUserPrincipals,
    syncUserEntraGroups,
    searchPrincipals,
    calculateRelevanceScore,
    sortPrincipalsByRelevance,
  };
}

export type UserGroupMethods = ReturnType<typeof createUserGroupMethods>;
