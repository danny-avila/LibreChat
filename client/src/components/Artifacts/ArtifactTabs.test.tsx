import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { render, waitFor } from '@testing-library/react';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { Artifact } from '~/common';
import ArtifactTabs from './ArtifactTabs';

interface EditorProps {
  artifact: Artifact;
  readOnly?: boolean;
}

const mockEditor = jest.fn((_props: EditorProps) => null);
const mockUseGetStartupConfig = jest.fn((_options?: unknown) => ({ data: {} }));
const mockUseGetSharedStartupConfig = jest.fn((_shareId?: unknown, _options?: unknown) => ({
  data: {},
}));
let mockCurrentCode: string | undefined;

jest.mock('./ArtifactCodeEditor', () => ({
  ArtifactCodeEditor: (props: EditorProps) => mockEditor(props),
}));

jest.mock('./ArtifactPreview', () => {
  const testGlobal = globalThis as typeof globalThis & {
    artifactPreviewModuleEvaluations?: number;
  };
  testGlobal.artifactPreviewModuleEvaluations =
    (testGlobal.artifactPreviewModuleEvaluations ?? 0) + 1;
  return { ArtifactPreview: () => null };
});

jest.mock('~/components/Messages/Content/Mermaid/Mermaid', () => {
  const nativeRenderer = jest.fn(() => null);
  const testGlobal = globalThis as typeof globalThis & {
    nativeMermaidRenderer?: typeof nativeRenderer;
  };
  testGlobal.nativeMermaidRenderer = nativeRenderer;
  return { MermaidRenderer: nativeRenderer };
});

jest.mock('~/Providers/EditorContext', () => ({
  useCodeState: () => ({ currentCode: mockCurrentCode, setCurrentCode: jest.fn() }),
}));

jest.mock('~/Providers', () => ({
  useShareContext: () => ({ shareId: undefined }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: (options: unknown) => mockUseGetStartupConfig(options),
  useGetSharedStartupConfig: (shareId: unknown, options: unknown) =>
    mockUseGetSharedStartupConfig(shareId, options),
}));

jest.mock('~/hooks/Artifacts/useArtifactProps', () => ({
  __esModule: true,
  default: () => ({ files: {}, fileKey: 'diagram.mmd', template: 'static', sharedProps: {} }),
}));

const preview: SandpackPreviewRef = Object.create(null);
const previewRef: React.MutableRefObject<SandpackPreviewRef> = { current: preview };

function renderArtifact(artifact: Artifact, activeTab: 'code' | 'preview' = 'code') {
  return render(
    <Tabs.Root value={activeTab}>
      <ArtifactTabs artifact={artifact} previewRef={previewRef} />
    </Tabs.Root>,
  );
}

describe('ArtifactTabs Mermaid editing', () => {
  beforeEach(() => {
    mockEditor.mockClear();
    mockUseGetStartupConfig.mockClear();
    mockUseGetSharedStartupConfig.mockClear();
    mockCurrentCode = undefined;
  });

  it('renders Mermaid natively without loading startup config or Sandpack preview', () => {
    const testGlobal = globalThis as typeof globalThis & {
      artifactPreviewModuleEvaluations?: number;
      nativeMermaidRenderer?: jest.Mock;
    };

    renderArtifact(
      {
        id: 'mermaid-chat-1',
        type: 'application/vnd.mermaid',
        title: 'Flow chart',
        content: 'graph TD\nA-->B',
        lastUpdateTime: 1,
      },
      'preview',
    );

    expect(mockUseGetStartupConfig).not.toHaveBeenCalled();
    expect(mockUseGetSharedStartupConfig).not.toHaveBeenCalled();
    expect(testGlobal.artifactPreviewModuleEvaluations ?? 0).toBe(0);
    expect(testGlobal.nativeMermaidRenderer?.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        children: 'graph TD\nA-->B',
        exportFilename: 'Flow chart',
        fillContainer: true,
        showExpandButton: false,
        showHeader: false,
      }),
    );
  });

  it('previews the current Mermaid editor content', () => {
    const testGlobal = globalThis as typeof globalThis & {
      nativeMermaidRenderer?: jest.Mock;
    };
    mockCurrentCode = 'graph TD\nA-->C';

    renderArtifact(
      {
        id: 'mermaid-persisted-1',
        type: 'application/vnd.mermaid',
        title: 'Flow chart',
        content: 'graph TD\nA-->B',
        index: 0,
        lastUpdateTime: 1,
      },
      'preview',
    );

    expect(testGlobal.nativeMermaidRenderer?.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ children: 'graph TD\nA-->C' }),
    );
  });

  it('makes chat Mermaid Artifacts read-only when they have no persisted edit target', () => {
    renderArtifact({
      id: 'mermaid-chat-1',
      type: 'application/vnd.mermaid',
      content: 'graph TD\nA-->B',
      lastUpdateTime: 1,
    });

    expect(mockEditor).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
  });

  it('keeps persisted Mermaid Artifacts editable', () => {
    renderArtifact({
      id: 'mermaid-persisted-1',
      type: 'application/vnd.mermaid',
      content: 'graph TD\nA-->B',
      index: 0,
      messageId: 'message-1',
      lastUpdateTime: 1,
    });

    expect(mockEditor).toHaveBeenCalledWith(expect.objectContaining({ readOnly: false }));
  });

  it('keeps non-Mermaid Artifacts on the startup-config and sandbox preview path', async () => {
    const testGlobal = globalThis as typeof globalThis & {
      artifactPreviewModuleEvaluations?: number;
    };

    renderArtifact(
      {
        id: 'html-1',
        type: 'text/html',
        content: '<h1>Hello</h1>',
        lastUpdateTime: 1,
      },
      'preview',
    );

    await waitFor(() => expect(mockUseGetStartupConfig).toHaveBeenCalledWith({ enabled: true }));
    expect(testGlobal.artifactPreviewModuleEvaluations).toBe(1);
  });
});
