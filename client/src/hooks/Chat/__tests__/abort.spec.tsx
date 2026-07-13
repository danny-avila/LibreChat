import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState, useRecoilValue } from 'recoil';
import type { TSubmission } from 'librechat-data-provider';
import { useAbortCleanup } from '../abort';
import store from '~/store';

const INDEX = 0;
const OTHER_INDEX = 1;

const submission = (id: string) =>
  ({ userMessage: { messageId: id, text: id } }) as unknown as TSubmission;

function setup() {
  const handles: {
    captureSubmission?: ReturnType<typeof useAbortCleanup>['captureSubmission'];
    clearSubmissionsUnlessReplaced?: ReturnType<
      typeof useAbortCleanup
    >['clearSubmissionsUnlessReplaced'];
    setSubmission?: (value: TSubmission | null) => void;
    setOtherSubmission?: (value: TSubmission | null) => void;
  } = {};
  const current: { submission: TSubmission | null; otherSubmission: TSubmission | null } = {
    submission: null,
    otherSubmission: null,
  };

  function Harness() {
    const cleanup = useAbortCleanup(INDEX);
    handles.captureSubmission = cleanup.captureSubmission;
    handles.clearSubmissionsUnlessReplaced = cleanup.clearSubmissionsUnlessReplaced;
    handles.setSubmission = useSetRecoilState(store.submissionByIndex(INDEX));
    handles.setOtherSubmission = useSetRecoilState(store.submissionByIndex(OTHER_INDEX));
    current.submission = useRecoilValue(store.submissionByIndex(INDEX));
    current.otherSubmission = useRecoilValue(store.submissionByIndex(OTHER_INDEX));
    return null;
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={({ set }) => {
        // clearAllSubmissions iterates the registered conversation keys.
        set(store.conversationKeysAtom, [INDEX, OTHER_INDEX]);
      }}
    >
      <Harness />
      {children}
    </RecoilRoot>
  );
  renderHook(() => null, { wrapper });
  return { handles, current };
}

describe('useAbortCleanup', () => {
  it('clears all submissions when the captured submission is still current', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');

    act(() => {
      handles.setSubmission!(aborted);
      handles.setOtherSubmission!(submission('added-pane'));
    });

    const captured = handles.captureSubmission!();
    expect(captured).toBe(aborted);

    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await waitFor(() => expect(current.submission).toBeNull());
    expect(current.otherSubmission).toBeNull();
  });

  it('keeps a submission that replaced the aborted one while the abort was in flight', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');
    const nextRun = submission('interrupt-follow-up');

    act(() => {
      handles.setSubmission!(aborted);
    });
    const captured = handles.captureSubmission!();

    // The final SSE fired the interrupt drain and started the next run
    // before the abort HTTP response resolved.
    act(() => {
      handles.setSubmission!(nextRun);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(current.submission).toBe(nextRun);
  });

  it('keeps a new submission even when the abort started with none captured', async () => {
    const { handles, current } = setup();
    const nextRun = submission('drained-after-abort');

    const captured = handles.captureSubmission!();
    expect(captured).toBeNull();

    act(() => {
      handles.setSubmission!(nextRun);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(current.submission).toBe(nextRun);
  });

  it('still clears when the submission was already nulled elsewhere', async () => {
    const { handles, current } = setup();
    const aborted = submission('aborted-run');

    act(() => {
      handles.setSubmission!(aborted);
      handles.setOtherSubmission!(submission('added-pane'));
    });
    const captured = handles.captureSubmission!();

    act(() => {
      handles.setSubmission!(null);
    });
    act(() => {
      handles.clearSubmissionsUnlessReplaced!(captured);
    });

    await waitFor(() => expect(current.otherSubmission).toBeNull());
    expect(current.submission).toBeNull();
  });
});
