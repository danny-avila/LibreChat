import { Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import {
  PACKAGE_OF_PRACTICES_TOOL_BASE,
  getToolCallBaseName,
  isPackageOfPracticesToolName,
  messageContentHasPopTool,
} from './packageOfPracticesUiMask';

describe('packageOfPracticesUiMask', () => {
  describe('getToolCallBaseName', () => {
    it('returns plain name when no delimiter', () => {
      expect(getToolCallBaseName(PACKAGE_OF_PRACTICES_TOOL_BASE)).toBe(PACKAGE_OF_PRACTICES_TOOL_BASE);
    });

    it('strips MCP server suffix for pop', () => {
      const raw = `${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop`;
      expect(getToolCallBaseName(raw)).toBe(PACKAGE_OF_PRACTICES_TOOL_BASE);
    });

    it('strips MCP server suffix for pop-tool', () => {
      const raw = `${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop-tool`;
      expect(getToolCallBaseName(raw)).toBe(PACKAGE_OF_PRACTICES_TOOL_BASE);
    });
  });

  describe('isPackageOfPracticesToolName', () => {
    it('matches base and MCP-prefixed names', () => {
      expect(isPackageOfPracticesToolName(PACKAGE_OF_PRACTICES_TOOL_BASE)).toBe(true);
      expect(
        isPackageOfPracticesToolName(`${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop`),
      ).toBe(true);
      expect(
        isPackageOfPracticesToolName(
          `${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop-tool`,
        ),
      ).toBe(true);
      expect(isPackageOfPracticesToolName('other_tool')).toBe(false);
    });
  });

  describe('messageContentHasPopTool', () => {
    it('detects PoP in JSON string content after reload', () => {
      const json = JSON.stringify([
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: {
            type: ToolCallTypes.TOOL_CALL,
            name: `${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop`,
            id: 't1',
          },
        },
        { type: ContentTypes.TEXT, text: 'LLM answer' },
      ]);
      expect(messageContentHasPopTool(json)).toBe(true);
    });

    it('detects pop-tool MCP suffix in JSON string content', () => {
      const json = JSON.stringify([
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: {
            name: `${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}pop-tool`,
          },
        },
      ]);
      expect(messageContentHasPopTool(json)).toBe(true);
    });
  });
});
