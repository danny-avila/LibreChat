import type { TAttachment } from 'librechat-data-provider';
import {
  attachmentIdentity,
  buildAttachmentsByName,
  collectInlineMediaNames,
  resolveInlineMedia,
  toAbsoluteFilePath,
} from '~/utils/media';

const attachment = (overrides: Partial<TAttachment> = {}): TAttachment =>
  ({
    filename: '5_dti.png',
    filepath: '/api/files/code/download/sess/abc/5_dti.png',
    conversationId: 'c1',
    ...overrides,
  }) as unknown as TAttachment;

describe('buildAttachmentsByName', () => {
  it('indexes by the leaf filename, case-insensitively', () => {
    const file = attachment({ filename: 'charts/5_DTI.png' });
    const byName = buildAttachmentsByName([file]);
    expect(byName.get('5_dti.png')).toBe(file);
  });

  it('keeps resolving when one stored file surfaces under two calls', () => {
    // Inherited across steps, or a regeneration that updated the record in
    // place. One file, so nothing is ambiguous.
    const first = attachment({ file_id: 'f1', toolCallId: 't1' } as Partial<TAttachment>);
    const again = attachment({ file_id: 'f1', toolCallId: 't2' } as Partial<TAttachment>);
    expect(buildAttachmentsByName([first, again]).get('5_dti.png')).toBe(first);
  });

  it.each([
    ['two different agents', 'a1', 'a2'],
    ['two sibling calls by one agent', 'a1', 'a1'],
    ['legacy rows naming no agent', undefined, undefined],
  ])('refuses a basename two stored files claim — %s', (_label, left, right) => {
    // A regeneration and two siblings that both wrote `output.png` are
    // indistinguishable from the metadata, so picking either is a coin flip
    // that renders one file under the other's caption.
    const a = attachment({ filepath: '/files/left.png', toolCallId: 't1', agentId: left });
    const b = attachment({ filepath: '/files/right.png', toolCallId: 't2', agentId: right });
    expect(buildAttachmentsByName([a, b]).has('5_dti.png')).toBe(false);
  });

  it('keeps a name ambiguous once a third entry arrives', () => {
    const left = attachment({ filepath: '/files/left.png' });
    const right = attachment({ filepath: '/files/right.png' });
    const later = attachment({ filepath: '/files/later.png' });
    expect(buildAttachmentsByName([left, right, later]).has('5_dti.png')).toBe(false);
  });

  it('does not let one collision poison an unrelated name', () => {
    const left = attachment({ filepath: '/files/left.png', agentId: 'a1' });
    const right = attachment({ filepath: '/files/right.png', agentId: 'a2' });
    const other = attachment({ filename: 'other.png', filepath: '/files/o.png', agentId: 'a3' });
    const byName = buildAttachmentsByName([left, right, other]);
    expect(byName.has('5_dti.png')).toBe(false);
    expect(byName.get('other.png')).toBe(other);
  });

  it('indexes whatever the caller passes — images being the caller contract', () => {
    // ContentParts filters through `isImageAttachment` before calling: an
    // `<img>` aimed at a CSV renders nothing, and claiming it would strip the
    // file's download chip out of the media row too.
    const csv = attachment({ filename: 'report.csv', filepath: '/api/files/report.csv' });
    const images = [csv].filter((a) => a.filename?.endsWith('.png'));
    expect(buildAttachmentsByName(images).has('report.csv')).toBe(false);
  });

  it('skips attachments with nothing to point at', () => {
    expect(buildAttachmentsByName([attachment({ filepath: undefined })]).size).toBe(0);
    expect(buildAttachmentsByName([attachment({ filename: undefined })]).size).toBe(0);
  });

  it('returns one shared instance when nothing is indexable', () => {
    expect(buildAttachmentsByName(undefined)).toBe(buildAttachmentsByName([]));
  });
});

describe('resolveInlineMedia', () => {
  const file = attachment();
  const byName = buildAttachmentsByName([file]);

  it.each([
    ['a bare filename', '5_dti.png'],
    ['a sandbox path', '/mnt/data/5_dti.png'],
    ['a percent-encoded name', '5%5Fdti.png'],
    ['a cache-busting query', '5_dti.png?v=2'],
  ])('resolves %s', (_label, src) => {
    expect(resolveInlineMedia(src, byName)).toBe(file);
  });

  it.each([
    ['an absolute URL', 'https://example.com/5_dti.png'],
    ['a data URI', 'data:image/png;base64,AAAA'],
    ['a protocol-relative URL', '//cdn.example.com/5_dti.png'],
    ['a sandbox scheme', 'sandbox:/mnt/data/5_dti.png'],
    ['an explicit /api/ path', '/api/files/other/session/5_dti.png'],
    ['an explicit /images/ path', '/images/user/5_dti.png'],
  ])('leaves %s alone', (_label, src) => {
    // The served paths matter even though a `5_dti.png` attachment exists: the
    // author addressed one specific file, and reducing it to a basename would
    // display a DIFFERENT attachment that happens to share the leaf.
    expect(resolveInlineMedia(src, byName)).toBeUndefined();
  });

  it('resolves nothing for a file the turn never produced', () => {
    expect(resolveInlineMedia('missing.png', byName)).toBeUndefined();
  });

  it('resolves nothing without a map', () => {
    expect(resolveInlineMedia('5_dti.png', undefined)).toBeUndefined();
    expect(resolveInlineMedia(undefined, byName)).toBeUndefined();
  });

  it('survives a malformed escape rather than throwing', () => {
    expect(() => resolveInlineMedia('%E0%A4%A.png', byName)).not.toThrow();
  });
});

describe('collectInlineMediaNames', () => {
  it('collects every image the answer puts on its own line', () => {
    const text = [
      '## Your DTI',
      '![DTI](5_dti.png)',
      'See [the source](notes.md) for details.',
      '![Payment breakdown](/mnt/data/1_payment.png "Where it goes")',
      '![Balance](<2_balance.png>)',
    ].join('\n\n');
    expect([...collectInlineMediaNames(text)]).toEqual([
      '5_dti.png',
      '1_payment.png',
      '2_balance.png',
    ]);
  });

  it('ignores images the browser already resolves', () => {
    expect(collectInlineMediaNames('![x](https://example.com/a.png)').size).toBe(0);
  });

  it('returns the shared empty set for text with no link syntax', () => {
    expect(collectInlineMediaNames('no images here')).toBe(collectInlineMediaNames(undefined));
  });

  // Everything below is a shape we decline to claim. Each one costs at most a
  // duplicate: the file still rides the media row. Claiming any of them would
  // cost the file entirely, since none of them renders an image.
  it.each([
    ['a fenced block', '```md\n![DTI](5_dti.png)\n```\n'],
    ['an unterminated fence', '```\n![DTI](5_dti.png)\n'],
    ['a tilde fence', '~~~\n![DTI](5_dti.png)\n~~~'],
    ['a four-backtick fence holding a shorter run', '````\n```\n![DTI](5_dti.png)\n```\n````'],
    ['an inline code span', 'Write `![DTI](5_dti.png)` to embed it.'],
    ['a double-backtick span', 'Write ``![DTI](5_dti.png)`` inline.'],
    ['an escaped bang', '\\![DTI](5_dti.png)'],
    ['a four-space indented code block', '    ![DTI](5_dti.png)'],
    ['a tab-indented code block', '\t![DTI](5_dti.png)'],
    ['a blockquote', '> ![DTI](5_dti.png)'],
    ['a reference-style image', '![DTI][chart]'],
    ['an unquoted trailing title', '![DTI](5_dti.png unquoted-title)'],
    ['an unterminated quoted title', '![DTI](5_dti.png "dangling)'],
    ['an explicitly addressed server path', '![DTI](/api/files/x/5_dti.png)'],
    ['a fence whose delimiter appears mid-code-line', '```\nsome ``` text\n![DTI](5_dti.png)\n```'],
    ['a fence closed only by a longer run', '```\n![DTI](5_dti.png)\n`````'],
    ['a fence opened with up to three spaces of indent', '   ```\n![DTI](5_dti.png)\n   ```'],
    ['a tilde fence that a backtick run cannot close', '~~~\n```\n![DTI](5_dti.png)\n~~~'],
  ])('declines to claim %s', (_label, text) => {
    expect(collectInlineMediaNames(text).size).toBe(0);
  });

  it('declines a reference sharing its line with prose', () => {
    // This one does render. We still skip it: the row showing the chart twice
    // is cheap, and widening the rule to partial lines reopens every context
    // the line anchor closes.
    expect(collectInlineMediaNames('Here it is: ![DTI](5_dti.png) — nice').size).toBe(0);
  });

  it('resumes claiming after a fence closes on its own line', () => {
    const text = '```\n![DTI](5_dti.png)\n```\n\n![Balance](2_balance.png)';
    expect([...collectInlineMediaNames(text)]).toEqual(['2_balance.png']);
  });

  it('does not close a fence on a shorter run than opened it', () => {
    // ````` opens; ``` inside is content, so the image stays fenced.
    const text = '`````\n```\n![DTI](5_dti.png)\n`````\n\n![Balance](2_balance.png)';
    expect([...collectInlineMediaNames(text)]).toEqual(['2_balance.png']);
  });

  it('still claims a real image beside a fenced example of one', () => {
    const text = '```md\n![DTI](5_dti.png)\n```\n\n![Balance](2_balance.png)';
    expect([...collectInlineMediaNames(text)]).toEqual(['2_balance.png']);
  });

  it.each([
    ['a double-quoted title', '![DTI](5_dti.png "Debt to income")'],
    ['a single-quoted title', "![DTI](5_dti.png 'Debt to income')"],
    ['a parenthesized title', '![DTI](5_dti.png (Debt to income))'],
    ['an angle-bracketed destination with a title', '![DTI](<5_dti.png> "Debt to income")'],
  ])('still claims %s', (_label, text) => {
    expect([...collectInlineMediaNames(text)]).toEqual(['5_dti.png']);
  });

  it('claims a line carrying a trailing carriage return', () => {
    expect([...collectInlineMediaNames('![DTI](5_dti.png)\r\n')]).toEqual(['5_dti.png']);
  });

  it('is stable across repeated calls', () => {
    const text = '![a](a.png)\n\n![b](b.png)';
    expect([...collectInlineMediaNames(text)]).toEqual(['a.png', 'b.png']);
    expect([...collectInlineMediaNames(text)]).toEqual(['a.png', 'b.png']);
  });
});

describe('attachmentIdentity', () => {
  it('prefers file_id over filepath', () => {
    expect(attachmentIdentity(attachment({ file_id: 'f1' } as Partial<TAttachment>))).toBe('f1');
    expect(attachmentIdentity(attachment())).toBe('/api/files/code/download/sess/abc/5_dti.png');
  });

  it('keeps sibling calls that share a claimed file_id apart', () => {
    // Documented in useAttachments: sibling code calls can share a claimed
    // file_id for the same filename, and each anchors its own card.
    const left = attachment({ file_id: 'f1', toolCallId: 't1' } as Partial<TAttachment>);
    const right = attachment({ file_id: 'f1', toolCallId: 't2' } as Partial<TAttachment>);
    expect(attachmentIdentity(left)).not.toBe(attachmentIdentity(right));
  });

  it('keeps handoff agents repeating a provider tool id apart', () => {
    const left = attachment({
      file_id: 'f1',
      toolCallId: 't1',
      agentId: 'a1',
    } as Partial<TAttachment>);
    const right = attachment({
      file_id: 'f1',
      toolCallId: 't1',
      agentId: 'a2',
    } as Partial<TAttachment>);
    expect(attachmentIdentity(left)).not.toBe(attachmentIdentity(right));
  });

  it('falls back to type:toolCallId for unkeyed tool artifacts', () => {
    const citation = {
      type: 'file_search',
      toolCallId: 't1',
      conversationId: 'c1',
    } as unknown as TAttachment;
    expect(attachmentIdentity(citation)).toBe('file_search:t1');
  });

  it('gives no identity to a row that names no stored file', () => {
    // Two rows that cannot be told apart are two rows, not one.
    expect(
      attachmentIdentity(attachment({ file_id: undefined, filepath: undefined })),
    ).toBeUndefined();
  });
});

describe('toAbsoluteFilePath', () => {
  const base = 'https://chat.example.com/librechat';

  it.each([
    ['a code-execution download', '/api/files/code/download/sess/abc/5_dti.png'],
    ['a share route', '/api/share/abc/img.png'],
    ['an uploaded image', '/images/user/pic.png'],
  ])('prefixes the API base onto %s', (_label, path) => {
    // Without this every generated chart 404s against the origin root on a
    // subpath deployment — and /api/ is what code-execution artifacts use.
    expect(toAbsoluteFilePath(path, base)).toBe(`${base}${path}`);
  });

  it.each([
    ['an absolute URL', 'https://cdn.example.com/a.png'],
    ['a data URI', 'data:image/png;base64,AAAA'],
    ['a bare relative name', '5_dti.png'],
    ['an unserved root path', '/static/a.png'],
    ['an empty path', ''],
  ])('leaves %s alone', (_label, path) => {
    expect(toAbsoluteFilePath(path, base)).toBe(path);
  });

  it('serves exactly the paths resolution declines to look up', () => {
    // Both read SERVED_PATH_PATTERN. If they ever disagree, an explicitly
    // addressed file either loses its base URL or gets swapped for another
    // attachment sharing its basename.
    for (const path of ['/images/user/a.png', '/api/files/x/a.png']) {
      expect(toAbsoluteFilePath(path, base)).toBe(`${base}${path}`);
      expect(
        resolveInlineMedia(path, buildAttachmentsByName([attachment({ filename: 'a.png' })])),
      ).toBeUndefined();
    }
  });
});
