import {
  Constants,
  MAX_SUBAGENT_GRAPH_NODES,
  MAX_GRAPH_SUBAGENT_MEMBERS,
  getSubagentGraphMemberCount,
} from 'librechat-data-provider';
import type { Agent, AgentSubagentGraph } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { getResumeContentInspection, getResumeAgentSnapshot } from './inspection';

const strictExtractedTextConfig = {
  filters: {
    files: {
      pii: {
        fields: ['extracted_text'],
        starterPatterns: [],
        uninspectable: 'block',
      },
    },
  },
} as unknown as AppConfig;

function buildInput(trustLiveFileContent?: boolean) {
  return {
    appConfig: strictExtractedTextConfig,
    conversationId: 'conversation-1',
    targetMessageId: 'message-1',
    user: { id: 'user-1' },
    supplementalMessages: [
      {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        parentMessageId: String(Constants.NO_PARENT),
        text: '',
        isCreatedByUser: true,
        files: [{ file_id: 'owned-file' }],
      },
    ],
    submittedMessages: [],
    liveFiles: [
      {
        file_id: 'owned-file',
        filename: 'forged.txt',
        type: 'text/plain',
        source: 'text',
        text: 'forged safe extraction',
      },
    ],
    ...(trustLiveFileContent != null && { trustLiveFileContent }),
    isTemporary: false,
    getMessages: jest.fn().mockResolvedValue([]),
    getFiles: jest.fn().mockResolvedValue([
      {
        file_id: 'owned-file',
        filename: 'opaque.pdf',
        type: 'application/pdf',
        source: 'local',
      },
    ]),
  };
}

describe('resume file inspection trust boundary', () => {
  it('resumes a long persisted branch with one batched owner-file lookup', async () => {
    const input = buildInput();
    const history = Array.from({ length: 58 }, (_, index) => ({
      messageId: `history-${index}`,
      parentMessageId: index === 0 ? String(Constants.NO_PARENT) : `history-${index - 1}`,
      conversationId: 'conversation-1',
      isCreatedByUser: true,
      content: Array.from({ length: 80 }, () => ({ type: 'text', text: 'safe history' })),
      files: index === 57 ? [{ file_id: 'owned-file' }] : [],
    }));
    input.getMessages.mockResolvedValue(history);
    input.getFiles.mockResolvedValue([{ file_id: 'owned-file', text: 'safe extraction' }]);
    const result = await getResumeContentInspection({
      ...input,
      targetMessageId: 'history-57',
      supplementalMessages: [],
      fileReferenceInputs: history,
    });
    expect(result.storedMessages).toHaveLength(58);
    expect(result.originalStoredMessages).toEqual(history);
    expect(result.hydratedFiles).toEqual([{ file_id: 'owned-file', text: 'safe extraction' }]);
    expect(input.getFiles).toHaveBeenCalledTimes(1);
  });

  it('does not accept request/job file metadata as extraction coverage', async () => {
    await expect(getResumeContentInspection(buildInput())).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'file', field: 'extracted_text' },
    });
  });

  it('accepts explicitly trusted server-hydrated runtime extraction', async () => {
    await expect(getResumeContentInspection(buildInput(true))).resolves.toMatchObject({
      hydratedFiles: [
        expect.objectContaining({
          file_id: 'owned-file',
          filename: 'opaque.pdf',
          text: 'forged safe extraction',
        }),
      ],
    });
  });

  it('hydrates file references carried only by additional checkpoint structures', async () => {
    const input = {
      ...buildInput(),
      fileReferenceInputs: [
        {
          tool_calls: [{ arguments: { file_id: 'checkpoint-only-file' } }],
        },
      ],
    };
    input.getFiles.mockResolvedValue([
      {
        file_id: 'owned-file',
        filename: 'safe.txt',
        type: 'text/plain',
        source: 'local',
        content: 'safe extracted content',
        extractedText: 'safe extracted content',
      },
    ]);

    await expect(getResumeContentInspection(input)).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'file', field: 'extracted_text' },
    });
    expect(input.getFiles).toHaveBeenCalledWith(
      {
        file_id: { $in: expect.arrayContaining(['owned-file', 'checkpoint-only-file']) },
        user: 'user-1',
      },
      {},
      {},
    );
  });

  it('does not reload persisted history for an inert message sibling policy', async () => {
    const getMessages = jest.fn().mockRejectedValue(new Error('history should not be loaded'));
    const result = await getResumeContentInspection({
      appConfig: {
        filters: {
          skills: {
            pii: {
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
          messages: { pii: { starterPatterns: [] } },
          toolArguments: { pii: { starterPatterns: [] } },
        },
      } as unknown as AppConfig,
      conversationId: 'conversation-1',
      targetMessageId: 'missing-message',
      user: { id: 'user-1' },
      supplementalMessages: [],
      submittedMessages: [],
      liveFiles: [],
      isTemporary: false,
      getMessages,
      getFiles: jest.fn().mockResolvedValue([]),
    });

    expect(result.storedMessages).toEqual([]);
    expect(getMessages).not.toHaveBeenCalled();
  });
});

describe('resume agent snapshot budget', () => {
  const agent = (id: string, graphs: AgentSubagentGraph[] = []): Agent => ({
    id,
    name: id,
    description: null,
    created_at: 0,
    avatar: null,
    provider: 'openAI',
    model: 'test',
    model_parameters: {
      temperature: null,
      maxContextTokens: null,
      max_context_tokens: null,
      max_output_tokens: null,
      top_p: null,
      frequency_penalty: null,
      presence_penalty: null,
    },
    subagents: { enabled: false, graphsEnabled: true, graphs },
  });
  const teams = (count: number): AgentSubagentGraph[] => {
    const graphs: AgentSubagentGraph[] = [];
    for (let start = 0; start < count; start += MAX_GRAPH_SUBAGENT_MEMBERS) {
      const ids = Array.from(
        { length: Math.min(MAX_GRAPH_SUBAGENT_MEMBERS, count - start) },
        (_, index) => `member-${start + index}`,
      );
      graphs.push({
        type: `team-${start}`,
        name: 'Team',
        description: 'Work',
        agent_ids: ids,
        entry_agent_id: ids[0],
        result_agent_id: ids[ids.length - 1],
        edges: ids.slice(1).map((id, index) => ({ from: ids[index], to: id, edgeType: 'direct' })),
      });
    }
    return graphs;
  };

  it.each([0, 2])(
    'excludes %s additional roots and deduplicates shared members at the exact budget',
    async (rootCount) => {
      const graphs = teams(MAX_SUBAGENT_GRAPH_NODES);
      const primaryAgent = agent('primary', [...graphs, { ...graphs[0], type: 'shared' }]);
      expect(getSubagentGraphMemberCount({ graphs: primaryAgent.subagents?.graphs })).toBe(
        MAX_SUBAGENT_GRAPH_NODES,
      );
      const additionalRoots = Array.from({ length: rootCount }, (_, index) =>
        agent(`root-${index}`, graphs),
      );
      const getAgent = jest.fn(async ({ id }: { id: string }) => agent(id));
      const canAccessAgent = jest.fn(async () => true);
      const snapshots = await getResumeAgentSnapshot({
        primaryAgent,
        additionalRoots: [...additionalRoots, ...additionalRoots],
        capabilities: ['subagent_graphs'],
        getAgent,
        canAccessAgent,
      });
      expect(snapshots).toHaveLength(1 + rootCount + MAX_SUBAGENT_GRAPH_NODES);
      expect(new Set(snapshots.map(({ id }) => id)).size).toBe(snapshots.length);
      expect(getAgent).toHaveBeenCalledTimes(MAX_SUBAGENT_GRAPH_NODES);
      expect(canAccessAgent).toHaveBeenCalledTimes(MAX_SUBAGENT_GRAPH_NODES);
      for (let index = 0; index < MAX_SUBAGENT_GRAPH_NODES; index++) {
        expect(getAgent).toHaveBeenCalledWith({ id: `member-${index}` });
      }
      expect(primaryAgent.subagents?.graphs).toHaveLength(graphs.length + 1);
    },
  );

  it.each([0, 2])('rejects budget +1 even with %s additional roots', async (rootCount) => {
    const graphs = teams(MAX_SUBAGENT_GRAPH_NODES + 1);
    const getAgent = jest.fn(async ({ id }: { id: string }) => agent(id));
    await expect(
      getResumeAgentSnapshot({
        primaryAgent: agent('primary', graphs),
        additionalRoots: Array.from({ length: rootCount }, (_, index) =>
          agent(`root-${index}`, graphs),
        ),
        capabilities: ['subagent_graphs'],
        getAgent,
        canAccessAgent: async () => true,
      }),
    ).rejects.toMatchObject({ code: 'content_filter_uninspectable' });
    expect(getAgent).toHaveBeenCalledTimes(MAX_SUBAGENT_GRAPH_NODES + 1);
  });

  it.each(['missing', 'revoked', 'unavailable'])(
    'fails closed when the last boundary member is %s',
    async (reason) => {
      const last = `member-${MAX_SUBAGENT_GRAPH_NODES - 1}`;
      const getAgent = jest.fn(async ({ id }: { id: string }) => {
        if (id === last && reason === 'unavailable') throw new Error('unavailable');
        return id === last && reason === 'missing' ? null : agent(id);
      });
      const canAccessAgent = jest.fn(async ({ id }: Agent) => id !== last || reason !== 'revoked');
      await expect(
        getResumeAgentSnapshot({
          primaryAgent: agent('primary', teams(MAX_SUBAGENT_GRAPH_NODES)),
          additionalRoots: [agent('additional')],
          capabilities: ['subagent_graphs'],
          getAgent,
          canAccessAgent,
        }),
      ).rejects.toMatchObject({ code: 'content_filter_uninspectable' });
      expect(getAgent).toHaveBeenCalledWith({ id: last });
      expect(getAgent).toHaveBeenCalledTimes(MAX_SUBAGENT_GRAPH_NODES);
      expect(canAccessAgent).toHaveBeenCalledTimes(
        MAX_SUBAGENT_GRAPH_NODES - (reason === 'revoked' ? 0 : 1),
      );
    },
  );
});
