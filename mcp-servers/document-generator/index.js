import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { generateMarkdown } from './generators/markdown.js';
import { generatePDF } from './generators/pdf.js';
import path from 'path';

// Output directory for generated documents
const OUTPUT_PATH = process.env.DOCUMENTS_PATH || '/app/uploads/documents';

// Base URL for document downloads (adjust based on your deployment)
const BASE_URL = process.env.DOCUMENTS_BASE_URL || 'http://localhost:3080';

const server = new Server(
  {
    name: 'document-generator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'generate_markdown',
        description: 'Generate a Markdown document from text, markdown, or HTML content. Returns the filepath to the generated .md file.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The document content (plain text, markdown, or HTML)',
            },
            filename: {
              type: 'string',
              description: 'Optional filename (without extension). If not provided, a timestamp-based name will be used.',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'generate_pdf',
        description: 'Generate a PDF document from text, markdown, or HTML content. Returns the filepath to the generated .pdf file.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The document content (plain text, markdown, or HTML)',
            },
            filename: {
              type: 'string',
              description: 'Optional filename (without extension). If not provided, a timestamp-based name will be used.',
            },
            title: {
              type: 'string',
              description: 'Optional document title for PDF metadata',
            },
            fontSize: {
              type: 'number',
              description: 'Optional base font size (default: 12)',
            },
          },
          required: ['content'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'generate_markdown') {
      const { content, filename } = args;

      if (!content) {
        return {
          content: [{ type: 'text', text: 'Error: content is required' }],
          isError: true,
        };
      }

      const result = await generateMarkdown(content, filename, OUTPUT_PATH);
      const downloadUrl = `${BASE_URL}/images/documents/${result.filename}`;

      return {
        content: [
          {
            type: 'text',
            text: `Markdown document generated successfully!\n\nFile: ${result.filename}\nPath: ${result.filepath}\nDownload URL: ${downloadUrl}\n\nYou can download the file using the URL above or access it directly from the server.`,
          },
        ],
      };
    }

    if (name === 'generate_pdf') {
      const { content, filename, title, fontSize } = args;

      if (!content) {
        return {
          content: [{ type: 'text', text: 'Error: content is required' }],
          isError: true,
        };
      }

      const options = {};
      if (title) options.title = title;
      if (fontSize) options.fontSize = fontSize;

      const result = await generatePDF(content, filename, OUTPUT_PATH, options);
      const downloadUrl = `${BASE_URL}/images/documents/${result.filename}`;

      return {
        content: [
          {
            type: 'text',
            text: `PDF document generated successfully!\n\nFile: ${result.filename}\nPath: ${result.filepath}\nDownload URL: ${downloadUrl}\n\nYou can download the file using the URL above or access it directly from the server.`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Document Generator MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
