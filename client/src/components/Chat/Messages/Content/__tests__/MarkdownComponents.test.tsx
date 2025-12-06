/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { a } from '../MarkdownComponents';
import * as useFileDownloadModule from '~/data-provider';
import * as useToastContextModule from '@librechat/client';
import * as useLocalizeModule from '~/hooks';
import { dataService } from 'librechat-data-provider';

// Mock all the complex dependencies
jest.mock('~/components/Messages/Content/CodeBlock', () => ({
  __esModule: true,
  default: () => <div>CodeBlock</div>,
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

jest.mock('~/Providers', () => ({
  useCodeBlockContext: jest.fn(() => ({
    getNextIndex: jest.fn(() => 0),
    resetCounter: jest.fn(),
  })),
}));

jest.mock('~/utils', () => ({
  handleDoubleClick: jest.fn(),
}));

jest.mock('~/store', () => ({
  user: null,
}));

jest.mock('~/data-provider', () => ({
  useFileDownload: jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  dataService: {
    getDomainServerBaseUrl: jest.fn(),
  },
  PermissionTypes: {},
  Permissions: {},
  fileConfig: {
    checkType: jest.fn(),
  },
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn(),
}));

import { useRecoilValue } from 'recoil';

describe('MarkdownComponents - Link (a) Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
  };

  const mockDownloadFile = jest.fn();
  const mockShowToast = jest.fn();
  const mockLocalize = jest.fn((key) => key);

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    (useRecoilValue as jest.Mock).mockReturnValue(mockUser);
    (useToastContextModule.useToastContext as jest.Mock).mockReturnValue({
      showToast: mockShowToast,
    });
    (useLocalizeModule.useLocalize as jest.Mock).mockReturnValue(mockLocalize);
    (dataService.getDomainServerBaseUrl as jest.Mock).mockReturnValue('http://localhost:3080');
    (useFileDownloadModule.useFileDownload as jest.Mock).mockReturnValue({
      refetch: mockDownloadFile,
    });
  });

  /**
   * This test verifies the file_id extraction bug in markdown file links.
   *
   * BUG: The current implementation uses .pop() twice which extracts values in reverse order:
   *   - URL format: files/{userId}/{fileId}  (3 parts total)
   *   - parts = ['files', 'user-123', 'file-abc-123']
   *   - parts.pop() returns 'file-abc-123' (assigned to filename) - should be file_id!
   *   - parts.pop() returns 'user-123' (assigned to file_id) - this is the userId!
   *
   * EXPECTED: useFileDownload should be called with file_id='file-abc-123'
   * ACTUAL (BUG): useFileDownload is called with file_id='user-123' (the userId!)
   *
   * This test will FAIL with the current buggy code and PASS after the fix.
   */
  it('should extract correct file_id from markdown file link path', () => {
    const testFileId = 'file-abc-123';
    // The URL format is: files/{userId}/{fileId} - no separate filename!
    const testHref = `files/${mockUser.id}/${testFileId}`;

    const AnchorComponent = a as React.ComponentType<{ href: string; children: React.ReactNode }>;

    render(
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <AnchorComponent href={testHref}>Download Test File</AnchorComponent>
        </QueryClientProvider>
      </RecoilRoot>,
    );

    // Verify that useFileDownload was called with the CORRECT file_id
    // Currently, the bug causes it to be called with userId instead
    expect(useFileDownloadModule.useFileDownload).toHaveBeenCalledWith(
      mockUser.id,
      testFileId, // This is what we EXPECT (correct behavior)
      // Currently the code passes userId here instead (bug!)
    );
  });

  /**
   * Additional test: Verify the download handler uses correct file_id
   * This test verifies the bug from a different angle - checking the download function call
   */
  it('should use correct file_id when download is triggered', () => {
    const testFileId = 'file-xyz-789';
    const testHref = `files/${mockUser.id}/${testFileId}`;

    const AnchorComponent = a as React.ComponentType<{ href: string; children: React.ReactNode }>;

    render(
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <AnchorComponent href={testHref}>Download File</AnchorComponent>
        </QueryClientProvider>
      </RecoilRoot>,
    );

    // Verify useFileDownload hook was initialized with correct file_id
    expect(useFileDownloadModule.useFileDownload).toHaveBeenCalledWith(
      mockUser.id,
      testFileId, // Expected: correct file_id
      // Bug: currently passes userId here
    );
  });

  /**
   * Test with 'outputs' prefix (alternative path format)
   */
  it('should extract correct file_id from outputs path', () => {
    const testFileId = 'output-file-456';
    const testHref = `outputs/${mockUser.id}/${testFileId}`;

    const AnchorComponent = a as React.ComponentType<{ href: string; children: React.ReactNode }>;

    render(
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <AnchorComponent href={testHref}>Download Output</AnchorComponent>
        </QueryClientProvider>
      </RecoilRoot>,
    );

    expect(useFileDownloadModule.useFileDownload).toHaveBeenCalledWith(
      mockUser.id,
      testFileId, // Should be the actual file_id, not userId
    );
  });

  /**
   * Edge case: UUID-style file_id
   */
  it('should handle UUID-style file IDs', () => {
    const testFileId = '550e8400-e29b-41d4-a716-446655440000';
    const testHref = `files/${mockUser.id}/${testFileId}`;

    const AnchorComponent = a as React.ComponentType<{ href: string; children: React.ReactNode }>;

    render(
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <AnchorComponent href={testHref}>Download</AnchorComponent>
        </QueryClientProvider>
      </RecoilRoot>,
    );

    expect(useFileDownloadModule.useFileDownload).toHaveBeenCalledWith(mockUser.id, testFileId);
  });

  /**
   * Control test: Non-file links should not trigger file download logic
   */
  it('should not process regular external links', () => {
    const testHref = 'https://example.com/page';

    const AnchorComponent = a as React.ComponentType<{ href: string; children: React.ReactNode }>;

    render(
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <AnchorComponent href={testHref}>External Link</AnchorComponent>
        </QueryClientProvider>
      </RecoilRoot>,
    );

    // Should be called with empty strings for non-file links
    expect(useFileDownloadModule.useFileDownload).toHaveBeenCalledWith(
      mockUser.id,
      '', // No file_id for regular links
    );
  });
});
