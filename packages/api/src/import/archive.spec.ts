import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

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

  it('accumulates actual decompressed bytes across repeated reads and rejects once the aggregate cap is exceeded', async () => {
    const filepath = await writeZip({ 'a.json': 'x'.repeat(60) });
    const archive = await openArchive(filepath, { maxTotalBytes: 100 });

    await archive.read('a.json');
    await expect(archive.read('a.json')).rejects.toThrow(ZipBombError);

    archive.close();
  });
});

describe('openArchive (bare / non-zip upload)', () => {
  function writeBareFile(content: string, filename: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-bare-'));
    createdDirs.push(dir);
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, content);
    return filepath;
  }

  it('wraps a bare JSON file as a single entry named after the upload', async () => {
    const filepath = writeBareFile('{"ok":true}', 'my-export.json');
    const archive = await openArchive(filepath);

    expect(archive.entries).toEqual([{ name: 'my-export.json', bytes: 11 }]);
    expect((await archive.read('my-export.json')).toString()).toBe('{"ok":true}');

    archive.close();
  });

  it('rejects a bare JSON file larger than the per-entry cap while reading', async () => {
    const filepath = writeBareFile('x'.repeat(5000), 'big.json');
    const archive = await openArchive(filepath, { maxEntryBytes: 100 });

    await expect(archive.read('big.json')).rejects.toThrow(ZipBombError);
  });

  it('rejects immediately when a bare JSON file exceeds the total-bytes cap by its own size', async () => {
    const filepath = writeBareFile('x'.repeat(200), 'huge.json');

    await expect(openArchive(filepath, { maxTotalBytes: 100 })).rejects.toThrow(ZipBombError);
  });

  it('throws a clear error for an unknown entry name on a bare JSON file', async () => {
    const filepath = writeBareFile('{}', 'export.json');
    const archive = await openArchive(filepath);

    await expect(archive.read('nope.json')).rejects.toThrow(/nope\.json/);
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
