import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import DownloadArtifact from '../DownloadArtifact';

const mockFileDownload = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

jest.mock('~/hooks/Artifacts/useArtifactProps', () => ({
  __esModule: true,
  default: () => ({ fileKey: 'index.html', files: {}, template: 'static', sharedProps: {} }),
}));

jest.mock('~/Providers/EditorContext', () => ({
  useCodeState: () => ({ currentCode: undefined }),
}));

jest.mock('~/components/Chat/Messages/Content/Parts/LogLink', () => ({
  useAttachmentLink: () => ({ handleDownload: mockFileDownload }),
  isLocallyStoredSource: (source?: string) =>
    ['local', 'firebase', 's3', 'cloudfront', 'azure_blob'].includes(source ?? ''),
}));

const officeArtifact: Artifact = {
  id: 'tool-artifact-fid-1',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.PRESENTATION,
  title: 'deck.pptx',
  content: '<html><body>slide text scrape</body></html>',
  download: {
    filepath: '/api/files/code/output/deck.pptx',
    file_id: 'fid-1',
    source: 'execute_code',
    user: 'user-1',
  },
};

const htmlArtifact: Artifact = {
  id: 'llm-artifact-1',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.HTML,
  title: 'Authored Page',
  content: '<h1>hello</h1>',
};

/* Shared link to a non-snapshotted code-execution office artifact: share
 * sanitization strips source/user and `applyShareFileRoute` deletes
 * filepath, leaving only file_id. There is no route to fetch the
 * original, so the panel must fall back to the preview-content blob. */
const sharedNoRouteArtifact: Artifact = {
  id: 'tool-artifact-fid-2',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.PRESENTATION,
  title: 'deck.pptx',
  content: '<html><body>slide text scrape</body></html>',
  download: {
    file_id: 'fid-2',
  },
};

/* Locally-stored office artifact with no filepath but full local-file
 * metadata: the API download path (isLocallyStoredSource + file_id +
 * user) can still fetch the original. */
const localMetadataArtifact: Artifact = {
  id: 'tool-artifact-fid-3',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  title: 'book.xlsx',
  content: '<html><body>sheet scrape</body></html>',
  download: {
    file_id: 'fid-3',
    source: 'local',
    user: 'user-3',
  },
};

describe('DownloadArtifact', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let anchorClick: jest.SpyInstance;

  beforeEach(() => {
    mockFileDownload.mockReset();
    // The attachment helper resolves to `true` when a file was delivered.
    mockFileDownload.mockResolvedValue(true);
    createObjectURL = jest.fn(() => 'blob:mock');
    revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    anchorClick.mockRestore();
  });

  it('downloads the original file (not the preview) for an office artifact and shows success', async () => {
    const { container } = render(<DownloadArtifact artifact={officeArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockFileDownload).toHaveBeenCalledTimes(1);
    // The preview HTML must NOT be serialized into a blob download.
    expect(createObjectURL).not.toHaveBeenCalled();
    // A delivered file flips the button to the success checkmark.
    expect(container.querySelector('.lucide-circle-check-big')).not.toBeNull();
  });

  it('does NOT show success when the original-file download fails', async () => {
    // Expired code-output URL / 404 share download: the helper resolves
    // to false instead of throwing. The checkmark must stay hidden.
    mockFileDownload.mockResolvedValueOnce(false);
    const { container } = render(<DownloadArtifact artifact={officeArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockFileDownload).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.lucide-circle-check-big')).toBeNull();
    expect(container.querySelector('.lucide-download')).not.toBeNull();
  });

  it('serializes content as a blob for a non-file-backed (LLM-authored) artifact', async () => {
    render(<DownloadArtifact artifact={htmlArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockFileDownload).not.toHaveBeenCalled();
  });

  it('falls back to the preview blob when an office artifact has only a lone file_id (no usable route)', async () => {
    render(<DownloadArtifact artifact={sharedNoRouteArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    // No filepath/share route and no local metadata: must NOT call the
    // empty attachment fetch; serialize the preview content instead.
    expect(mockFileDownload).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('downloads the original via the local-file path when filepath is absent but local metadata is present', async () => {
    render(<DownloadArtifact artifact={localMetadataArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockFileDownload).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
