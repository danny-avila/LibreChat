const { StructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

/**
 * Woodland FAQ Search Tool
 * Wrapper for the Azure AI Search MCP server
 * This tool is registered as a standard LibreChat tool and delegates to the MCP server
 */
class WoodlandFAQSearchTool extends StructuredTool {
  constructor() {
    super();
    this.name = 'woodland-ai-search-faq';
    this.description = `Search the Woodland FAQ knowledge base for frequently asked questions and answers about Cyclone Rake products, parts, engines, and compatibility.
    
Use this tool when:
- User asks about part numbers, SKUs, or replacement parts
- Questions about specific rake models (Classic, Commander, Commercial, etc.)
- Engine specifications or upgrades
- Product compatibility or fitment questions
- Historical product information

The tool automatically detects model names, part numbers, and tags from the query and returns scored, relevant FAQ entries with citations.`;

    this.schema = z.object({
      query: z
        .string()
        .min(3)
        .describe('The full user question or search query'),
      top: z
        .number()
        .optional()
        .default(5)
        .describe('Number of FAQ results to return (default: 5)'),
    });
  }

  async _call({ query, top = 5 }) {
    try {
      // This tool relies on the MCP server being available in the LibreChat runtime
      // The actual MCP communication is handled by LibreChat's MCP integration
      // This is a placeholder that would be replaced by LibreChat's MCP client
      
      // For now, return a structured response that matches what the MCP server would provide
      return JSON.stringify({
        note: 'This tool requires MCP server configuration in LibreChat',
        tool: 'woodland-ai-search-faq',
        mcpServer: 'azure-search-faq',
        query,
        top,
      });
    } catch (error) {
      console.error('[WoodlandFAQSearchTool] Error:', error);
      throw new Error(`FAQ search failed: ${error.message}`);
    }
  }
}

module.exports = WoodlandFAQSearchTool;
