import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { render, screen, waitFor } from '@testing-library/react';
import Artifacts from './Artifacts';
import store from '~/store';

const mockUseArtifacts = jest.fn();
const mockCaptureArtifactPreview = jest.fn<Promise<string | null>, []>();
let mockIsMobile = false;
let mockPrefersReducedMotion = false;
const pngPreview =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: (query: string) =>
    query === '(prefers-reduced-motion: reduce)' ? mockPrefersReducedMotion : mockIsMobile,
}));

jest.mock('~/Providers', () => ({
  useMutationState: () => ({ isMutating: false }),
  useShareContext: () => ({ isSharedConvo: false }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: {
      artifactApps: { clientSyncSettleDelayMs: 0, clientPreviewCaptureTimeoutMs: 100 },
    },
  }),
}));

jest.mock('~/utils/artifactPreviewCapture', () => ({
  captureArtifactPreview: () => mockCaptureArtifactPreview(),
  toArtifactPreview: (imageUrl: string, alt?: string) => ({
    type: 'image',
    imageUrl,
    ...(alt ? { alt } : {}),
  }),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
  useLocalize:
    () =>
    (key: string): string =>
      key,
  useFocusTrap: (
    containerRef: React.RefObject<HTMLElement | null>,
    active: boolean,
    onEscape?: () => void,
  ) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(() => {
      if (!active) {
        return;
      }
      const container = containerRef.current;
      const firstFocusable = container?.querySelector<HTMLElement>('button, [tabindex="0"]');
      firstFocusable?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onEscape?.();
        }
      };
      container?.addEventListener('keydown', handleKeyDown);
      return () => container?.removeEventListener('keydown', handleKeyDown);
    }, [active, containerRef, onEscape]);
  },
}));

jest.mock('~/hooks/Artifacts/useClearArtifactNavigationRequest', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

jest.mock('~/hooks/Artifacts/useArtifactCatalogSync', () => ({
  __esModule: true,
  default: () => ({ artifactEntry: null, isSyncing: false }),
}));

jest.mock('~/hooks/Artifacts/useArtifacts', () => ({
  __esModule: true,
  default: () => mockUseArtifacts(),
}));

jest.mock('./ArtifactTabs', () => ({
  __esModule: true,
  default: () => <div data-testid="artifact-content" />,
}));

jest.mock('./ArtifactVersion', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./DownloadArtifact', () => ({
  __esModule: true,
  default: () => <div data-testid="download-artifact" />,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: () => null,
}));

const ArtifactStateProbe = () => {
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const isVisible = useRecoilValue(store.artifactsVisibility);
  const artifacts = useRecoilValue(store.artifactsState);
  return (
    <output
      data-testid="artifact-state"
      data-current-id={currentArtifactId ?? ''}
      data-visible={isVisible}
      data-preview={artifacts?.['html-artifact-1']?.preview?.imageUrl ?? ''}
    />
  );
};

describe('Artifacts panel accessibility', () => {
  beforeEach(() => {
    mockIsMobile = false;
    mockPrefersReducedMotion = false;
    mockCaptureArtifactPreview.mockReset().mockResolvedValue(null);
    mockUseArtifacts.mockReturnValue({
      activeTab: 'code',
      setActiveTab: jest.fn(),
      currentIndex: 0,
      currentArtifact: {
        id: 'mermaid-artifact-1',
        type: 'application/vnd.mermaid',
        title: 'Diagram',
        content: 'graph TD\nA-->B',
        lastUpdateTime: 1,
      },
      orderedArtifactIds: ['mermaid-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    });
  });

  it('hides the Sandpack refresh action for Mermaid previews', async () => {
    mockUseArtifacts.mockReturnValue({
      activeTab: 'preview',
      setActiveTab: jest.fn(),
      currentIndex: 0,
      currentArtifact: {
        id: 'mermaid-artifact-1',
        type: 'application/vnd.mermaid',
        title: 'Diagram',
        content: 'graph TD\nA-->B',
        lastUpdateTime: 1,
      },
      orderedArtifactIds: ['mermaid-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    });

    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Diagram' });
    expect(screen.queryByRole('button', { name: 'com_ui_refresh' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mermaid-export')).toBeInTheDocument();
    /* The export menu owns SVG, PNG and the source, so a second download
     * control beside it would be a fourth, unlabelled way to save the same
     * diagram. */
    expect(screen.queryByTestId('download-artifact')).not.toBeInTheDocument();
  });

  it('opens a preview-capable artifact on its preview tab after a code-only one', async () => {
    /* A code-only artifact forces the Code tab. That constraint used to be
     * written back into the panel's shared `activeTab`, so the next HTML or
     * diagram row opened on Code while announcing a rendered preview. */
    const setActiveTab = jest.fn();
    const codeOnly = {
      activeTab: 'code',
      setActiveTab,
      currentIndex: 0,
      currentArtifact: {
        id: 'code-artifact-1',
        type: 'application/vnd.code',
        title: 'ingest.py',
        content: 'print(1)',
        lastUpdateTime: 1,
      },
      orderedArtifactIds: ['code-artifact-1', 'html-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    };
    mockUseArtifacts.mockReturnValue(codeOnly);

    const { rerender } = render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );
    await screen.findByRole('region', { name: 'ingest.py' });
    /* Nothing to reset while the constrained artifact is the open one. */
    expect(setActiveTab).not.toHaveBeenCalledWith('preview');

    mockUseArtifacts.mockReturnValue({
      ...codeOnly,
      currentIndex: 1,
      currentArtifact: {
        id: 'html-artifact-1',
        type: 'text/html',
        title: 'dashboard.html',
        content: '<h1>hi</h1>',
        lastUpdateTime: 2,
      },
    });
    rerender(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await waitFor(() => expect(setActiveTab).toHaveBeenCalledWith('preview'));
  });

  it('keeps the Mermaid export action on the code tab', async () => {
    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Diagram' });
    /* Saving the source never needed a rendered preview, and a download
     * control that disappears when the user switches tabs reads as a bug. */
    expect(screen.getByTestId('mermaid-export')).toBeInTheDocument();
    expect(screen.queryByTestId('download-artifact')).not.toBeInTheDocument();
  });

  it('keeps the generic download control for non-Mermaid artifacts', async () => {
    mockUseArtifacts.mockReturnValue({
      activeTab: 'preview',
      setActiveTab: jest.fn(),
      currentIndex: 0,
      currentArtifact: {
        id: 'html-artifact-1',
        type: 'text/html',
        title: 'Page',
        content: '<h1>Hi</h1>',
        lastUpdateTime: 1,
      },
      orderedArtifactIds: ['html-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    });

    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Page' });
    expect(screen.getByTestId('download-artifact')).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-export')).not.toBeInTheDocument();
  });

  it('keeps the refresh action for sandboxed previews', async () => {
    mockUseArtifacts.mockReturnValue({
      activeTab: 'preview',
      setActiveTab: jest.fn(),
      currentIndex: 0,
      currentArtifact: {
        id: 'html-artifact-1',
        type: 'text/html',
        title: 'Page',
        content: '<h1>Hi</h1>',
        lastUpdateTime: 1,
      },
      orderedArtifactIds: ['html-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    });

    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Page' });
    expect(screen.getByRole('button', { name: 'com_ui_refresh' })).toBeInTheDocument();
  });

  it('stores a captured thumbnail on the generated artifact for automatic synchronization', async () => {
    const currentArtifact = {
      id: 'html-artifact-1',
      type: 'text/html',
      title: 'Page',
      content: '<h1>Hi</h1>',
      lastUpdateTime: 1,
    };
    mockUseArtifacts.mockReturnValue({
      activeTab: 'preview',
      setActiveTab: jest.fn(),
      currentIndex: 0,
      currentArtifact,
      orderedArtifactIds: ['html-artifact-1'],
      setCurrentArtifactId: jest.fn(),
    });
    mockCaptureArtifactPreview.mockResolvedValue(pngPreview);

    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.artifactsState, { 'html-artifact-1': currentArtifact });
        }}
      >
        <ArtifactStateProbe />
        <Artifacts />
      </RecoilRoot>,
    );

    await waitFor(() => expect(mockCaptureArtifactPreview).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('artifact-state')).toHaveAttribute('data-preview', pngPreview),
    );
  });

  it('keeps the resizable layout ID distinct from the controlled Artifact region', async () => {
    const { container } = render(
      <RecoilRoot>
        <div id="artifacts-panel">
          <Artifacts />
        </div>
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Diagram' });

    expect(container.querySelectorAll('#artifacts-panel')).toHaveLength(1);
    expect(container.querySelectorAll('#artifact-viewer')).toHaveLength(1);
  });

  it('exposes the mobile artifact sheet as a named dialog', async () => {
    mockIsMobile = true;

    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('dialog', { name: 'Diagram' });
    expect(screen.getByRole('button', { name: 'com_ui_close' })).toBeInTheDocument();
  });
});
