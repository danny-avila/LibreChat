import React from 'react';
import { act, render, screen } from '@testing-library/react';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import { ArtifactPreview } from './ArtifactPreview';

const mockSandpackPreview = jest.fn(() => <div data-testid="sandpack-preview" />);
const mockLocalize = jest.fn((key: string) =>
  key === 'com_ui_artifact_app_preview' ? 'Aperçu de l’artéfact' : key,
);

jest.mock('@codesandbox/sandpack-react/unstyled', () => ({
  SandpackPreview: () => mockSandpackPreview(),
  SandpackProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sandpack-provider">{children}</div>
  ),
}));
jest.mock('~/hooks', () => ({ useLocalize: () => mockLocalize }));

describe('ArtifactPreview', () => {
  beforeEach(() => {
    mockSandpackPreview.mockClear();
    mockLocalize.mockClear();
  });

  it('renders static HTML artifacts in a local iframe without Sandpack', () => {
    const previewRef = { current: undefined } as React.MutableRefObject<
      SandpackPreviewRef | undefined
    >;

    render(
      <ArtifactPreview
        files={{ 'index.html': '<html><body><h1>Hello World!</h1></body></html>' }}
        fileKey="index.html"
        template="static"
        sharedProps={{}}
        previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
      />,
    );

    const iframe = screen.getByTitle('Aperçu de l’artéfact');
    expect(iframe).toHaveAttribute('srcdoc', expect.stringContaining('Hello World!'));
    expect(iframe).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('librechat:artifact-preview:request'),
    );
    expect(mockLocalize).toHaveBeenCalledWith('com_ui_artifact_app_preview');
    expect(mockSandpackPreview).not.toHaveBeenCalled();
  });

  it('keeps the toolbar refresh action working for local static previews', () => {
    const previewRef = { current: undefined } as React.MutableRefObject<
      SandpackPreviewRef | undefined
    >;

    render(
      <ArtifactPreview
        files={{ 'index.html': '<html><body><h1>Hello World!</h1></body></html>' }}
        fileKey="index.html"
        template="static"
        sharedProps={{}}
        previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
      />,
    );

    const firstIframe = screen.getByTitle('Aperçu de l’artéfact');

    act(() => {
      previewRef.current?.getClient()?.dispatch({ type: 'refresh' });
    });

    expect(screen.getByTitle('Aperçu de l’artéfact')).not.toBe(firstIframe);
  });
});
