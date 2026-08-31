import { buildDeleteFilesResponse, PARTIAL_FILE_DELETION_MESSAGE } from './deletion';

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
