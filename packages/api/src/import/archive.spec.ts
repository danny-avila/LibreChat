import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

import type { Readable } from 'stream';

import { assertSafeName, openArchive, ZipBombError } from './archive';

const createdDirs: string[] = [];

async function writeZip(files: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-'));
  createdDirs.push(dir);
  const filepath = path.join(dir, 'export.zip');
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

function consumeStream(readable: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (chunk: Buffer) => chunks.push(chunk));
    readable.on('error', reject);
    readable.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('openArchive', () => {
  it('lists entries and reads one by name', async () => {
    const filepath = await writeZip({ 'a.json': '{"ok":true}', 'b.txt': 'hello' });
    const archive = await openArchive(filepath);

    expect(archive.entries.map((entry) => entry.name).sort()).toEqual(['a.json', 'b.txt']);
    expect((await archive.read('a.json')).toString()).toBe('{"ok":true}');

    archive.close();
  });

  it('rejects entries that escape the archive root', async () => {
    const filepath = await writeZip({ '../evil.json': '{}' });
    await expect(openArchive(filepath)).rejects.toThrow(/traversal/i);
  });

  it('rejects an archive with too many entries', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      files[`f${i}.json`] = '{}';
    }
    const filepath = await writeZip(files);
    await expect(openArchive(filepath, { maxEntries: 10 })).rejects.toThrow(ZipBombError);
  });

  it('rejects an entry larger than the per-entry cap while streaming', async () => {
    const filepath = await writeZip({ 'big.json': 'x'.repeat(5000) });
    const archive = await openArchive(filepath, { maxEntryBytes: 100 });
    await expect(archive.read('big.json')).rejects.toThrow(ZipBombError);
    archive.close();
  });

  it('throws a clear error for a missing entry', async () => {
    const filepath = await writeZip({ 'a.json': '{}' });
    const archive = await openArchive(filepath);
    await expect(archive.read('nope.json')).rejects.toThrow(/nope\.json/);
    archive.close();
  });

  it('streams a normal entry fully intact through stream()', async () => {
    const filepath = await writeZip({ 'a.json': '{"ok":true}' });
    const archive = await openArchive(filepath);

    const readable = await archive.stream('a.json');
    const result = await consumeStream(readable);
    expect(result.toString()).toBe('{"ok":true}');

    archive.close();
  });

  it('rejects an entry larger than the per-entry cap while streaming via stream()', async () => {
    const filepath = await writeZip({ 'big.json': 'x'.repeat(5000) });
    const archive = await openArchive(filepath, { maxEntryBytes: 100 });

    const readable = await archive.stream('big.json');
    await expect(consumeStream(readable)).rejects.toThrow(ZipBombError);

    archive.close();
  });

  it('accumulates actual decompressed bytes across repeated reads and rejects once the aggregate cap is exceeded', async () => {
    const filepath = await writeZip({ 'a.json': 'x'.repeat(60) });
    const archive = await openArchive(filepath, { maxTotalBytes: 100 });

    await archive.read('a.json');
    await expect(archive.read('a.json')).rejects.toThrow(ZipBombError);

    archive.close();
  });

  it('shares the aggregate byte counter between read() and stream()', async () => {
    const filepath = await writeZip({ 'a.json': 'x'.repeat(60) });
    const archive = await openArchive(filepath, { maxTotalBytes: 100 });

    await archive.read('a.json');
    const readable = await archive.stream('a.json');
    await expect(consumeStream(readable)).rejects.toThrow(ZipBombError);

    archive.close();
  });
});

describe('assertSafeName', () => {
  it('rejects a relative traversal segment', () => {
    expect(() => assertSafeName('../evil.json')).toThrow(/traversal/i);
  });

  it('rejects an absolute POSIX path', () => {
    expect(() => assertSafeName('/etc/passwd')).toThrow(/absolute/i);
  });

  it('rejects a Windows drive-letter path', () => {
    expect(() => assertSafeName('C:\\windows\\evil.json')).toThrow(/absolute/i);
  });

  it('rejects a traversal segment nested inside a longer path', () => {
    expect(() => assertSafeName('a/../../b')).toThrow(/traversal/i);
  });

  it('accepts a benign nested path', () => {
    expect(() => assertSafeName('dir/file.json')).not.toThrow();
  });
});
