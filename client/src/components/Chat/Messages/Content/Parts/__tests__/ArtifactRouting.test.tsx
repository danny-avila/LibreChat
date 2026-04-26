import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import type { TAttachment } from 'librechat-data-provider';
import Attachment, { AttachmentGroup } from '../Attachment';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

jest.mock('../LogLink', () => ({
  useAttachmentLink: () => ({ handleDownload: jest.fn() }),
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file }: { file: { filename?: string } }) => (
    <div data-testid="file-container">{file.filename ?? ''}</div>
  ),
}));

jest.mock('~/components/Chat/Input/Files/FilePreview', () => ({
  __esModule: true,
  default: () => <div data-testid="file-preview" />,
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText?: string }) => <img alt={altText ?? ''} data-testid="image" />,
}));

jest.mock('~/components/Messages/Content/Mermaid/Mermaid', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="mermaid-render">{children}</div>
  ),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  getFileType: () => ({ paths: [], color: '', title: 'Artifact' }),
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  isArtifactRoute: () => false,
}));

const baseAttachment = (overrides: Partial<TAttachment> = {}): TAttachment =>
  ({
    file_id: 'file-1',
    filename: 'unset',
    filepath: '/files/file-1',
    type: 'application/octet-stream',
    ...overrides,
  }) as TAttachment;

const renderWith = (ui: React.ReactElement) => render(<RecoilRoot>{ui}</RecoilRoot>);

interface ArtifactsSnapshot {
  visibility: boolean;
  currentArtifactId: string | null;
  artifactIds: string[];
}

const StateProbe = ({ onSnapshot }: { onSnapshot: (snap: ArtifactsSnapshot) => void }) => {
  const visibility = useRecoilValue(store.artifactsVisibility);
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const artifacts = useRecoilValue(store.artifactsState);
  React.useEffect(() => {
    onSnapshot({
      visibility,
      currentArtifactId,
      artifactIds: Object.keys(artifacts ?? {}),
    });
  });
  return null;
};

const renderWithProbe = (ui: React.ReactElement) => {
  let snapshot: ArtifactsSnapshot = {
    visibility: false,
    currentArtifactId: null,
    artifactIds: [],
  };
  const utils = render(
    <RecoilRoot>
      <StateProbe
        onSnapshot={(snap) => {
          snapshot = snap;
        }}
      />
      {ui}
    </RecoilRoot>,
  );
  return {
    ...utils,
    getSnapshot: () => snapshot,
  };
};

describe('Attachment routing for tool artifacts', () => {
  it('renders an HTML artifact card (panel artifact) and exposes a download control', () => {
    const html = baseAttachment({
      filename: 'index.html',
      text: '<h1>hi</h1>',
    } as Partial<TAttachment>);
    renderWith(<Attachment attachment={html} />);

    // Card body shows the artifact title
    expect(screen.getByText('index.html')).toBeInTheDocument();
    // Open-panel button is the one with aria-pressed
    expect(screen.getByRole('button', { pressed: false })).toBeInTheDocument();
    // Download button has the download aria-label
    expect(
      screen.getByRole('button', { name: /com_ui_download.*index\.html/i }),
    ).toBeInTheDocument();
  });

  it('renders a JSX artifact card', () => {
    const jsx = baseAttachment({
      filename: 'App.tsx',
      text: 'export default () => null;',
    } as Partial<TAttachment>);
    renderWith(<Attachment attachment={jsx} />);
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /com_ui_download.*App\.tsx/i })).toBeInTheDocument();
  });

  it('renders a Markdown artifact card', () => {
    const md = baseAttachment({
      filename: 'notes.md',
      text: '# hi',
    } as Partial<TAttachment>);
    renderWith(<Attachment attachment={md} />);
    expect(screen.getByText('notes.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /com_ui_download.*notes\.md/i })).toBeInTheDocument();
  });

  it('renders a Mermaid artifact through the standalone Mermaid component (not the panel)', () => {
    const mmd = baseAttachment({
      filename: 'flow.mmd',
      text: 'graph TD\nA-->B',
    } as Partial<TAttachment>);
    renderWith(<Attachment attachment={mmd} />);
    expect(screen.getByTestId('mermaid-render')).toHaveTextContent('graph TD');
    // The card-style trigger should NOT be rendered for mermaid
    expect(screen.queryByText('com_ui_artifact_click')).not.toBeInTheDocument();
  });

  it('falls through to the inline <pre> for unsupported text types (CSV)', () => {
    const csv = baseAttachment({
      filename: 'data.csv',
      text: 'a,b,c\n1,2,3',
    } as Partial<TAttachment>);
    const { container } = renderWith(<Attachment attachment={csv} />);
    expect(container.querySelector('pre')).not.toBeNull();
    expect(screen.queryByTestId('mermaid-render')).not.toBeInTheDocument();
  });
});

describe('ToolArtifactCard click behaviour', () => {
  const html = (): TAttachment =>
    baseAttachment({
      file_id: 'html-1',
      filename: 'index.html',
      text: '<h1>hi</h1>',
    } as Partial<TAttachment>);

  // Critical invariant: rendering a tool-artifact card must NOT register
  // the artifact (or select it) until the user clicks. `artifactsVisibility`
  // defaults to `true`, so eager mount-time registration would cause every
  // newly-arriving tool artifact to surface in the side panel without user
  // intent. Matches the same "no side effect on mount" rule as ArtifactButton.
  it('does not register the artifact or change selection on mount', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    expect(getSnapshot().artifactIds).toEqual([]);
    expect(getSnapshot().currentArtifactId).toBeNull();
  });

  it('registers the artifact, opens the panel, and selects it on click', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    const openButton = screen.getByRole('button', { pressed: false });
    act(() => {
      fireEvent.click(openButton);
    });
    const snap = getSnapshot();
    expect(snap.artifactIds).toContain('tool-artifact-html-1');
    expect(snap.currentArtifactId).toBe('tool-artifact-html-1');
    expect(snap.visibility).toBe(true);
  });

  it('toggles closed on a second click of the same card', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    const openButton = screen.getByRole('button', { pressed: false });
    act(() => {
      fireEvent.click(openButton);
    });
    expect(getSnapshot().currentArtifactId).toBe('tool-artifact-html-1');
    // Re-query: aria-pressed flipped to true after the first click
    const closeButton = screen.getByRole('button', { pressed: true });
    act(() => {
      fireEvent.click(closeButton);
    });
    const snap = getSnapshot();
    expect(snap.currentArtifactId).toBeNull();
    expect(snap.visibility).toBe(false);
    // Artifact stays registered so re-opening it later doesn't lose state
    expect(snap.artifactIds).toContain('tool-artifact-html-1');
  });
});

describe('AttachmentGroup routing', () => {
  it('renders separate buckets for panel artifacts, mermaid, text, and plain files', () => {
    const attachments = [
      baseAttachment({
        file_id: 'a',
        filename: 'index.html',
        text: '<h1>hi</h1>',
      } as Partial<TAttachment>),
      baseAttachment({
        file_id: 'b',
        filename: 'flow.mmd',
        text: 'graph TD\nA-->B',
      } as Partial<TAttachment>),
      baseAttachment({
        file_id: 'c',
        filename: 'data.csv',
        text: 'a,b,c\n1,2,3',
      } as Partial<TAttachment>),
      baseAttachment({
        file_id: 'd',
        filename: 'archive.zip',
        text: undefined as unknown as string,
      } as Partial<TAttachment>),
    ] as TAttachment[];

    const { container } = renderWith(<AttachmentGroup attachments={attachments} />);

    // Panel artifact card title
    expect(screen.getByText('index.html')).toBeInTheDocument();
    // Mermaid render
    expect(screen.getByTestId('mermaid-render')).toBeInTheDocument();
    // Inline text fallback for CSV
    expect(container.querySelector('pre')).not.toBeNull();
    // FileContainer for the plain zip (and potentially others)
    expect(screen.getAllByTestId('file-container').length).toBeGreaterThan(0);
  });
});
