import { prepareConfigOverrides } from './prepare';

describe('prepareConfigOverrides', () => {
  it('rejects process-backed MCP servers', () => {
    expect(() =>
      prepareConfigOverrides({
        mcpServers: { local: { command: 'node', args: ['server.js'] } },
      }),
    ).toThrow('Process-backed MCP servers');
  });

  it('strips sections that cannot be overridden by a role', () => {
    expect(prepareConfigOverrides({ filters: {} })).toEqual({});
    expect(prepareConfigOverrides({ langfuse: { publicKey: 'public' } })).toEqual({});
  });

  it('strips interface permissions and preserves supported values', () => {
    expect(
      prepareConfigOverrides({
        interface: {
          mcpServers: { use: true, placeholder: 'Choose a server' },
          modelSelect: true,
        },
      }),
    ).toEqual({
      interface: {
        mcpServers: { placeholder: 'Choose a server' },
        modelSelect: true,
      },
    });
  });
});
