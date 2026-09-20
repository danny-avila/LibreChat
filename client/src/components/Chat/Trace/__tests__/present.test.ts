import { ContentTypes } from 'librechat-data-provider';
import type { Agent, TMessage, TTraceRecord } from 'librechat-data-provider';
import type { PresentationSources } from '../present';
import { buildPreviews, buildActivityIndex } from '../preview';
import { presentRecord } from '../present';
import { buildTraceModel } from '../model';

const BASE = Date.UTC(2026, 8, 12, 11, 30, 0);
const at = (offsetMs: number) => new Date(BASE + offsetMs).toISOString();

function record(overrides: Partial<TTraceRecord> & Pick<TTraceRecord, 'id'>): TTraceRecord {
  return {
    traceId: 'trace-1',
    messageId: 'response-1',
    parentId: null,
    kind: 'span',
    name: overrides.id,
    startTime: at(0),
    endTime: at(1000),
    status: 'ok',
    ...overrides,
  };
}

const generation = (id: string, role: TTraceRecord['role'], name: string, start: number) =>
  record({ id, parentId: 'scout', kind: 'generation', role, name, startTime: at(start) });
const round = (id: string, start: number) =>
  record({ id, parentId: 'scout', role: 'tools', name: 'tool-dispatch', startTime: at(start) });

const records: TTraceRecord[] = [
  record({ id: 'run', kind: 'agent', role: 'run', name: 'AgentGraph' }),
  record({
    id: 'scout',
    parentId: 'run',
    role: 'agent',
    agentId: 'agent_scout',
    name: 'agent_scout',
  }),
  generation('llm-1', 'model', 'llm', 100),
  generation('label-1', 'stepLabel', 'StepLabel', 1050),
  round('paused', 1100),
  round('round-1', 1500),
  generation('llm-2', 'model', 'llm', 3000),
  round('round-2', 4000),
  generation('llm-3', 'model', 'llm', 5000),
];

const response = {
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text: '',
  content: [
    { type: ContentTypes.TEXT, text: 'Looking.' },
    { type: ContentTypes.ACTIVITY_LABEL, activity_label: 'Finding the trace reader' },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: { name: 'web_search', args: { query: 'langfuse' }, output: 'ten results' },
    },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: { name: 'search_code_mcp_github', args: { q: 'TraceReader' } },
    },
    { type: ContentTypes.TEXT, text: 'One more.' },
    { type: ContentTypes.TOOL_CALL, tool_call: { name: 'read_file', args: { path: 'a.ts' } } },
    { type: ContentTypes.TEXT, text: 'Done.' },
  ],
} as unknown as TMessage;

const scout = { id: 'agent_scout', name: 'Codebase Scout', model: 'claude-opus-5' } as Agent;

function present(messages: TMessage[], agents: Record<string, Agent> = { agent_scout: scout }) {
  const model = buildTraceModel(records, 'full');
  const activity = buildActivityIndex(model, buildPreviews(messages));
  const sources: PresentationSources = {
    localize: (key, values) => (values ? `${key} ${Object.values(values).join(' ')}` : key),
    activity,
    previewOf: () => undefined,
    agentOf: (agentId) => agents[agentId],
    mcpServerNames: ['github'],
  };
  const of = (id: string) => {
    const node = model.nodes.get(id);
    if (node == null) {
      throw new Error(`no record ${id}`);
    }
    return presentRecord(node, sources);
  };
  return { activity, of };
}

describe('buildActivityIndex', () => {
  it("gives a round's calls to the tool round that ran them, not the one an approval paused", () => {
    const { activity } = present([response]);

    expect(activity.calls.get('paused')).toBeUndefined();
    expect(activity.calls.get('round-1')?.map((call) => call.name)).toEqual([
      'web_search',
      'search_code_mcp_github',
    ]);
    expect(activity.calls.get('round-1')?.[0]).toMatchObject({
      args: 'query: langfuse',
      input: '{"query":"langfuse"}',
      output: 'ten results',
    });
    expect(activity.calls.get('round-2')?.map((call) => call.name)).toEqual(['read_file']);
    expect(activity.unrecordedCalls.get('response-1')).toBe(3);
  });

  it('pairs a label with the model call that wrote it only while the counts agree', () => {
    expect(present([response]).activity.labels.get('label-1')).toBe('Finding the trace reader');

    const twoLabels = {
      ...response,
      content: [
        ...(response.content ?? []),
        { type: ContentTypes.ACTIVITY_LABEL, activity_label: 'Another' },
      ],
    } as TMessage;
    expect(present([twoLabels]).activity.labels.size).toBe(0);
  });

  it('attributes nothing when the message and the trace disagree on the rounds', () => {
    const short = { ...response, content: response.content?.slice(0, 4) } as TMessage;
    const { activity } = present([short]);

    expect(activity.calls.size).toBe(0);
    expect(activity.unrecordedCalls.size).toBe(0);
  });
});

describe('presentRecord', () => {
  it("reads a record in the chat's words and keeps the recorded name for the details", () => {
    const { of } = present([response]);

    expect(of('llm-1')).toMatchObject({ title: 'com_ui_model', technicalName: 'llm' });
    expect(of('run')).toMatchObject({
      title: 'com_ui_trace_role_run',
      technicalName: 'AgentGraph',
    });
    expect(of('label-1')).toMatchObject({
      title: 'com_ui_trace_role_step_label',
      preview: 'Finding the trace reader',
    });
    expect(of('scout')).toMatchObject({
      title: 'Codebase Scout',
      caption: 'claude-opus-5',
      agent: scout,
    });
  });

  it('names a tool round by its tools, as the chat names them', () => {
    const { of } = present([response]);

    expect(of('round-1')).toMatchObject({
      title: 'com_ui_trace_role_tools_count 2',
      preview: 'com_ui_tool_name_web_search, search_code',
      toolNames: ['web_search', 'search_code_mcp_github'],
    });
    expect(of('round-1').calls?.[1]).toMatchObject({ title: 'search_code', caption: 'github' });
    expect(of('round-2')).toMatchObject({
      title: 'com_ui_tool_name_read_file',
      preview: 'path: a.ts',
    });
    expect(of('paused')).toEqual({
      title: 'com_ui_trace_role_tools',
      technicalName: 'tool-dispatch',
    });
  });

  it('keeps the agent row when the agent can no longer be loaded', () => {
    expect(present([response], {}).of('scout')).toMatchObject({
      title: 'com_ui_agent',
      agent: null,
    });
  });
});
