import { Constants, actionDelimiter } from 'librechat-data-provider';
import { getToolIconType } from '../ToolOutput/ToolIcon';

describe('getToolIconType - ACTN-01: Action delimiter detection', () => {
  it('returns "action" for tool name containing actionDelimiter', () => {
    const toolName = `get_weather${actionDelimiter}weather---api---com`;
    expect(getToolIconType(toolName)).toBe('action');
  });

  it('returns "mcp" when name has both mcp_delimiter and actionDelimiter', () => {
    const toolName = `tool${Constants.mcp_delimiter}server`;
    expect(getToolIconType(toolName)).toBe('mcp');
  });

  it('returns "mcp" not "action" for MCP tool whose name ends with _action (cross-delimiter collision)', () => {
    const toolName = `get_action${Constants.mcp_delimiter}myserver`;
    expect(getToolIconType(toolName)).not.toBe('action');
    expect(getToolIconType(toolName)).toBe('mcp');
  });

  it('returns "generic" for plain tool name without delimiters', () => {
    expect(getToolIconType('some_plain_tool')).toBe('generic');
  });

  it('returns correct types for existing tool names', () => {
    expect(getToolIconType('execute_code')).toBe('execute_code');
    expect(getToolIconType(Constants.PROGRAMMATIC_TOOL_CALLING)).toBe('execute_code');
    expect(getToolIconType('web_search')).toBe('web_search');
    expect(getToolIconType('image_gen_oai')).toBe('image_gen');
    expect(getToolIconType('image_edit_oai')).toBe('image_gen');
    expect(getToolIconType('gemini_image_gen')).toBe('image_gen');
    expect(getToolIconType(`${Constants.LC_TRANSFER_TO_}agent1`)).toBe('agent_handoff');
  });
});
