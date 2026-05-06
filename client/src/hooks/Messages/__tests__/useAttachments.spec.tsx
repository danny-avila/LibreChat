/**
 * Coverage for `useAttachments` — the merge layer that overlays live
 * (SSE / poll-driven) attachment lifecycle fields onto DB-loaded
 * attachments by `file_id`.
 *
 * The merge is the only thing that lets the deferred-preview flow
 * recover on a reloaded conversation: messages persist with the
 * immediate-snapshot `status: 'pending'`, but the file record itself
 * resolves to `'ready'` later. Without the by-file_id overlay, the
 * renderer would route through the plain file chip forever.
 */

import { useEffect } from 'react';
import { renderHook } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import type { ReactNode } from 'react';
import type { TAttachment } from 'librechat-data-provider';
import store from '~/store';

jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);

import useAttachments from '../useAttachments';

const messageId = 'msg-1';

function makeAttachment(overrides: Partial<TAttachment> = {}): TAttachment {
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

function setup({
  attachments,
  liveMap,
}: {
  attachments?: TAttachment[];
  liveMap?: Record<string, TAttachment[]>;
}) {
  const Seed = () => {
    const setMap = useSetRecoilState(store.messageAttachmentsMap);
    useEffect(() => {
      if (liveMap) {
        setMap(liveMap);
      }
    }, [setMap]);
    return null;
  };

  return renderHook(() => useAttachments({ messageId, attachments }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <RecoilRoot>
        <Seed />
        {children}
      </RecoilRoot>
    ),
  });
}

describe('useAttachments', () => {
  it('returns DB attachments when no live entries exist', () => {
    const db = makeAttachment({ status: 'pending' });
    const { result } = setup({ attachments: [db] });
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]).toBe(db);
  });

  it('returns live entries when no DB attachments exist (active SSE turn)', () => {
    const live = makeAttachment({ status: 'ready', text: '<table>x</table>' });
    const { result } = setup({
      attachments: undefined,
      liveMap: { [messageId]: [live] },
    });
    expect(result.current.attachments).toHaveLength(1);
    expect((result.current.attachments[0] as TAttachment & { text?: string }).text).toBe(
      '<table>x</table>',
    );
  });

  it('overlays live lifecycle fields onto matching DB attachment by file_id', () => {
    /* This is the regression test for the stuck-pending bug on a
     * reloaded conversation: the DB record was frozen at the
     * immediate-persist snapshot; the polling layer fetched the
     * resolved record and inserted it into messageAttachmentsMap; the
     * merge here must surface the resolved fields to the renderer. */
    const db = makeAttachment({ status: 'pending', text: null, textFormat: null });
    const live = makeAttachment({
      status: 'ready',
      text: '<table>resolved</table>',
      textFormat: 'html',
    });
    const { result } = setup({
      attachments: [db],
      liveMap: { [messageId]: [live] },
    });
    expect(result.current.attachments).toHaveLength(1);
    const merged = result.current.attachments[0] as TAttachment & {
      text?: string;
      textFormat?: string;
    };
    expect(merged.status).toBe('ready');
    expect(merged.text).toBe('<table>resolved</table>');
    expect(merged.textFormat).toBe('html');
    /* Non-lifecycle DB fields stay intact. */
    expect(merged.filename).toBe('data.xlsx');
  });

  it('leaves DB attachments untouched when no live entry shares the file_id', () => {
    const db = makeAttachment({ file_id: 'fid-A', status: 'pending' });
    const live = makeAttachment({ file_id: 'fid-B', status: 'ready' });
    const { result } = setup({
      attachments: [db],
      liveMap: { [messageId]: [live] },
    });
    /* DB attachments are the authoritative list for THIS message — a
     * live entry without a matching file_id must NOT bleed in. */
    expect(result.current.attachments).toHaveLength(1);
    expect((result.current.attachments[0] as TAttachment).file_id).toBe('fid-A');
    expect((result.current.attachments[0] as TAttachment).status).toBe('pending');
  });
});
