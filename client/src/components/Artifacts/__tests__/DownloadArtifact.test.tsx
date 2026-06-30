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

describe('DownloadArtifact', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let anchorClick: jest.SpyInstance;

  beforeEach(() => {
    mockFileDownload.mockClear();
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

  it('downloads the original file (not the preview) for an office artifact', async () => {
    render(<DownloadArtifact artifact={officeArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockFileDownload).toHaveBeenCalledTimes(1);
    // The preview HTML must NOT be serialized into a blob download.
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('serializes content as a blob for a non-file-backed (LLM-authored) artifact', async () => {
    render(<DownloadArtifact artifact={htmlArtifact} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockFileDownload).not.toHaveBeenCalled();
  });
});
