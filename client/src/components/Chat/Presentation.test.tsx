import React from 'react';
import { useSetAtom } from 'jotai';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { activeSubagentPanel } from '~/store/subagents';
import { ChatSurfaceHarness } from 'test/harness';
import Presentation from './Presentation';
import store from '~/store';

const mockArtifactPanelLabel = 'Artifact panel loaded';
const mockOpenArtifactLabel = 'Open Artifact';
const mockChildPanelLabel = 'Child activity panel loaded';
const mockOpenChildLabel = 'Open Child Activity';
const mockSelectAgentConversationLabel = 'Select Agent Conversation';
const mockUseParentSubagentsQuery = jest.fn((_conversationId?: string, _config?: unknown) => ({
  data: undefined,
  refetch: jest.fn(),
}));

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

jest.mock('~/components/Chat/Subagents/SubagentThreadPanel', () => ({
  __esModule: true,
  default: () => <aside>{mockChildPanelLabel}</aside>,
}));

jest.mock('~/components/Chat/Input/Files/DragDropWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/components/SidePanel', () => ({
  SidePanelGroup: ({ panel, children }: { panel: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {children}
      {panel}
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
  useParentSubagentsQuery: (conversationId: string, config?: unknown) =>
    mockUseParentSubagentsQuery(conversationId, config),
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

const OpenSubagentPanel = () => {
  const setConversation = useSetRecoilState(store.conversationByIndex(0));
  const setSelection = useSetAtom(activeSubagentPanel);
  const open = () => {
    setConversation({ conversationId: 'parent-conversation' } as TConversation);
    setSelection({
      host: 'conversation',
      parentConversationId: 'parent-conversation',
      parentMessageId: 'parent-message',
      toolCallId: 'tool-call',
      partIndex: 0,
      subagentType: 'researcher',
      initialProgress: 1,
      isSubmitting: false,
      durable: {
        threadId: 'child-thread',
        taskId: 'background-task',
      },
    });
  };
  return (
    <button type="button" onClick={open}>
      {mockOpenChildLabel}
    </button>
  );
};

const SelectAgentConversation = () => {
  const setConversation = useSetRecoilState(store.conversationByIndex(0));
  return (
    <button
      type="button"
      onClick={() =>
        setConversation({
          conversationId: 'agent-conversation',
          endpoint: 'agents',
          agent_id: 'agent-1',
        } as TConversation)
      }
    >
      {mockSelectAgentConversationLabel}
    </button>
  );
};

describe('Presentation Artifact loading', () => {
  it('loads the Artifact panel bundle only when the panel is opened', async () => {
    const testGlobal = globalThis as typeof globalThis & {
      presentationArtifactModuleEvaluations?: number;
    };

    render(
      <ChatSurfaceHarness>
        <RecoilRoot>
          <Presentation>
            <OpenArtifactPanel />
          </Presentation>
        </RecoilRoot>
      </ChatSurfaceHarness>,
    );

    expect(testGlobal.presentationArtifactModuleEvaluations ?? 0).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: mockOpenArtifactLabel }));

    expect(await screen.findByText(mockArtifactPanelLabel)).toBeInTheDocument();
    expect(testGlobal.presentationArtifactModuleEvaluations).toBe(1);
    expect(mockUseParentSubagentsQuery).toHaveBeenCalledWith('', { enabled: false });
  });

  it('loads the parent child index only for Agent conversations', () => {
    render(
      <ChatSurfaceHarness>
        <RecoilRoot>
          <Presentation>
            <SelectAgentConversation />
          </Presentation>
        </RecoilRoot>
      </ChatSurfaceHarness>,
    );

    expect(mockUseParentSubagentsQuery).toHaveBeenLastCalledWith('', { enabled: false });
    fireEvent.click(screen.getByRole('button', { name: mockSelectAgentConversationLabel }));
    expect(mockUseParentSubagentsQuery).toHaveBeenLastCalledWith('agent-conversation', {
      enabled: true,
    });
  });

  it('uses one panel slot and lets an opened artifact replace child activity', async () => {
    render(
      <ChatSurfaceHarness>
        <RecoilRoot>
          <Presentation>
            <OpenSubagentPanel />
            <OpenArtifactPanel />
          </Presentation>
        </RecoilRoot>
      </ChatSurfaceHarness>,
    );

    fireEvent.click(screen.getByRole('button', { name: mockOpenChildLabel }));
    expect(await screen.findByText(mockChildPanelLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: mockOpenArtifactLabel }));
    expect(await screen.findByText(mockArtifactPanelLabel)).toBeInTheDocument();
    expect(screen.queryByText(mockChildPanelLabel)).not.toBeInTheDocument();
  });
});
