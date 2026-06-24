import { transformMCPToolArguments } from './transformMCPToolArguments';
import type { FileResolver } from './transformMCPToolArguments';

const resolver: FileResolver = async (ref) => {
  if (ref === 'abc123') {
    return { base64: 'UEsDBABAS0=', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  if (ref === 'report.xlsx') {
    return { base64: 'QklOAA==' };
  }
  return null;
};

describe('transformMCPToolArguments', () => {
  it('passes through when not an MCP tool', async () => {
    const args = { base64Content: '@file:abc123' };
    const out = await transformMCPToolArguments({ isMCPTool: false, args, resolveFile: resolver });
    expect(out).toBe(args);
  });

  it('passes through when there is no file reference', async () => {
    const args = { title: 'notes.txt', textContent: 'hello' };
    const out = await transformMCPToolArguments({ isMCPTool: true, args, resolveFile: resolver });
    expect(out).toBe(args);
  });

  it('resolves a base64 content placeholder and fills mime type', async () => {
    const args = { title: 'q3.xlsx', base64Content: '@file:abc123' };
    const out = (await transformMCPToolArguments({
      isMCPTool: true,
      args,
      resolveFile: resolver,
    })) as Record<string, unknown>;
    expect(out.base64Content).toBe('UEsDBABAS0=');
    expect(out.contentMimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('does not overwrite an explicit mime type', async () => {
    const args = { base64Content: '@file:abc123', contentMimeType: 'application/custom' };
    const out = (await transformMCPToolArguments({
      isMCPTool: true,
      args,
      resolveFile: resolver,
    })) as Record<string, unknown>;
    expect(out.contentMimeType).toBe('application/custom');
  });

  it('moves a text-content placeholder onto base64Content', async () => {
    const args = { title: 'report.xlsx', textContent: '@file:report.xlsx' };
    const out = (await transformMCPToolArguments({
      isMCPTool: true,
      args,
      resolveFile: resolver,
    })) as Record<string, unknown>;
    expect(out.base64Content).toBe('QklOAA==');
    expect('textContent' in out).toBe(false);
  });

  it('leaves arguments untouched when the reference cannot be resolved', async () => {
    const args = { base64Content: '@file:missing' };
    const out = await transformMCPToolArguments({ isMCPTool: true, args, resolveFile: resolver });
    expect(out).toBe(args);
  });
});
