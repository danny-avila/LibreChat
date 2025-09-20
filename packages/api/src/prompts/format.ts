import { SystemCategories } from 'librechat-data-provider';
import type { IPromptGroupDocument as IPromptGroup } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { PromptGroupsListResponse } from '~/types';

/**
 * Formats prompt groups for the paginated /groups endpoint response
 */
export function formatPromptGroupsResponse({
  promptGroups = [],
  pageNumber,
  pageSize,
  actualLimit,
  hasMore = false,
  after = null,
}: {
  promptGroups: IPromptGroup[];
  pageNumber?: string;
  pageSize?: string;
  actualLimit?: string | number;
  hasMore?: boolean;
  after?: string | null;
}): PromptGroupsListResponse {
  const currentPage = parseInt(pageNumber || '1');

  // Calculate total pages based on whether there are more results
  // If hasMore is true, we know there's at least one more page
  // We use a high number (9999) to indicate "many pages" since we don't know the exact count
  const totalPages = hasMore ? '9999' : currentPage.toString();

  return {
    promptGroups,
    pageNumber: pageNumber || '1',
    pageSize: pageSize || String(actualLimit) || '10',
    pages: totalPages,
    has_more: hasMore,
    after,
  };
}

/**
 * Creates an empty response for the paginated /groups endpoint
 */
export function createEmptyPromptGroupsResponse({
  pageNumber,
  pageSize,
  actualLimit,
}: {
  pageNumber?: string;
  pageSize?: string;
  actualLimit?: string | number;
}): PromptGroupsListResponse {
  return {
    promptGroups: [],
    pageNumber: pageNumber || '1',
    pageSize: pageSize || String(actualLimit) || '10',
    pages: '0',
    has_more: false,
    after: null,
  };
}

/**
 * Marks prompt groups as public based on the publicly accessible IDs
 */
export function markPublicPromptGroups(
  promptGroups: IPromptGroup[],
  publiclyAccessibleIds: Types.ObjectId[],
): IPromptGroup[] {
  if (!promptGroups.length) {
    return [];
  }

  return promptGroups.map((group) => {
    const isPublic = publiclyAccessibleIds.some((id) => id.equals(group._id?.toString()));
    return isPublic ? ({ ...group, isPublic: true } as IPromptGroup) : group;
  });
}

/**
 * Builds filter object for prompt group queries
 */
export function buildPromptGroupFilter({
  name,
  category,
  ...otherFilters
}: {
  name?: string;
  category?: string;
  [key: string]: string | number | boolean | RegExp | undefined;
}): {
  filter: Record<string, string | number | boolean | RegExp | undefined>;
  searchShared: boolean;
  searchSharedOnly: boolean;
} {
  const filter: Record<string, string | number | boolean | RegExp | undefined> = {
    ...otherFilters,
  };
  let searchShared = true;
  let searchSharedOnly = false;

  // Handle name filter - convert to regex for case-insensitive search
  if (name) {
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = new RegExp(escapeRegExp(name), 'i');
  }

  // Handle category filters with special system categories
  if (category === SystemCategories.MY_PROMPTS) {
    searchShared = false;
  } else if (category === SystemCategories.NO_CATEGORY) {
    filter.category = '';
  } else if (category === SystemCategories.SHARED_PROMPTS) {
    searchSharedOnly = true;
  } else if (category) {
    filter.category = category;
  }

  return { filter, searchShared, searchSharedOnly };
}

/**
 * Filters accessible IDs based on shared/public prompts logic
 */
export async function filterAccessibleIdsBySharedLogic({
  accessibleIds,
  searchShared,
  searchSharedOnly,
  publicPromptGroupIds,
}: {
  accessibleIds: Types.ObjectId[];
  searchShared: boolean;
  searchSharedOnly: boolean;
  publicPromptGroupIds?: Types.ObjectId[];
}): Promise<Types.ObjectId[]> {
  const publicIdStrings = new Set((publicPromptGroupIds || []).map((id) => id.toString()));

  if (!searchShared) {
    // For MY_PROMPTS - exclude public prompts to show only user's own prompts
    return accessibleIds.filter((id) => !publicIdStrings.has(id.toString()));
  }

  if (searchSharedOnly) {
    // Handle SHARED_PROMPTS filter - only return public prompts that user has access to
    if (!publicPromptGroupIds?.length) {
      return [];
    }
    const accessibleIdStrings = new Set(accessibleIds.map((id) => id.toString()));
    return publicPromptGroupIds.filter((id) => accessibleIdStrings.has(id.toString()));
  }

  return [...accessibleIds, ...(publicPromptGroupIds || [])];
}
