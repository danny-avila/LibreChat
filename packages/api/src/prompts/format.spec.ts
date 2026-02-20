import { Types } from 'mongoose';
import { filterAccessibleIdsBySharedLogic } from './format';

const id = () => new Types.ObjectId();

describe('filterAccessibleIdsBySharedLogic', () => {
  const ownedA = id();
  const ownedB = id();
  const sharedC = id();
  const sharedD = id();
  const publicE = id();
  const publicF = id();

  // accessible = everything the ACL resolver says this user can see
  const accessibleIds = [ownedA, ownedB, sharedC, sharedD];
  const ownedPromptGroupIds = [ownedA, ownedB];
  const publicPromptGroupIds = [publicE, publicF];

  function toStrings(ids: Types.ObjectId[]) {
    return ids.map((i) => i.toString()).sort();
  }

  describe('MY_PROMPTS (searchShared=false)', () => {
    it('returns only owned IDs when ownedPromptGroupIds provided', async () => {
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds,
        searchShared: false,
        searchSharedOnly: false,
        publicPromptGroupIds,
        ownedPromptGroupIds,
      });
      expect(toStrings(result)).toEqual(toStrings([ownedA, ownedB]));
    });

    it('legacy fallback: excludes public IDs when ownedPromptGroupIds omitted', async () => {
      // accessible includes a public ID for this test
      const accessible = [ownedA, ownedB, publicE];
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds: accessible,
        searchShared: false,
        searchSharedOnly: false,
        publicPromptGroupIds,
      });
      // Should exclude publicE, keep ownedA and ownedB
      expect(toStrings(result)).toEqual(toStrings([ownedA, ownedB]));
    });
  });

  describe('SHARED_PROMPTS (searchSharedOnly=true)', () => {
    it('returns accessible + public minus owned when ownedPromptGroupIds provided', async () => {
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds,
        searchShared: true,
        searchSharedOnly: true,
        publicPromptGroupIds,
        ownedPromptGroupIds,
      });
      // Should include sharedC, sharedD, publicE, publicF (not ownedA, ownedB)
      expect(toStrings(result)).toEqual(toStrings([sharedC, sharedD, publicE, publicF]));
    });

    it('deduplicates when an ID appears in both accessible and public', async () => {
      const overlap = id();
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds: [ownedA, overlap],
        searchShared: true,
        searchSharedOnly: true,
        publicPromptGroupIds: [overlap, publicE],
        ownedPromptGroupIds: [ownedA],
      });
      // overlap should appear once, not twice
      expect(toStrings(result)).toEqual(toStrings([overlap, publicE]));
    });

    it('legacy fallback: returns intersection of public and accessible when ownedPromptGroupIds omitted', async () => {
      // publicE is also accessible
      const accessible = [ownedA, publicE];
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds: accessible,
        searchShared: true,
        searchSharedOnly: true,
        publicPromptGroupIds: [publicE, publicF],
      });
      // Only publicE is in both accessible and public
      expect(toStrings(result)).toEqual(toStrings([publicE]));
    });

    it('legacy fallback: returns empty when no public IDs', async () => {
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds,
        searchShared: true,
        searchSharedOnly: true,
        publicPromptGroupIds: [],
      });
      expect(result).toEqual([]);
    });
  });

  describe('ALL (searchShared=true, searchSharedOnly=false)', () => {
    it('returns union of accessible + public, deduplicated', async () => {
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds,
        searchShared: true,
        searchSharedOnly: false,
        publicPromptGroupIds,
        ownedPromptGroupIds,
      });
      expect(toStrings(result)).toEqual(
        toStrings([ownedA, ownedB, sharedC, sharedD, publicE, publicF]),
      );
    });

    it('deduplicates overlapping IDs', async () => {
      const overlap = id();
      const result = await filterAccessibleIdsBySharedLogic({
        accessibleIds: [ownedA, overlap],
        searchShared: true,
        searchSharedOnly: false,
        publicPromptGroupIds: [overlap, publicE],
        ownedPromptGroupIds,
      });
      expect(toStrings(result)).toEqual(toStrings([ownedA, overlap, publicE]));
    });
  });
});
