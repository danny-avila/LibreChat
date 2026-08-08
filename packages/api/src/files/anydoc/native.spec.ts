import path from 'path';
import { extractMarkdownIsolated } from './native';

describe('AnyDoc native isolation', () => {
  const fixture = (name: string) => path.join(__dirname, '..', 'documents', name);

  test('extracts Markdown through the child process', async () => {
    const markdown = await extractMarkdownIsolated(fixture('structured.docx'), 'docx');

    expect(markdown).toContain('# Quarterly Report');
    expect(markdown).toContain('| Region | Units | Revenue |');
  });

  test('a missing file rejects instead of leaving the caller hanging', async () => {
    await expect(extractMarkdownIsolated(fixture('does-not-exist.docx'), 'docx')).rejects.toThrow();
  });
});
