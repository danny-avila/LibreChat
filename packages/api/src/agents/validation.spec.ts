import { MAX_SUBAGENTS } from 'librechat-data-provider';
import { agentCreateSchema, agentUpdateSchema, agentSubagentsSchema } from './validation';

describe('agentSubagentsSchema', () => {
  it('accepts enabled:true with a list within the cap', () => {
    const result = agentSubagentsSchema.safeParse({
      enabled: true,
      allowSelf: false,
      agent_ids: ['agent_1', 'agent_2'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts the feature-off shape (enabled:false, no agents)', () => {
    const result = agentSubagentsSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it('rejects agent_ids longer than MAX_SUBAGENTS', () => {
    const oversized = Array.from({ length: MAX_SUBAGENTS + 1 }, (_, i) => `agent_${i}`);
    const result = agentSubagentsSchema.safeParse({
      enabled: true,
      agent_ids: oversized,
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly MAX_SUBAGENTS entries', () => {
    const atCap = Array.from({ length: MAX_SUBAGENTS }, (_, i) => `agent_${i}`);
    const result = agentSubagentsSchema.safeParse({
      enabled: true,
      agent_ids: atCap,
    });
    expect(result.success).toBe(true);
  });
});

describe('agentCreateSchema with subagents', () => {
  const base = {
    provider: 'openAI',
    model: 'gpt-4o-mini',
    tools: [],
  };

  it('passes with subagents omitted', () => {
    const result = agentCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('passes with a valid subagents config', () => {
    const result = agentCreateSchema.safeParse({
      ...base,
      subagents: { enabled: true, allowSelf: true, agent_ids: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when subagents.agent_ids exceeds the cap', () => {
    const oversized = Array.from({ length: MAX_SUBAGENTS + 1 }, (_, i) => `agent_${i}`);
    const result = agentCreateSchema.safeParse({
      ...base,
      subagents: { enabled: true, agent_ids: oversized },
    });
    expect(result.success).toBe(false);
  });

  it('strips runtime-populated files from every tool resource', () => {
    const forgedFile = {
      file_id: 'forged',
      filepath: '/etc/passwd',
      source: 'local',
      metadata: {
        codeEnvRef: {
          kind: 'user',
          id: 'attacker',
          storage_session_id: 'missing',
          file_id: 'missing',
        },
      },
    };
    const result = agentCreateSchema.parse({
      ...base,
      tool_resources: {
        execute_code: { file_ids: ['execute'], files: [forgedFile] },
        file_search: { file_ids: ['search'], files: [forgedFile] },
        image_edit: { file_ids: ['image'], files: [forgedFile] },
        context: { file_ids: ['context'], files: [forgedFile] },
        ocr: { file_ids: ['ocr'], files: [forgedFile] },
      },
    });

    expect(result.tool_resources).toEqual({
      execute_code: { file_ids: ['execute'] },
      file_search: { file_ids: ['search'] },
      image_edit: { file_ids: ['image'] },
      context: { file_ids: ['context'] },
      ocr: { file_ids: ['ocr'] },
    });
  });
});

describe('stateful code environments', () => {
  it.each(['user', 'agent-user', 'conversation'])('accepts %s', (environment) => {
    const result = agentCreateSchema.safeParse({
      provider: 'openAI',
      model: 'gpt-4o-mini',
      tools: [],
      stateful_code_sessions: true,
      stateful_code_environment: environment,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown environment scopes', () => {
    const result = agentUpdateSchema.safeParse({
      stateful_code_environment: 'agent',
    });
    expect(result.success).toBe(false);
  });
});

describe('agentUpdateSchema with subagents', () => {
  it('accepts a partial update with only the disabled flag set', () => {
    const result = agentUpdateSchema.safeParse({
      subagents: { enabled: false, allowSelf: true, agent_ids: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects oversized agent_ids on update', () => {
    const oversized = Array.from({ length: MAX_SUBAGENTS + 3 }, (_, i) => `agent_${i}`);
    const result = agentUpdateSchema.safeParse({
      subagents: { enabled: true, agent_ids: oversized },
    });
    expect(result.success).toBe(false);
  });

  it('strips runtime-populated files from partial updates', () => {
    const result = agentUpdateSchema.parse({
      tool_resources: {
        execute_code: {
          file_ids: ['kept'],
          files: [{ file_id: 'forged', filepath: '/etc/passwd', source: 'local' }],
        },
      },
    });

    expect(result.tool_resources).toEqual({
      execute_code: { file_ids: ['kept'] },
    });
  });
});
