import { NO_EMBEDDING_ENTITY } from '@librechat/data-schemas';
import type { EmbeddedFileRef, LegacyEntityLookup } from './embedding';
import {
  resolveEmbeddingEntityIds,
  hasRecordedEmbeddingEntity,
  getRecordedEmbeddingEntityId,
} from './embedding';

const embedded = (file_id: string, embedding_entity_id?: string): EmbeddedFileRef => ({
  file_id,
  embedded: true,
  ...(embedding_entity_id === undefined ? {} : { embedding_entity_id }),
});

describe('getRecordedEmbeddingEntityId', () => {
  it('returns the agent a knowledge-base file was embedded under', () => {
    expect(getRecordedEmbeddingEntityId(embedded('f1', 'agent_abc'))).toBe('agent_abc');
  });

  it('reads a recorded none as user-scoped rather than unknown', () => {
    const file = embedded('f1', NO_EMBEDDING_ENTITY);
    expect(hasRecordedEmbeddingEntity(file)).toBe(true);
    expect(getRecordedEmbeddingEntityId(file)).toBeUndefined();
  });

  it('reports a file predating the record as having nothing recorded', () => {
    expect(hasRecordedEmbeddingEntity(embedded('f1'))).toBe(false);
    expect(hasRecordedEmbeddingEntity(embedded('f1', ''))).toBe(false);
  });
});

describe('resolveEmbeddingEntityIds', () => {
  const neverCalled: LegacyEntityLookup = jest.fn(() => {
    throw new Error('the legacy lookup must not run for files that recorded their entity');
  });

  it('uses the recorded agent and never consults the associations', async () => {
    const resolved = await resolveEmbeddingEntityIds({
      files: [embedded('f1', 'agent_abc')],
      lookupLegacyEntityIds: neverCalled,
    });

    expect(resolved).toEqual({ f1: 'agent_abc' });
  });

  it('keeps a recorded user-scoped file unscoped even when an agent claims it', async () => {
    const lookup = jest.fn().mockResolvedValue({ f1: 'agent_adopter' });

    const resolved = await resolveEmbeddingEntityIds({
      files: [embedded('f1', NO_EMBEDDING_ENTITY)],
      lookupLegacyEntityIds: lookup,
    });

    expect(resolved).toEqual({});
    expect(lookup).not.toHaveBeenCalled();
  });

  it('ignores files that were never embedded', async () => {
    const resolved = await resolveEmbeddingEntityIds({
      files: [{ file_id: 'f1', embedded: false, embedding_entity_id: 'agent_abc' }],
      lookupLegacyEntityIds: neverCalled,
    });

    expect(resolved).toEqual({});
  });

  it('asks the legacy lookup only about files with nothing recorded', async () => {
    const lookup = jest.fn().mockResolvedValue({ legacy: 'agent_legacy' });

    const resolved = await resolveEmbeddingEntityIds({
      files: [
        embedded('recorded', 'agent_recorded'),
        embedded('userScoped', NO_EMBEDDING_ENTITY),
        embedded('legacy'),
      ],
      lookupLegacyEntityIds: lookup,
    });

    expect(lookup).toHaveBeenCalledWith({ file_ids: ['legacy'] });
    expect(resolved).toEqual({ recorded: 'agent_recorded', legacy: 'agent_legacy' });
  });

  it('skips the lookup entirely when every file recorded its entity', async () => {
    const lookup = jest.fn().mockResolvedValue({});

    await resolveEmbeddingEntityIds({
      files: [embedded('f1', 'agent_abc'), embedded('f2', NO_EMBEDDING_ENTITY)],
      lookupLegacyEntityIds: lookup,
    });

    expect(lookup).not.toHaveBeenCalled();
  });

  it('leaves legacy files user-scoped rather than blocking the delete when the lookup fails', async () => {
    const resolved = await resolveEmbeddingEntityIds({
      files: [embedded('recorded', 'agent_recorded'), embedded('legacy')],
      lookupLegacyEntityIds: jest.fn().mockRejectedValue(new Error('mongo down')),
    });

    expect(resolved).toEqual({ recorded: 'agent_recorded' });
  });
});
