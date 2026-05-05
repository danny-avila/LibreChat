/**
 * Coverage for the upsert-by-file_id behavior in `useAttachmentHandler`.
 *
 * Two-phase code-execution flow: phase-1 emits an attachment with
 * `status: 'pending'`; phase-2 emits the same `file_id` again with
 * `status: 'ready'` (and resolved `text`/`textFormat`) or
 * `'failed'` (with `previewError`). The handler MUST merge over the
 * pending placeholder in place — appending would render the artifact
 * twice in the UI (once stuck pending, once resolved).
 *
 * Lightweight attachments without a `file_id` (web_search citations,
 * file_search results) keep the legacy append-only behavior so two
 * unrelated citations both show up.
 */

import { renderHook, act } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryClient } from '@tanstack/react-query';
import { Tools } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TAttachment, EventSubmission } from 'librechat-data-provider';
import useAttachmentHandler from '../useAttachmentHandler';
import store from '~/store';

const wrapper = ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>;

const submission = {} as EventSubmission;
const messageId = 'msg-1';

function makeAttachment(overrides: Partial<TAttachment>): TAttachment {
  return {
    file_id: 'fid-1',
    filename: 'data.xlsx',
    filepath: '/uploads/data.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    messageId,
    toolCallId: 'tc-1',
    text: null,
    textFormat: null,
    status: 'pending',
    ...overrides,
  } as unknown as TAttachment;
}

/* Co-mount the handler and a reader of the messageAttachmentsMap atom in
 * the same RecoilRoot so each act() shows the post-write state. The
 * `attachmentsMap` ref is mutated by the reader on every render, so
 * callers read it after their `act()` to assert. */
function setup() {
  const queryClient = new QueryClient();
  const ref: { current: Record<string, TAttachment[] | undefined> } = { current: {} };
  const { result } = renderHook(
    () => {
      const handler = useAttachmentHandler(queryClient);
      const map = useRecoilValue(store.messageAttachmentsMap);
      ref.current = map;
      return handler;
    },
    { wrapper },
  );
  return {
    handle: (data: TAttachment) => act(() => result.current({ data, submission })),
    get list(): TAttachment[] {
      return ref.current[messageId] ?? [];
    },
  };
}

describe('useAttachmentHandler upsert-by-file_id', () => {
  it('appends a new attachment when no record with the same file_id exists', () => {
    const ctx = setup();
    ctx.handle(makeAttachment({ status: 'pending' }));
    expect(ctx.list).toHaveLength(1);
    expect(ctx.list[0]).toMatchObject({ file_id: 'fid-1', status: 'pending' });
  });

  it('upserts in place when a second event arrives for the same file_id (phase-1 → phase-2 ready)', () => {
    const ctx = setup();
    ctx.handle(makeAttachment({ status: 'pending' }));
    ctx.handle(makeAttachment({ status: 'ready', text: '<table></table>', textFormat: 'html' }));
    /* Critical: still ONE attachment, not two. The phase-2 event
     * patches the pending record in place. */
    expect(ctx.list).toHaveLength(1);
    expect(ctx.list[0]).toMatchObject({
      file_id: 'fid-1',
      status: 'ready',
      text: '<table></table>',
      textFormat: 'html',
    });
  });

  it('upserts a failed phase-2 over the pending placeholder', () => {
    const ctx = setup();
    ctx.handle(makeAttachment({ status: 'pending' }));
    ctx.handle(makeAttachment({ status: 'failed', previewError: 'timeout' }));
    expect(ctx.list).toHaveLength(1);
    expect(ctx.list[0]).toMatchObject({ status: 'failed', previewError: 'timeout' });
  });

  it('keeps multiple distinct file_ids as separate entries', () => {
    const ctx = setup();
    ctx.handle(makeAttachment({ file_id: 'fid-A' }));
    ctx.handle(makeAttachment({ file_id: 'fid-B' }));
    expect(ctx.list).toHaveLength(2);
    expect(ctx.list.map((a) => (a as { file_id: string }).file_id).sort()).toEqual([
      'fid-A',
      'fid-B',
    ]);
  });

  it('appends (does NOT merge) attachments with no file_id', () => {
    /* Lightweight attachments like file_search citations and web_search
     * results don't carry file_id. The handler must keep its legacy
     * append behavior for them — merging would lose distinct citations
     * and is unnecessary because they're never the target of a phase-2
     * update. */
    const ctx = setup();
    const noFileId = {
      messageId,
      toolCallId: 'tc-1',
      type: Tools.web_search,
    } as unknown as TAttachment;
    ctx.handle(noFileId);
    ctx.handle(noFileId);
    expect(ctx.list).toHaveLength(2);
  });

  it('preserves fields from the first event when the second omits them', () => {
    /* Phase-2 update only carries the deltas (text, status, textFormat).
     * Fields set in phase-1 (filename, type, etc.) must survive the
     * merge — the second event uses spread-over-existing semantics. */
    const ctx = setup();
    ctx.handle(makeAttachment({ status: 'pending', filename: 'phase1-name.xlsx' }));
    ctx.handle({
      file_id: 'fid-1',
      messageId,
      status: 'ready',
      text: 'final',
      textFormat: 'html',
    } as unknown as TAttachment);
    expect(ctx.list).toHaveLength(1);
    expect(ctx.list[0]).toMatchObject({
      filename: 'phase1-name.xlsx',
      status: 'ready',
      text: 'final',
    });
  });
});
