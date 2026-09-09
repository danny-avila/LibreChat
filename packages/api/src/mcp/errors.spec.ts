import { ErrorEvent } from 'eventsource';
import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { isMCPTransportAuthenticationError, MCPTransportAuthenticationError } from './errors';

describe('direct bearer transport rejection classification', () => {
  it.each([
    new StreamableHTTPError(401, 'unauthorized'),
    new SseError(403, 'forbidden', new ErrorEvent('error')),
    new UnauthorizedError(),
    new MCPTransportAuthenticationError(401),
  ])('recognizes a structured SDK or HTTP rejection: %s', (error) => {
    expect(isMCPTransportAuthenticationError(error)).toBe(true);
  });

  it.each([
    new McpError(ErrorCode.InternalError, 'downstream HTTP 401 invalid_token'),
    new McpError(401, 'invalid_token'),
    new Error('HTTP 401 invalid_token'),
    new StreamableHTTPError(500, 'downstream HTTP 401'),
  ])('does not infer transport rejection from tool codes or messages: %s', (error) => {
    expect(isMCPTransportAuthenticationError(error)).toBe(false);
  });
});
