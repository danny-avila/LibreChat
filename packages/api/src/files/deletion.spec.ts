import {
  buildDeleteFilesResponse,
  partitionAgentResourceFiles,
  PARTIAL_FILE_DELETION_MESSAGE,
} from './deletion';

describe('delete files response', () => {
  it('reports the caller’s success message when nothing failed', () => {
    expect(
      buildDeleteFilesResponse({ deletedFileIds: ['file-1'], failedFileIds: [] }, 'All gone'),
    ).toEqual({
      message: 'All gone',
      deletedFileIds: ['file-1'],
      failedFileIds: [],
    });
  });

  it('names the partial failure so a 200 is not read as a clean delete', () => {
    expect(
      buildDeleteFilesResponse(
        { deletedFileIds: ['file-1'], failedFileIds: ['file-2'] },
        'All gone',
      ),
    ).toEqual({
      message: PARTIAL_FILE_DELETION_MESSAGE,
      deletedFileIds: ['file-1'],
      failedFileIds: ['file-2'],
    });
  });

  it('answers with empty lists when there was nothing to delete', () => {
    expect(buildDeleteFilesResponse(undefined, 'All gone')).toEqual({
      message: 'All gone',
      deletedFileIds: [],
      failedFileIds: [],
    });
  });
});

describe('partition agent resource files', () => {
  const userId = 'user-1';
  const owned = { file_id: 'owned', user: userId };
  const foreign = { file_id: 'foreign', user: 'user-2' };

  it('sends an attached file the caller owns through the full delete pass', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['owned'],
        attachedFileIds: ['owned'],
        fileRecords: [owned],
        toolResource: 'file_search',
        userId,
      }),
    ).toEqual({ ownedFiles: [owned], unlinkOnlyFiles: [] });
  });

  it('only unlinks an attached file owned by someone else', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['foreign'],
        attachedFileIds: ['foreign'],
        fileRecords: [foreign],
        toolResource: 'file_search',
        userId,
      }),
    ).toEqual({
      ownedFiles: [],
      unlinkOnlyFiles: [{ tool_resource: 'file_search', file_id: 'foreign' }],
    });
  });

  it('only unlinks an attached file whose metadata record is gone', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['missing'],
        attachedFileIds: ['missing'],
        fileRecords: [],
        toolResource: 'file_search',
        userId,
      }),
    ).toEqual({
      ownedFiles: [],
      unlinkOnlyFiles: [{ tool_resource: 'file_search', file_id: 'missing' }],
    });
  });

  it('ignores files the tool resource does not hold', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['owned', 'elsewhere'],
        attachedFileIds: ['owned'],
        fileRecords: [owned, { file_id: 'elsewhere', user: userId }],
        toolResource: 'file_search',
        userId,
      }),
    ).toEqual({ ownedFiles: [owned], unlinkOnlyFiles: [] });
  });

  it('splits a mixed request and counts each file once', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['owned', 'foreign', 'owned'],
        attachedFileIds: ['owned', 'foreign'],
        fileRecords: [owned, foreign],
        toolResource: 'ocr',
        userId,
      }),
    ).toEqual({
      ownedFiles: [owned],
      unlinkOnlyFiles: [{ tool_resource: 'ocr', file_id: 'foreign' }],
    });
  });

  it('compares an ObjectId owner by value', () => {
    const record = { file_id: 'owned', user: { toString: () => userId } };
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['owned'],
        attachedFileIds: ['owned'],
        fileRecords: [record],
        toolResource: 'file_search',
        userId,
      }).ownedFiles,
    ).toEqual([record]);
  });

  it('does not treat an ownerless record as the caller’s', () => {
    expect(
      partitionAgentResourceFiles({
        requestedFileIds: ['orphan'],
        attachedFileIds: ['orphan'],
        fileRecords: [{ file_id: 'orphan' }],
        toolResource: 'file_search',
        userId,
      }),
    ).toEqual({
      ownedFiles: [],
      unlinkOnlyFiles: [{ tool_resource: 'file_search', file_id: 'orphan' }],
    });
  });
});
