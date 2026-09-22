import type { AgentToolOptions } from 'librechat-data-provider';
import type { JsonSchemaType } from '@librechat/agents';
import type { ToolDefinition } from './classification';
import {
  schemaByteSize,
  resolveDeferLoading,
  buildToolRegistryFromAgentOptions,
} from './classification';

/** An argument schema of roughly the requested serialized size. */
function schemaOfSize(bytes: number): JsonSchemaType {
  const filler = 'x'.repeat(Math.max(1, bytes));
  return {
    type: 'object',
    properties: { body: { type: 'string', description: filler } },
  } as unknown as JsonSchemaType;
}

const SMALL = schemaOfSize(50);
const HUGE = schemaOfSize(20_000);

function toolDef(name: string, parameters?: JsonSchemaType): ToolDefinition {
  return { name, description: `${name} description`, parameters, serverName: 'Server' };
}

describe('schemaByteSize', () => {
  it('measures the serialized schema', () => {
    expect(schemaByteSize(SMALL)).toBeGreaterThan(50);
    expect(schemaByteSize(HUGE)).toBeGreaterThan(20_000);
  });

  it('treats a missing schema as weightless', () => {
    expect(schemaByteSize(undefined)).toBe(0);
  });

  it('does not throw on a schema that cannot be serialized', () => {
    const circular: Record<string, unknown> = { type: 'object' };
    circular.self = circular;

    expect(schemaByteSize(circular as unknown as JsonSchemaType)).toBe(0);
  });
});

describe('resolveDeferLoading', () => {
  it('leaves every tool loaded when the rule is off', () => {
    expect(resolveDeferLoading(undefined, HUGE, 0)).toBe(false);
  });

  it('defers a schema over the limit', () => {
    expect(resolveDeferLoading(undefined, HUGE, 4_096)).toBe(true);
  });

  it('leaves a schema under the limit alone', () => {
    expect(resolveDeferLoading(undefined, SMALL, 4_096)).toBe(false);
  });

  it('lets an explicit false pin a huge tool open', () => {
    expect(resolveDeferLoading(false, HUGE, 4_096)).toBe(false);
  });

  it('lets an explicit true defer a small tool', () => {
    expect(resolveDeferLoading(true, SMALL, 0)).toBe(true);
  });

  it('treats a tool with no schema as under any limit', () => {
    expect(resolveDeferLoading(undefined, undefined, 1)).toBe(false);
  });
});

describe('buildToolRegistryFromAgentOptions with a size rule', () => {
  const tools = [toolDef('small_mcp_Server', SMALL), toolDef('huge_mcp_Server', HUGE)];

  it('reproduces today behavior when the rule is not configured', () => {
    const registry = buildToolRegistryFromAgentOptions(tools, {});

    expect(registry.get('small_mcp_Server')?.defer_loading).toBe(false);
    expect(registry.get('huge_mcp_Server')?.defer_loading).toBe(false);
  });

  it('defers only the oversized tool once the rule is set', () => {
    const registry = buildToolRegistryFromAgentOptions(tools, {}, 4_096);

    expect(registry.get('small_mcp_Server')?.defer_loading).toBe(false);
    expect(registry.get('huge_mcp_Server')?.defer_loading).toBe(true);
  });

  it('keeps the tool description, which is what a shortlist reads', () => {
    const registry = buildToolRegistryFromAgentOptions(tools, {}, 4_096);

    expect(registry.get('huge_mcp_Server')?.description).toBe('huge_mcp_Server description');
    expect(registry.get('huge_mcp_Server')?.parameters).toBe(HUGE);
  });

  it('lets a per-tool choice override the rule in both directions', () => {
    const options: AgentToolOptions = {
      huge_mcp_Server: { defer_loading: false },
      small_mcp_Server: { defer_loading: true },
    };

    const registry = buildToolRegistryFromAgentOptions(tools, options, 4_096);

    expect(registry.get('huge_mcp_Server')?.defer_loading).toBe(false);
    expect(registry.get('small_mcp_Server')?.defer_loading).toBe(true);
  });

  it('applies the rule to a tool whose options set something unrelated', () => {
    const options: AgentToolOptions = {
      huge_mcp_Server: { allowed_callers: ['direct'] },
    };

    const registry = buildToolRegistryFromAgentOptions(tools, options, 4_096);

    expect(registry.get('huge_mcp_Server')?.defer_loading).toBe(true);
  });
});
