import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

import { openArchive, ZipBombError } from './archive';

async function writeZip(files: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-'));
  const filepath = path.join(dir, 'export.zip');
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

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
});
