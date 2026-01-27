jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: jest.fn(),
}));

import { apiBaseUrl } from 'librechat-data-provider';
import { buildShareLinkUrl } from '../share';

describe('buildShareLinkUrl', () => {
  it('includes the base path for subdirectory deployments', () => {
    (apiBaseUrl as jest.Mock).mockReturnValue('/librechat');
    expect(buildShareLinkUrl('reW8SsFGQEH1b1uzSHe4I')).toBe(
      'http://localhost:3080/librechat/share/reW8SsFGQEH1b1uzSHe4I',
    );
  });

  it('works when base path is root', () => {
    (apiBaseUrl as jest.Mock).mockReturnValue('');
    expect(buildShareLinkUrl('reW8SsFGQEH1b1uzSHe4I')).toBe(
      'http://localhost:3080/share/reW8SsFGQEH1b1uzSHe4I',
    );
  });
});
