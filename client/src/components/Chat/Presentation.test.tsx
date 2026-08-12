import React from 'react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Artifact } from '~/common';
import Presentation from './Presentation';
import store from '~/store';

const mockArtifactPanelLabel = 'Artifact panel loaded';
const mockOpenArtifactLabel = 'Open Artifact';

jest.mock('~/components/Artifacts/Artifacts', () => {
  const artifactPanelLabel = 'Artifact panel loaded';
  const testGlobal = globalThis as typeof globalThis & {
    presentationArtifactModuleEvaluations?: number;
  };
  testGlobal.presentationArtifactModuleEvaluations =
    (testGlobal.presentationArtifactModuleEvaluations ?? 0) + 1;
  return {
    __esModule: true,
    default: () => <aside>{artifactPanelLabel}</aside>,
  };
});

jest.mock('~/components/Chat/Input/Files/DragDropWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/components/SidePanel', () => ({
  SidePanelGroup: ({
    artifacts,
    children,
  }: {
    artifacts: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {children}
      {artifacts}
    </div>
  ),
}));

jest.mock('~/Providers', () => ({
  ArtifactsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  EditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/hooks/Artifacts/useResetArtifactsOnConversationChange', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useSetFilesToDelete: () => jest.fn(),
}));

const OpenArtifactPanel = () => {
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);

  const open = () => {
    const artifact: Artifact = {
      id: 'mermaid-artifact',
      type: 'application/vnd.mermaid',
      title: 'Diagram',
      content: 'graph TD\nA-->B',
      lastUpdateTime: 1,
    };
    setArtifacts({ [artifact.id]: artifact });
    setCurrentArtifactId(artifact.id);
    setArtifactsVisible(true);
  };

  return (
    <button type="button" onClick={open}>
      {mockOpenArtifactLabel}
    </button>
  );
};

describe('Presentation Artifact loading', () => {
  it('loads the Artifact panel bundle only when the panel is opened', async () => {
    const testGlobal = globalThis as typeof globalThis & {
      presentationArtifactModuleEvaluations?: number;
    };

    render(
      <RecoilRoot>
        <Presentation>
          <OpenArtifactPanel />
        </Presentation>
      </RecoilRoot>,
    );

    expect(testGlobal.presentationArtifactModuleEvaluations ?? 0).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: mockOpenArtifactLabel }));

    expect(await screen.findByText(mockArtifactPanelLabel)).toBeInTheDocument();
    expect(testGlobal.presentationArtifactModuleEvaluations).toBe(1);
  });
});
