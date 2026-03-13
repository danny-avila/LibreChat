const { v4: uuidv4 } = require('uuid');
const { Tools } = require('librechat-data-provider');
const {
  getAgent,
  loadAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  addAgentResourceFile,
  removeAgentResourceFiles,
} = require('./Agent');

describe('models/Agent', () => {
  let authorId = 'user123';

  test('should create and get an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const newAgent = await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
    });

    expect(newAgent.id).toBe(agentId);
    const retrieved = await getAgent({ id: agentId });
    expect(retrieved.name).toBe('Test Agent');
  });

  test('should update an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({ id: agentId, name: 'Old', author: authorId });
    const updated = await updateAgent({ id: agentId }, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  test('should delete an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({ id: agentId, name: 'To Delete', author: authorId });
    await deleteAgent({ id: agentId });
    const retrieved = await getAgent({ id: agentId });
    expect(retrieved).toBeNull();
  });

  test('should add resource file', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({ id: agentId, name: 'Resource Test', author: authorId });
    const fileId = 'file123';
    const updated = await addAgentResourceFile({ agent_id: agentId, tool_resource: 'test_tool', file_id: fileId });
    expect(updated.tools).toContain('test_tool');
    expect(updated.tool_resources.test_tool.file_ids).toContain(fileId);
  });

  test('should remove resource files', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({ id: agentId, name: 'Remove Test', author: authorId });
    await addAgentResourceFile({ agent_id: agentId, tool_resource: 'test_tool', file_id: 'f1' });
    await addAgentResourceFile({ agent_id: agentId, tool_resource: 'test_tool', file_id: 'f2' });

    await removeAgentResourceFiles({ agent_id: agentId, files: [{ tool_resource: 'test_tool', file_id: 'f1' }] });
    const agent = await getAgent({ id: agentId });
    expect(agent.tool_resources.test_tool.file_ids).not.toContain('f1');
    expect(agent.tool_resources.test_tool.file_ids).toContain('f2');
  });

  test('should apply ephemeral runtime tool overrides for saved agents', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({
      id: agentId,
      name: 'Runtime Override Test',
      provider: 'openAI',
      model: 'gpt-4o-mini',
      author: authorId,
      tools: [Tools.file_search],
    });

    const loaded = await loadAgent({
      req: {
        body: {
          ephemeralAgent: {
            file_search: false,
            web_search: true,
          },
        },
        config: {},
        user: { id: authorId },
      },
      spec: '',
      endpoint: 'agents',
      agent_id: agentId,
      model_parameters: {},
    });

    expect(loaded.tools).toContain(Tools.web_search);
    expect(loaded.tools).not.toContain(Tools.file_search);
  });
});
