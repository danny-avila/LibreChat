import { buildFixtureExport, cleanupFixtureExport } from './__data__/fixture';
import { inspectExport } from './inspect';

describe('inspectExport', () => {
  afterEach(() => {
    cleanupFixtureExport();
  });

  it('summarizes conversations, assets, and state without writing', async () => {
    const filepath = await buildFixtureExport();
    const { summary } = await inspectExport(filepath);

    expect(summary.source).toBe('chatgpt');
    expect(summary.manifestVersion).toBe(1);
    expect(summary.shards).toBe(2);
    expect(summary.conversations).toBe(2);
    expect(summary.assets).toBe(3);
    expect(summary.assetBytes).toBe(12);
    expect(summary.archived).toBe(1);
    expect(summary.starred).toBe(1);
  });

  it('still works when the manifest is missing', async () => {
    const filepath = await buildFixtureExport({ omitManifest: true });
    const { summary } = await inspectExport(filepath);

    expect(summary.manifestVersion).toBeNull();
    expect(summary.source).toBe('chatgpt');
    expect(summary.conversations).toBe(2);
  });

  it('rejects an archive with no recognizable conversations', async () => {
    const JSZip = (await import('jszip')).default;
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    const zip = new JSZip();
    zip.file('readme.txt', 'nothing here');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-import-empty-'));
    const filepath = path.join(dir, 'empty.zip');
    fs.writeFileSync(filepath, buffer);

    await expect(inspectExport(filepath)).rejects.toThrow(/Unsupported import type/);
  });
});
