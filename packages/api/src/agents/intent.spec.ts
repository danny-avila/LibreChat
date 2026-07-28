import type { LCTool, LCToolRegistry } from '@librechat/agents';
import {
  INTENT_ARG,
  NATIVE_INTENT_TOOL_NAMES,
  isIntentEligibleToolName,
  hasIntentArg,
  readIntentArg,
  stripIntentArg,
  injectIntentParam,
  stripIntentFromToolDefinitions,
  stripIntentFromToolRegistry,
  applyIntentLabels,
  synthesizeIntentToolOptions,
  mergeSynthesizedToolOptions,
} from './intent';
import { applyBackgroundToolCalls, CHECK_BACKGROUND_TASK_NAME } from './background';
import { toolOptionsSchema } from './validation';

const mcpDef = (name: string): LCTool =>
  ({
    name,
    description: `${name} description`,
    parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  }) as unknown as LCTool;

describe('isIntentEligibleToolName', () => {
  it('excludes only the poll tool and handoff tools', () => {
    expect(isIntentEligibleToolName(CHECK_BACKGROUND_TASK_NAME)).toBe(false);
    expect(isIntentEligibleToolName('lc_transfer_to_researcher')).toBe(false);
  });

  it('allows MCP, native, and code-execution tools (labels are inert)', () => {
    for (const name of [
      'search_mcp_docs',
      'web_search',
      'create_file',
      'edit_file',
      'set_memory',
      'delete_memory',
      'ask_user_question',
      'execute_code',
      'bash_tool',
      'file_search',
    ]) {
      expect(isIntentEligibleToolName(name)).toBe(true);
    }
  });
});

describe('hasIntentArg / readIntentArg / stripIntentArg', () => {
  it('detects and reads the arg on object and stringified args', () => {
    expect(hasIntentArg({ [INTENT_ARG]: 'Searching for OAuth handling' })).toBe(true);
    expect(hasIntentArg({})).toBe(false);
    expect(hasIntentArg('{"intent":"Searching"}')).toBe(true);
    expect(readIntentArg({ [INTENT_ARG]: 'Searching for OAuth handling' })).toBe(
      'Searching for OAuth handling',
    );
    expect(readIntentArg({ [INTENT_ARG]: '   ' })).toBeUndefined();
    expect(readIntentArg({ [INTENT_ARG]: 42 })).toBeUndefined();
    expect(readIntentArg('not json')).toBeUndefined();
  });

  it('strips the arg without mutating the original', () => {
    const args = { q: 'hi', [INTENT_ARG]: 'Searching' };
    const stripped = stripIntentArg(args) as Record<string, unknown>;
    expect(stripped).toEqual({ q: 'hi' });
    expect(INTENT_ARG in args).toBe(true);
  });

  it('returns non-object / arg-less args unchanged', () => {
    expect(stripIntentArg('str')).toBe('str');
    const noArg = { q: 'hi' };
    expect(stripIntentArg(noArg)).toBe(noArg);
    expect(stripIntentArg('{"intent":"Searching","q":"x"}')).toEqual({ q: 'x' });
    expect(stripIntentArg('{"q":"x"}')).toBe('{"q":"x"}');
  });
});

describe('injectIntentParam', () => {
  it('PREPENDS intent as the FIRST property without mutating a frozen def', () => {
    const def = Object.freeze(mcpDef('search_mcp_docs')) as unknown as LCTool & {
      parameters: { properties: Record<string, unknown> };
    };
    const injected = injectIntentParam(def);
    const props = (injected.parameters as { properties: Record<string, { type: string }> })
      .properties;
    expect(Object.keys(props)).toEqual([INTENT_ARG, 'q']);
    expect(props[INTENT_ARG]).toEqual(expect.objectContaining({ type: 'string' }));
    expect(INTENT_ARG in def.parameters.properties).toBe(false);
  });

  it('never adds intent to required', () => {
    const injected = injectIntentParam(mcpDef('search_mcp_docs'));
    expect((injected.parameters as { required?: string[] }).required).toEqual(['q']);
  });

  it('creates an object schema when the tool declares no parameters', () => {
    const def = { name: 'no_params' } as unknown as LCTool;
    const injected = injectIntentParam(def);
    const params = injected.parameters as { type: string; properties: Record<string, unknown> };
    expect(params.type).toBe('object');
    expect(Object.keys(params.properties)).toEqual([INTENT_ARG]);
  });

  it('is a no-op when the param already exists (position preserved)', () => {
    const def = mcpDef('search_mcp_docs');
    const once = injectIntentParam(def);
    const twice = injectIntentParam(once);
    expect(twice).toBe(once);
    expect(Object.keys((twice.parameters as { properties: object }).properties)[0]).toBe(
      INTENT_ARG,
    );
  });

  it('embeds an extensible copy of the property, not a frozen shared instance', () => {
    const first = injectIntentParam(mcpDef('a'));
    const second = injectIntentParam(mcpDef('b'));
    const firstProp = (first.parameters as { properties: Record<string, object> }).properties[
      INTENT_ARG
    ];
    const secondProp = (second.parameters as { properties: Record<string, object> }).properties[
      INTENT_ARG
    ];
    expect(firstProp).not.toBe(secondProp);
    expect(Object.isFrozen(firstProp)).toBe(false);
  });
});

describe('applyIntentLabels', () => {
  it('injects only opted-in tools and mirrors the registry entry', () => {
    const optedIn = mcpDef('search_mcp_docs');
    const notOpted = mcpDef('lookup_customer');
    const toolRegistry: LCToolRegistry = new Map([
      ['search_mcp_docs', optedIn],
      ['lookup_customer', notOpted],
    ]);
    const { toolDefinitions, intentToolNames } = applyIntentLabels({
      toolDefinitions: [optedIn, notOpted],
      toolRegistry,
      toolOptions: { search_mcp_docs: { describe_intent: true } },
    });
    expect(intentToolNames).toEqual(['search_mcp_docs']);
    const injected = toolDefinitions.find((d) => d.name === 'search_mcp_docs');
    expect(Object.keys((injected?.parameters as { properties: object }).properties)[0]).toBe(
      INTENT_ARG,
    );
    expect(toolDefinitions.find((d) => d.name === 'lookup_customer')).toBe(notOpted);
    const registryProps = (
      toolRegistry.get('search_mcp_docs')?.parameters as { properties: object }
    ).properties;
    expect(Object.keys(registryProps)[0]).toBe(INTENT_ARG);
  });

  it('defaults native host tools ON, with explicit false opting out', () => {
    const webSearch = mcpDef('web_search');
    const setMemory = mcpDef('set_memory');
    const { toolDefinitions, intentToolNames } = applyIntentLabels({
      toolDefinitions: [webSearch, setMemory],
      toolRegistry: undefined,
      toolOptions: { set_memory: { describe_intent: false } },
    });
    expect(intentToolNames).toEqual(['web_search']);
    expect(toolDefinitions.find((d) => d.name === 'set_memory')).toBe(setMemory);
  });

  it('covers every advertised native tool name', () => {
    const defs = [...NATIVE_INTENT_TOOL_NAMES].map((name) => mcpDef(name));
    const { intentToolNames } = applyIntentLabels({
      toolDefinitions: defs,
      toolRegistry: undefined,
      toolOptions: undefined,
    });
    expect(intentToolNames.sort()).toEqual([...NATIVE_INTENT_TOOL_NAMES].sort());
  });

  it('skips SDK-native defs that already declare intent (not counted as host-injected)', () => {
    const sdkNative = {
      name: 'read_file',
      parameters: {
        type: 'object',
        properties: { intent: { type: 'string' }, path: { type: 'string' } },
      },
    } as unknown as LCTool;
    const { toolDefinitions, intentToolNames } = applyIntentLabels({
      toolDefinitions: [sdkNative],
      toolRegistry: undefined,
      toolOptions: { read_file: { describe_intent: true } },
    });
    expect(intentToolNames).toEqual([]);
    expect(toolDefinitions[0]).toBe(sdkNative);
  });

  it('skips a non-object (string-input) schema without rewriting it', () => {
    const stringInput = {
      name: 'legacy_tool',
      parameters: { type: 'string' },
    } as unknown as LCTool;
    const { toolDefinitions, intentToolNames } = applyIntentLabels({
      toolDefinitions: [stringInput],
      toolRegistry: undefined,
      toolOptions: { legacy_tool: { describe_intent: true } },
    });
    expect(intentToolNames).toEqual([]);
    expect(toolDefinitions[0]).toBe(stringInput);
  });

  it('skips PTC-only tools (no card ever renders)', () => {
    const ptcOnly = {
      ...mcpDef('sandbox_helper'),
      allowed_callers: ['code_execution'],
    } as unknown as LCTool;
    const { intentToolNames } = applyIntentLabels({
      toolDefinitions: [ptcOnly],
      toolRegistry: undefined,
      toolOptions: { sandbox_helper: { describe_intent: true } },
    });
    expect(intentToolNames).toEqual([]);
  });

  it('honors the host excludeTool predicate', () => {
    const def = mcpDef('search_mcp_ephemeral');
    const { intentToolNames } = applyIntentLabels({
      toolDefinitions: [def],
      toolRegistry: undefined,
      toolOptions: { search_mcp_ephemeral: { describe_intent: true } },
      excludeTool: () => true,
    });
    expect(intentToolNames).toEqual([]);
  });

  it('keeps intent FIRST when background injection runs after it', () => {
    const def = mcpDef('search_mcp_docs');
    const toolRegistry: LCToolRegistry = new Map([['search_mcp_docs', def]]);
    const toolOptions = {
      search_mcp_docs: { describe_intent: true, run_in_background: true },
    };
    const intentResult = applyIntentLabels({
      toolDefinitions: [def],
      toolRegistry,
      toolOptions,
    });
    const backgroundResult = applyBackgroundToolCalls({
      toolDefinitions: intentResult.toolDefinitions,
      toolRegistry,
      toolOptions,
    });
    const finalDef = backgroundResult.toolDefinitions.find((d) => d.name === 'search_mcp_docs');
    const keys = Object.keys((finalDef?.parameters as { properties: object }).properties);
    expect(keys[0]).toBe(INTENT_ARG);
    expect(keys).toContain('run_in_background');
    expect(backgroundResult.backgroundToolNames).toEqual(['search_mcp_docs']);
  });
});

describe('stripIntentFromToolDefinitions / stripIntentFromToolRegistry', () => {
  it('removes the injected param only from named tools, without mutating inputs', () => {
    const injected = injectIntentParam(mcpDef('search_mcp_docs'));
    const sdkNative = injectIntentParam(mcpDef('read_file'));
    const defs = [injected, sdkNative];
    const stripped = stripIntentFromToolDefinitions(defs, ['search_mcp_docs']);
    const searchDef = stripped.find((d) => d.name === 'search_mcp_docs');
    expect(INTENT_ARG in (searchDef?.parameters as { properties: object }).properties).toBe(false);
    expect(stripped.find((d) => d.name === 'read_file')).toBe(sdkNative);
    expect(INTENT_ARG in (injected.parameters as { properties: object }).properties).toBe(true);
  });

  it('returns the same references when nothing is named', () => {
    const defs = [injectIntentParam(mcpDef('a'))];
    expect(stripIntentFromToolDefinitions(defs, [])).toBe(defs);
    const registry: LCToolRegistry = new Map([['a', defs[0]]]);
    expect(stripIntentFromToolRegistry(registry, undefined)).toBe(registry);
  });

  it('registry strip returns a NEW registry with the param removed', () => {
    const injected = injectIntentParam(mcpDef('search_mcp_docs'));
    const registry: LCToolRegistry = new Map([['search_mcp_docs', injected]]);
    const next = stripIntentFromToolRegistry(registry, ['search_mcp_docs']);
    expect(next).not.toBe(registry);
    const props = (next?.get('search_mcp_docs')?.parameters as { properties: object }).properties;
    expect(INTENT_ARG in props).toBe(false);
    const originalProps = (registry.get('search_mcp_docs')?.parameters as { properties: object })
      .properties;
    expect(INTENT_ARG in originalProps).toBe(true);
  });
});

describe('synthesizeIntentToolOptions', () => {
  it('returns undefined when neither the ephemeral toggle nor the model spec enables it', () => {
    expect(synthesizeIntentToolOptions(['web_search'], {})).toBeUndefined();
    expect(
      synthesizeIntentToolOptions(['web_search'], {
        ephemeralAgent: { describe_intent: false },
        modelSpec: { describeIntent: false },
      }),
    ).toBeUndefined();
  });

  it('marks only eligible tools', () => {
    const options = synthesizeIntentToolOptions(
      ['web_search', CHECK_BACKGROUND_TASK_NAME, 'lc_transfer_to_researcher'],
      { ephemeralAgent: { describe_intent: true } },
    );
    expect(options).toEqual({ web_search: { describe_intent: true } });
  });

  it('returns undefined when nothing is eligible', () => {
    expect(
      synthesizeIntentToolOptions([CHECK_BACKGROUND_TASK_NAME], {
        modelSpec: { describeIntent: true },
      }),
    ).toBeUndefined();
  });
});

describe('mergeSynthesizedToolOptions', () => {
  it('merges per-tool entries without dropping sibling keys', () => {
    const merged = mergeSynthesizedToolOptions(
      { web_search: { run_in_background: true }, other: { defer_loading: true } },
      { web_search: { describe_intent: true } },
    );
    expect(merged).toEqual({
      web_search: { run_in_background: true, describe_intent: true },
      other: { defer_loading: true },
    });
  });

  it('passes through when either side is absent', () => {
    const base = { web_search: { run_in_background: true } };
    expect(mergeSynthesizedToolOptions(base, undefined)).toBe(base);
    const extra = { web_search: { describe_intent: true } };
    expect(mergeSynthesizedToolOptions(undefined, extra)).toBe(extra);
  });
});

describe('toolOptionsSchema', () => {
  it('preserves describe_intent alongside the existing options', () => {
    const parsed = toolOptionsSchema.parse({
      defer_loading: true,
      run_in_background: true,
      describe_intent: true,
    });
    expect(parsed).toEqual({
      defer_loading: true,
      run_in_background: true,
      describe_intent: true,
    });
  });

  it('strips unknown keys but keeps describe_intent', () => {
    const parsed = toolOptionsSchema.parse({ describe_intent: false, bogus: 1 });
    expect(parsed).toEqual({ describe_intent: false });
  });
});
