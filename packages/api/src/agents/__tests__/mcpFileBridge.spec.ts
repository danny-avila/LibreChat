import { Readable } from 'stream';
import { Constants } from '@librechat/agents';
import type { IMongoFile } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { ServerRequest } from '~/types';
import {
  buildFileBridgeNote,
  resolveFileReferences,
  MAX_BINARY_BYTES,
} from '../mcpFileBridge';

const MCP_TOOL = `Google_Drive${Constants.MCP_DELIMITER}create_file`;

function makeFile(overrides: Partial<IMongoFile> & { file_id: string }): IMongoFile {
  const { file_id, ...rest } = overrides;
  return {
    user: 'user-1',
    file_id,
    filename: rest.filename ?? `${file_id}.pdf`,
    filepath: rest.filepath ?? `/storage/${file_id}`,
    source: rest.source ?? 'local',
    type: rest.type ?? 'application/pdf',
    bytes: rest.bytes ?? 4,
    object: 'file',
    usage: 0,
    ...rest,
  } as unknown as IMongoFile;
}

function makeDeps(
  files: IMongoFile[],
  contentById: Record<string, Buffer> = {},
): {
  getFiles: (filter: FilterQuery<IMongoFile>) => Promise<IMongoFile[] | null>;
  getStrategyFunctions: (source: string) => {
    getDownloadStream: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
  };
  calls: { filters: FilterQuery<IMongoFile>[] };
} {
  const byPath = new Map<string, Buffer>();
  for (const f of files) {
    byPath.set(f.filepath, contentById[f.file_id] ?? Buffer.from('data'));
  }
  const calls = { filters: [] as FilterQuery<IMongoFile>[] };
  return {
    calls,
    getFiles: async (filter) => {
      calls.filters.push(filter);
      const idFilter = filter.file_id as { $in?: string[] } | undefined;
      const ids = idFilter?.$in ?? [];
      const userMatch = (f: IMongoFile): boolean =>
        filter.user == null || String(f.user) === String(filter.user);
      return files.filter((f) => ids.includes(f.file_id) && userMatch(f));
    },
    getStrategyFunctions: () => ({
      getDownloadStream: async (_req, filepath) => {
        const buf = byPath.get(filepath);
        return Readable.from(buf ? [buf] : []);
      },
    }),
  };
}

const req = { user: { id: 'user-1' } } as unknown as ServerRequest;

describe('resolveFileReferences', () => {
  it('replaces a token-only value with base64', async () => {
    const file = makeFile({ file_id: 'aaaaaaaa-1111' });
    const deps = makeDeps([file], { 'aaaaaaaa-1111': Buffer.from('hello pdf') });
    const args = { name: 'q3.pdf', base64Content: '@librechat-file:aaaaaaaa-1111' };

    const { args: out, resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(resolved).toEqual(['aaaaaaaa-1111']);
    const result = out as Record<string, unknown>;
    expect(result.base64Content).toBe(Buffer.from('hello pdf').toString('base64'));
    expect(result.contentMimeType).toBe('application/pdf');
    expect(args.base64Content).toBe('@librechat-file:aaaaaaaa-1111');
  });

  it('replaces an embedded token within a larger string', async () => {
    const file = makeFile({ file_id: 'bbbbbbbb-2222', type: 'image/png' });
    const deps = makeDeps([file], { 'bbbbbbbb-2222': Buffer.from('PNG') });
    const args = { note: 'here are the bytes: @librechat-file:bbbbbbbb-2222 end' };

    const { args: out } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    const result = out as Record<string, string>;
    expect(result.note).toBe(`here are the bytes: ${Buffer.from('PNG').toString('base64')} end`);
  });

  it('leaves non-MCP tool args untouched', async () => {
    const file = makeFile({ file_id: 'cccccccc-3333' });
    const deps = makeDeps([file]);
    const args = { base64Content: '@librechat-file:cccccccc-3333' };

    const { args: out, resolved } = await resolveFileReferences({
      name: 'execute_code',
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(out).toBe(args);
    expect(resolved).toEqual([]);
    expect(deps.calls.filters).toHaveLength(0);
  });

  it('returns an inline error and does not throw when the file is missing', async () => {
    const deps = makeDeps([]);
    const args = { base64Content: '@librechat-file:dddddddd-4444' };

    const { args: out, resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(resolved).toEqual([]);
    const result = out as Record<string, string>;
    expect(result.base64Content).toContain('[error:');
    expect(result.base64Content).toContain('not found');
  });

  it('returns an error string for an oversize file without streaming it', async () => {
    const file = makeFile({ file_id: 'eeeeeeee-5555', bytes: MAX_BINARY_BYTES + 1 });
    const deps = makeDeps([file]);
    const args = { base64Content: '@librechat-file:eeeeeeee-5555' };

    const { args: out, resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(resolved).toEqual([]);
    const result = out as Record<string, string>;
    expect(result.base64Content).toContain('[error:');
    expect(result.base64Content).toContain('upload limit');
  });

  it('scopes the lookup to the requesting user', async () => {
    const file = makeFile({
      file_id: 'ffffffff-6666',
      user: 'other-user' as unknown as IMongoFile['user'],
    });
    const deps = makeDeps([file]);
    const args = { base64Content: '@librechat-file:ffffffff-6666' };

    const { resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(resolved).toEqual([]);
    expect(deps.calls.filters[0].user).toBe('user-1');
  });

  it('walks nested object and array arguments', async () => {
    const a = makeFile({ file_id: 'aaaa1111-7777' });
    const b = makeFile({ file_id: 'bbbb2222-8888' });
    const deps = makeDeps([a, b], {
      'aaaa1111-7777': Buffer.from('A'),
      'bbbb2222-8888': Buffer.from('B'),
    });
    const args = {
      files: [
        { content: '@librechat-file:aaaa1111-7777' },
        { nested: { content: '@librechat-file:bbbb2222-8888' } },
      ],
    };

    const { args: out, resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      ...deps,
    });

    expect(resolved.sort()).toEqual(['aaaa1111-7777', 'bbbb2222-8888']);
    const result = out as {
      files: [{ content: string }, { nested: { content: string } }];
    };
    expect(result.files[0].content).toBe(Buffer.from('A').toString('base64'));
    expect(result.files[1].nested.content).toBe(Buffer.from('B').toString('base64'));
  });

  it('is a no-op when getFiles is not provided', async () => {
    const args = { base64Content: '@librechat-file:aaaaaaaa-1111' };
    const { args: out, resolved } = await resolveFileReferences({
      name: MCP_TOOL,
      args,
      req,
      userId: 'user-1',
      getStrategyFunctions: () => ({ getDownloadStream: async () => Readable.from([]) }),
    });
    expect(out).toBe(args);
    expect(resolved).toEqual([]);
  });
});

describe('buildFileBridgeNote', () => {
  it('returns empty string when there are no files', () => {
    expect(buildFileBridgeNote([])).toBe('');
  });

  it('lists files as id | filename | mimetype and states the convention', () => {
    const note = buildFileBridgeNote([
      { file_id: 'aaaaaaaa-1111', filename: 'report.pdf', type: 'application/pdf' },
    ]);
    expect(note).toContain('aaaaaaaa-1111 | report.pdf | application/pdf');
    expect(note).toContain('@librechat-file:<id>');
    expect(note).toContain('base64Content');
  });
});
