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
    // Open-panel button carries aria-pressed (auto-focused on mount per the
    // legacy auto-open behaviour).
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
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

  it.each([
    ['readme.txt', 'Lorem ipsum'],
    ['report.docx', 'Extracted document text'],
    ['notes.odt', 'OpenDocument body text'],
    ['slides.pptx', 'Slide titles and bullets'],
  ])('renders a panel artifact card for %s (text/plain bucket)', (filename, text) => {
    const file = baseAttachment({
      filename,
      text,
    } as Partial<TAttachment>);
    renderWith(<Attachment attachment={file} />);
    expect(screen.getByText(filename)).toBeInTheDocument();
    const downloadPattern = new RegExp(`com_ui_download.*${filename.replace('.', '\\.')}`, 'i');
    expect(screen.getByRole('button', { name: downloadPattern })).toBeInTheDocument();
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

  // Auto-open invariant: rendering a tool-artifact card must (a) register
  // the artifact in `artifactsState` and (b) focus it via
  // `currentArtifactId`. With `artifactsVisibility` defaulting to `true`,
  // this surfaces the latest tool artifact in the side panel — matching
  // the legacy streaming-artifact UX.
  it('registers and auto-focuses the artifact on mount', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    const snap = getSnapshot();
    expect(snap.artifactIds).toContain('tool-artifact-html-1');
    expect(snap.currentArtifactId).toBe('tool-artifact-html-1');
  });

  it('toggles closed when the user clicks the (already-selected) card', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    // Mount auto-focuses; the open button is in the pressed state.
    const closeButton = screen.getByRole('button', { pressed: true });
    act(() => {
      fireEvent.click(closeButton);
    });
    const snap = getSnapshot();
    expect(snap.currentArtifactId).toBeNull();
    expect(snap.visibility).toBe(false);
    // Self-heal effect keeps the artifact registered so re-opening works.
    expect(snap.artifactIds).toContain('tool-artifact-html-1');
  });

  it('reopens after a close (regression: artifact still openable post-close)', () => {
    const { getSnapshot } = renderWithProbe(<Attachment attachment={html()} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { pressed: true }));
    });
    expect(getSnapshot().visibility).toBe(false);
    expect(getSnapshot().currentArtifactId).toBeNull();
    // Click the now-unpressed open button again.
    act(() => {
      fireEvent.click(screen.getByRole('button', { pressed: false }));
    });
    const snap = getSnapshot();
    expect(snap.currentArtifactId).toBe('tool-artifact-html-1');
    expect(snap.visibility).toBe(true);
    expect(snap.artifactIds).toContain('tool-artifact-html-1');
  });

  it('focuses the latest card when multiple artifacts mount (legacy parity)', () => {
    // Order: older first, newer last. Last-mounted should win currentArtifactId.
    const olderHtml = baseAttachment({
      file_id: 'older',
      filename: 'old.html',
      text: '<p>1</p>',
    } as Partial<TAttachment>);
    const newerHtml = baseAttachment({
      file_id: 'newer',
      filename: 'new.html',
      text: '<p>2</p>',
    } as Partial<TAttachment>);
    const { getSnapshot } = renderWithProbe(
      <AttachmentGroup attachments={[olderHtml, newerHtml]} />,
    );
    expect(getSnapshot().currentArtifactId).toBe('tool-artifact-newer');
    expect(getSnapshot().artifactIds).toEqual(
      expect.arrayContaining(['tool-artifact-older', 'tool-artifact-newer']),
    );
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
