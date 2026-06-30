import type { MCPServersResponse } from 'librechat-data-provider';
import {
  buildMcpToolMentionOptions,
  formatMcpToolHint,
  parseMcpPluginKey,
  resolveMcpServersForSkillsPopover,
  resolveScopedMcpServerNames,
} from '../mcpToolsForPopover';

describe('resolveScopedMcpServerNames', () => {
  it('unions global, model spec, and ephemeral server names', () => {
    const scoped = resolveScopedMcpServerNames({
      globalServerNames: ['filesystem', 'excel'],
      modelSpecServerNames: ['smbteam-mcp'],
      ephemeralMcpServers: ['custom-server'],
    });

    expect([...scoped].sort()).toEqual(['custom-server', 'excel', 'filesystem', 'smbteam-mcp']);
  });

  it('deduplicates overlapping names', () => {
    const scoped = resolveScopedMcpServerNames({
      globalServerNames: ['filesystem'],
      modelSpecServerNames: ['filesystem'],
      ephemeralMcpServers: ['filesystem'],
    });

    expect([...scoped]).toEqual(['filesystem']);
  });
});

describe('resolveMcpServersForSkillsPopover', () => {
  it('excludes modelSpec infrastructure servers from the popover scope', () => {
    const scoped = resolveMcpServersForSkillsPopover({
      globalServerNames: ['filesystem', 'excel', 'smbteam-mcp'],
      modelSpecInfrastructureServers: ['filesystem', 'excel'],
    });

    expect([...scoped]).toEqual(['smbteam-mcp']);
  });

  it('adds non-infrastructure ephemeral servers', () => {
    const scoped = resolveMcpServersForSkillsPopover({
      globalServerNames: ['filesystem', 'smbteam-mcp'],
      modelSpecInfrastructureServers: ['filesystem', 'excel'],
      ephemeralMcpServers: ['partner-skills-mcp'],
    });

    expect([...scoped].sort()).toEqual(['partner-skills-mcp', 'smbteam-mcp']);
  });

  it('does not include infrastructure servers enabled only via ephemeral toggles', () => {
    const scoped = resolveMcpServersForSkillsPopover({
      globalServerNames: ['filesystem', 'smbteam-mcp'],
      modelSpecInfrastructureServers: ['filesystem', 'excel'],
      ephemeralMcpServers: ['excel'],
    });

    expect([...scoped]).toEqual(['smbteam-mcp']);
  });
});

describe('parseMcpPluginKey', () => {
  it('parses tool and server from plugin key', () => {
    expect(parseMcpPluginKey('lead_follow_up_mcp_smbteam_mcp')).toEqual({
      toolName: 'lead_follow_up',
      serverName: 'smbteam_mcp',
    });
  });

  it('returns null for invalid keys', () => {
    expect(parseMcpPluginKey('not-an-mcp-key')).toBeNull();
  });
});

describe('buildMcpToolMentionOptions', () => {
  const response: MCPServersResponse = {
    servers: {
      'smbteam-mcp': {
        name: 'smbteam-mcp',
        icon: '',
        authenticated: true,
        authConfig: [],
        tools: [
          {
            name: 'create_pptx',
            pluginKey: 'create_pptx_mcp_smbteam-mcp',
            description: 'Create a PowerPoint deck',
          },
          {
            name: 'brand_guidelines',
            pluginKey: 'brand_guidelines_mcp_smbteam-mcp',
            description: '',
          },
        ],
      },
      filesystem: {
        name: 'filesystem',
        icon: '',
        authenticated: true,
        authConfig: [],
        tools: [
          {
            name: 'write_file',
            pluginKey: 'write_file_mcp_filesystem',
            description: 'Write a text file',
          },
        ],
      },
    },
  };

  it('filters tools to scoped servers and sorts by tool name', () => {
    const options = buildMcpToolMentionOptions(response, new Set(['smbteam-mcp']));

    expect(options).toHaveLength(2);
    expect(options[0]?.toolName).toBe('brand_guidelines');
    expect(options[1]?.toolName).toBe('create_pptx');
    expect(options[1]).toMatchObject({
      type: 'mcp-tool',
      label: 'create_pptx',
      description: 'Create a PowerPoint deck',
      serverName: 'smbteam-mcp',
    });
  });

  it('falls back to server name when description is empty', () => {
    const options = buildMcpToolMentionOptions(response, new Set(['smbteam-mcp']));
    expect(options[0]?.description).toBe('smbteam-mcp');
  });

  it('returns empty list when no servers are in scope', () => {
    expect(buildMcpToolMentionOptions(response, new Set())).toEqual([]);
  });
});

describe('formatMcpToolHint', () => {
  it('wraps the tool name in a natural-language prefix', () => {
    expect(formatMcpToolHint('create_pptx')).toBe('Use "create_pptx" to ');
  });
});
