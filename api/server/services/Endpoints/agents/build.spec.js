const { buildOptions } = require('./build');

jest.mock('@librechat/api', () => ({
  loadAgent: jest.fn(() => Promise.resolve({ id: 'agent-1' })),
}));

jest.mock('~/server/services/Config', () => ({
  getMCPServerTools: jest.fn(),
}));

jest.mock('~/models', () => ({
  getAgent: jest.fn(),
}));

describe('agents buildOptions', () => {
  it('preserves OneCode workspace metadata on the endpoint option', () => {
    const req = {
      body: {
        metadata: {
          workspace: '/tmp/project-a',
        },
        unrelated: 'must-not-be-forwarded',
      },
    };

    const endpointOption = buildOptions(
      req,
      'OneCode',
      { model: 'onecode-agent', chatProjectId: 'project-1' },
      'custom',
    );

    expect(endpointOption.metadata).toEqual({ workspace: '/tmp/project-a' });
    expect(endpointOption.chatProjectId).toBe('project-1');
    expect(endpointOption.unrelated).toBeUndefined();
  });
});
