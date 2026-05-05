/**
 * Coverage for `useAttachmentPreviewSync` — the bridge between the
 * two-phase code-execution preview lifecycle and the attachment cache.
 *
 * Behavior under test:
 *   1. Polling enables only when `attachment.status === 'pending'` AND
 *      some conversation is submitting (per the user's explicit gate).
 *   2. On a terminal poll response (ready/failed), the resolved record
 *      is upserted into `messageAttachmentsMap` by `file_id`.
 *   3. The hook's returned `status` reflects the polled value once
 *      it arrives, not just the prop snapshot.
 *
 * The underlying `useFilePreview` hook is mocked here — its own
 * polling cadence and refetchInterval semantics are React Query's
 * concern, not this hook's.
 */

import { renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import type { ReactNode } from 'react';
import type { TAttachment, TFilePreview } from 'librechat-data-provider';
import store from '~/store';

const mockUseFilePreview = jest.fn();
jest.mock('~/data-provider', () => ({
  useFilePreview: (...args: unknown[]) => mockUseFilePreview(...args),
}));

import useAttachmentPreviewSync from '../useAttachmentPreviewSync';

const wrapper = ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>;

const messageId = 'msg-1';
const fileId = 'fid-1';

function makeAttachment(overrides: Partial<TAttachment> = {}): TAttachment {
  return {
    file_id: fileId,
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

/** Read messageAttachmentsMap and bridge it out via a mutable ref. */
function setup({
  attachment,
  isSubmitting,
  preview,
  isFetching = false,
}: {
  attachment: TAttachment;
  isSubmitting: boolean;
  preview?: TFilePreview;
  isFetching?: boolean;
}) {
  mockUseFilePreview.mockReset();
  mockUseFilePreview.mockReturnValue({ data: preview, isFetching });
  const ref: { current: Record<string, TAttachment[] | undefined> } = { current: {} };
  let lastEnabled: boolean | undefined;
  /* Spy on the second arg of useFilePreview to assert the gate. */
  mockUseFilePreview.mockImplementation((_id: unknown, opts: { enabled?: boolean }) => {
    lastEnabled = opts?.enabled;
    return { data: preview, isFetching };
  });

  const Bridge = () => {
    /* Seed the messageAttachmentsMap with the test attachment so the
     * hook's upsert path has something to find. Also expose setters
     * for tests that simulate `isAnySubmitting` toggling — the
     * selector reads `conversationKeysAtom` × `isSubmittingFamily(key)`
     * so we have to populate both for the selector to fire. */
    const setMap = useSetRecoilState(store.messageAttachmentsMap);
    if (Object.keys(ref.current).length === 0) {
      setMap({ [messageId]: [attachment] });
    }
    const setKeys = useSetRecoilState(store.conversationKeysAtom);
    setKeys([0]);
    const setSubmitting = useSetRecoilState(store.isSubmittingFamily(0));
    setSubmitting(isSubmitting);
    const map = useRecoilValue(store.messageAttachmentsMap);
    ref.current = map;
    return null;
  };

  const { result } = renderHook(
    () => {
      return useAttachmentPreviewSync(attachment);
    },
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        wrapper({
          children: (
            <>
              <Bridge />
              {children}
            </>
          ),
        }),
    },
  );

  return {
    result,
    get map() {
      return ref.current;
    },
    get enabled() {
      return lastEnabled;
    },
  };
}

describe('useAttachmentPreviewSync', () => {
  it('enables polling only when status=pending AND a conversation is submitting', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
    });
    expect(ctx.enabled).toBe(true);
  });

  it('does NOT enable polling when status is already ready', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'ready' }),
      isSubmitting: true,
    });
    expect(ctx.enabled).toBe(false);
  });

  it('does NOT enable polling when status is already failed', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'failed', previewError: 'timeout' }),
      isSubmitting: true,
    });
    expect(ctx.enabled).toBe(false);
  });

  it('does NOT enable polling when no conversation is submitting (LLM finished)', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: false,
    });
    /* User's explicit gate: once the LLM is done, polling stops. The
     * frontend can refetch on demand from the next interaction. */
    expect(ctx.enabled).toBe(false);
  });

  it('does NOT enable polling when the attachment has no file_id', () => {
    const noId = { ...makeAttachment({ status: 'pending' }) } as Partial<TAttachment>;
    delete (noId as { file_id?: string }).file_id;
    const ctx = setup({
      attachment: noId as TAttachment,
      isSubmitting: true,
    });
    expect(ctx.enabled).toBe(false);
  });

  it('returns ready when no preview and no status (legacy back-compat)', () => {
    const legacy = makeAttachment();
    delete (legacy as Partial<TAttachment & { status?: string }>).status;
    const ctx = setup({ attachment: legacy as TAttachment, isSubmitting: false });
    expect(ctx.result.current.status).toBe('ready');
  });

  it('upserts the resolved preview into messageAttachmentsMap when phase-2 reports ready', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
      preview: {
        file_id: fileId,
        status: 'ready',
        text: '<table>final</table>',
        textFormat: 'html',
      },
    });
    const updated = ctx.map[messageId]?.[0] as TAttachment & { text?: string };
    expect(updated.status).toBe('ready');
    expect(updated.text).toBe('<table>final</table>');
    expect(ctx.result.current.status).toBe('ready');
  });

  it('upserts the resolved preview when phase-2 reports failed (with previewError)', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
      preview: {
        file_id: fileId,
        status: 'failed',
        previewError: 'parser-error',
      },
    });
    const updated = ctx.map[messageId]?.[0] as TAttachment & { previewError?: string };
    expect(updated.status).toBe('failed');
    expect(updated.previewError).toBe('parser-error');
    expect(ctx.result.current.status).toBe('failed');
    expect(ctx.result.current.previewError).toBe('parser-error');
  });

  it('does NOT upsert while the polled status is still pending', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
      preview: { file_id: fileId, status: 'pending' },
    });
    /* Map should be unchanged from the initial seed — no patch. */
    const list = ctx.map[messageId] ?? [];
    expect(list).toHaveLength(1);
    expect((list[0] as TAttachment & { status?: string }).status).toBe('pending');
  });

  it('reports isPolling true when the query is fetching and the gate is open', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
      isFetching: true,
    });
    expect(ctx.result.current.isPolling).toBe(true);
  });

  it('reports isPolling false when the query is not fetching', () => {
    const ctx = setup({
      attachment: makeAttachment({ status: 'pending' }),
      isSubmitting: true,
      isFetching: false,
    });
    expect(ctx.result.current.isPolling).toBe(false);
  });
});
