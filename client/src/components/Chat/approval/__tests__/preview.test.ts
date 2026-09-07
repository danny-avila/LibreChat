import { buildApprovalPreview, buildApprovalPreviews } from '../preview';

describe('buildApprovalPreview', () => {
  test('shows the exact effective command and reveals bidi control characters', () => {
    const preview = buildApprovalPreview({
      name: 'bash_tool',
      tool_call_id: 'call-1',
      arguments: { command: 'git status\u202etest' },
    });

    expect(preview).toMatchObject({
      kind: 'command',
      toolName: 'bash_tool',
      body: 'git status\\u202etest',
      truncated: false,
    });
  });

  test('renders ordered edit replacements as proposals', () => {
    const preview = buildApprovalPreview({
      name: 'edit_file',
      tool_call_id: 'call-1',
      arguments: {
        path: 'src/index.ts',
        edits: [
          { old_text: 'one', new_text: 'two' },
          { old_text: '', new_text: 'three' },
        ],
      },
    });

    expect(preview.target).toBe('src/index.ts');
    expect(JSON.parse(preview.body)).toEqual([
      { old_text: 'one', new_text: 'two' },
      { old_text: '', new_text: 'three' },
    ]);
  });

  test('does not classify an MCP-qualified coding name as a built-in', () => {
    const preview = buildApprovalPreview({
      name: 'filesystem__create_file',
      tool_call_id: 'call-1',
      arguments: { path: 'outside.txt', content: 'data' },
    });

    expect(preview.kind).toBe('generic');
    expect(preview.toolName).toBe('filesystem__create_file');
    expect(preview.body).toContain('"path": "outside.txt"');
  });

  test('bounds an initially rendered preview by line count and character count', () => {
    const preview = buildApprovalPreview({
      name: 'create_file',
      tool_call_id: 'call-1',
      arguments: { path: 'large.txt', content: `${'x'.repeat(20_000)}\n${'line\n'.repeat(250)}` },
    });

    expect(preview.truncated).toBe(true);
    expect(preview.body.length).toBeLessThanOrEqual(16 * 1024);
    expect(preview.body.split('\n')).toHaveLength(1);
  });

  test('bounds the aggregate initial preview for a large approval batch', () => {
    const previews = buildApprovalPreviews(
      Array.from({ length: 8 }, (_, index) => ({
        name: 'create_file',
        tool_call_id: `call-${index}`,
        arguments: { path: `${index}.txt`, content: 'x'.repeat(16 * 1024) },
      })),
    );

    expect(previews.reduce((total, preview) => total + preview.body.length, 0)).toBeLessThanOrEqual(
      64 * 1024,
    );
    expect(previews.at(-1)).toMatchObject({ body: '', truncated: true });
  });

  test('applies the visible cap after expanding hidden control characters', () => {
    const preview = buildApprovalPreview({
      name: 'create_file',
      tool_call_id: 'call-1',
      arguments: { path: 'controls.txt', content: '\u202e'.repeat(16 * 1024) },
    });

    expect(preview.body.length).toBeLessThanOrEqual(16 * 1024);
    expect(preview.truncated).toBe(true);
  });
});
