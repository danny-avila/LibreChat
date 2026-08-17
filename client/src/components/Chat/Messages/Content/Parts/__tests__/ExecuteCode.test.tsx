import React from 'react';
import { RecoilRoot } from 'recoil';
import { render } from '@testing-library/react';
import ExecuteCode from '../ExecuteCode';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
  useProgress: (initialProgress: number) => initialProgress,
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/components/Chat/Messages/Content/ProgressText', () => ({
  __esModule: true,
  default: () => <div data-testid="progress-text" />,
}));

jest.mock('../CodeWindowHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="code-window-header" />,
}));

jest.mock('../Attachment', () => ({
  AttachmentGroup: () => <div data-testid="attachment-group" />,
}));

jest.mock('../Stdout', () => ({
  __esModule: true,
  default: () => <div data-testid="stdout" />,
}));

jest.mock('../useLazyHighlight', () => ({
  __esModule: true,
  default: (code?: string) => (code == null ? null : [code]),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

/**
 * jsdom has no layout, so the capped pane's scroll geometry is stubbed:
 * `scrollHeight` reads from mutable state (grown by the test as code
 * streams) and every `scrollTop` write the component makes is recorded.
 */
const mockScrollMetrics = (el: HTMLElement, clientHeight: number) => {
  const state = { scrollHeight: 0, scrollTop: 0, writes: [] as number[] };
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
      state.writes.push(value);
    },
  });
  return state;
};

describe('ExecuteCode streaming follow-scroll', () => {
  const runningCall = (code: string) => (
    <RecoilRoot>
      <ExecuteCode
        initialProgress={0.5}
        isSubmitting={true}
        args={{ lang: 'py', code }}
        output=""
      />
    </RecoilRoot>
  );

  it('pins the code pane to the newest streamed code while the call runs', () => {
    const { container, rerender } = render(runningCall('print(1)'));
    const pane = container.querySelector('.overflow-auto') as HTMLElement;
    const state = mockScrollMetrics(pane, 300);
    state.scrollHeight = 900;

    rerender(runningCall('print(1)\nprint(2)'));

    expect(state.scrollTop).toBe(900);
  });

  it('never scrolls a finished call', () => {
    const finishedCall = (code: string) => (
      <RecoilRoot>
        <ExecuteCode
          initialProgress={1}
          isSubmitting={false}
          args={{ lang: 'py', code }}
          output="done"
        />
      </RecoilRoot>
    );
    const { container, rerender } = render(finishedCall('print(1)'));
    const pane = container.querySelector('.overflow-auto') as HTMLElement;
    const state = mockScrollMetrics(pane, 300);
    state.scrollHeight = 900;

    rerender(finishedCall('print(1)\nprint(2)'));

    expect(state.writes).toHaveLength(0);
  });
});
