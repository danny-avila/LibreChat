import { FileContext } from 'librechat-data-provider';
import type { IAgent } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import type { THasEntityEmbeddings } from '~/agents/resources';

export type EntityFile = Pick<TFile, 'file_id' | 'filename' | 'context' | 'metadata'>;

type FileSearchAgent = Pick<IAgent, 'id' | 'tool_resources'>;

export type TGetFileSearchAgents = (
  filter: { 'tool_resources.file_search.file_ids': { $in: string[] } },
  select: { id: 1; 'tool_resources.file_search.file_ids': 1 },
) => Promise<FileSearchAgent[] | null>;

interface EntityResolverOptions {
  /** The requesting user, who is always the file's uploader on this path. */
  userId: string;
  getAgents?: TGetFileSearchAgents;
  hasEntityEmbeddings?: THasEntityEmbeddings;
  timeoutMs?: number;
}

const isAgentId = (id: string): boolean => id.startsWith('agent_');

/**
 * Finds the agents whose File Search lists each file. Lookups requested in the same tick
 * share one query, so a turn with several legacy files costs a single round trip.
 */
function createListingLookup(getAgents?: TGetFileSearchAgents) {
  let pending: { fileIds: Set<string>; listings: Promise<Map<string, string[]>> } | undefined;

  const load = async (fileIds: Set<string>): Promise<Map<string, string[]>> => {
    pending = undefined;
    const agents =
      (await getAgents?.(
        { 'tool_resources.file_search.file_ids': { $in: [...fileIds] } },
        { id: 1, 'tool_resources.file_search.file_ids': 1 },
      )) ?? [];
    const listings = new Map<string, string[]>();
    for (const agent of agents) {
      for (const fileId of agent.tool_resources?.file_search?.file_ids ?? []) {
        if (fileIds.has(fileId)) {
          listings.set(fileId, [...(listings.get(fileId) ?? []), agent.id]);
        }
      }
    }
    return listings;
  };

  return async (fileId: string): Promise<string[]> => {
    if (!getAgents) {
      return [];
    }
    if (!pending) {
      const fileIds = new Set<string>();
      pending = { fileIds, listings: Promise.resolve(fileIds).then(load) };
    }
    pending.fileIds.add(fileId);
    const listings = await pending.listings;
    return [...(listings.get(fileId) ?? [])].sort();
  };
}

/**
 * Resolves the agent namespace that holds a file's vectors, for files first embedded into
 * an agent's File Search and later attached outside that agent's chat.
 * Resolves `undefined` when the file belongs to no agent namespace.
 */
export function createEntityResolver({
  userId,
  getAgents,
  hasEntityEmbeddings,
  timeoutMs,
}: EntityResolverOptions): (file: EntityFile) => Promise<string | undefined> {
  const listedBy = createListingLookup(getAgents);

  const candidatesFor = async (file: EntityFile): Promise<string[]> => {
    const recorded = file.metadata?.embeddedEntities;
    if (recorded != null) {
      return recorded.filter(isAgentId).sort();
    }
    if (file.context !== FileContext.agents) {
      return [];
    }
    return listedBy(file.file_id);
  };

  const holdsVectors = (file: EntityFile, entity_id: string): Promise<boolean> =>
    hasEntityEmbeddings
      ? hasEntityEmbeddings({
          userId,
          file_id: file.file_id,
          entity_id,
          query: file.filename || file.file_id,
          timeoutMs,
        }).catch(() => false)
      : Promise.resolve(false);

  return async (file) => {
    const candidates = await candidatesFor(file);
    if (candidates.length <= 1 || !hasEntityEmbeddings) {
      return candidates[0];
    }
    const held = await Promise.all(candidates.map((candidate) => holdsVectors(file, candidate)));
    return candidates[held.indexOf(true)] ?? candidates[0];
  };
}
