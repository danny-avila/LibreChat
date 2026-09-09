import { ErrorTypes } from 'librechat-data-provider';
import { getCodeWorkspaceSelectionErrorDetails } from './errors';

describe('getCodeWorkspaceSelectionErrorDetails', () => {
  it.each(['required', 'invalid', 'worker_unavailable', 'unsupported', 'missing'] as const)(
    'preserves the allowlisted workspace reason %s',
    (reason) => {
      expect(
        getCodeWorkspaceSelectionErrorDetails({
          code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE,
          reason,
        }),
      ).toEqual({ reason });
    },
  );

  it.each([
    { code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE, reason: 'future_reason' },
    { code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE },
    { code: 'ANOTHER_ERROR', reason: 'required' },
    null,
  ])('omits unrecognized or unrelated error details', (error) => {
    expect(getCodeWorkspaceSelectionErrorDetails(error)).toEqual({});
  });
});
