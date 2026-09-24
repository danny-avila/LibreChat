import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MCPAppApproval, useMCPAppApproval } from '../approval';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const action = {
  kind: 'tool' as const,
  serverName: 'fixture',
  toolName: 'remove',
  argumentsText: '{"id":"1"}',
};

function Harness({
  onReady,
  onClose,
}: {
  onReady: (approval: ReturnType<typeof useMCPAppApproval>) => void;
  onClose?: () => void;
}) {
  const approval = useMCPAppApproval();
  onReady(approval);
  return (
    <MCPAppApproval
      action={approval.pending}
      approve={approval.approve}
      cancel={approval.cancel}
      close={
        onClose
          ? () => {
              approval.cancel();
              onClose();
            }
          : undefined
      }
    />
  );
}

test('requires a host click before approving the exact tool request', async () => {
  let approval!: ReturnType<typeof useMCPAppApproval>;
  const view = render(<Harness onReady={(value) => (approval = value)} />);
  let result!: Promise<boolean>;
  const controller = new AbortController();
  act(() => {
    result = approval.request(action, controller.signal);
  });
  expect(screen.getByRole('alertdialog')).toHaveTextContent('fixture / remove');
  expect(screen.getByRole('alertdialog')).toHaveTextContent('{"id":"1"}');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_mcp_app_run_tool' }));
  });
  await expect(result).resolves.toBe(true);
  view.unmount();
});

test('rejects simultaneous App requests and lets the user deny the first', async () => {
  let approval!: ReturnType<typeof useMCPAppApproval>;
  const view = render(<Harness onReady={(value) => (approval = value)} />);
  let first!: Promise<boolean>;
  act(() => {
    first = approval.request(action, new AbortController().signal);
  });
  await expect(
    approval.request(
      { kind: 'message', serverName: 'fixture', text: 'next' },
      new AbortController().signal,
    ),
  ).resolves.toBe(false);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  });
  await expect(first).resolves.toBe(false);
  view.unmount();
});

test('denying once suppresses repeated prompts until the View is reopened', async () => {
  let approval!: ReturnType<typeof useMCPAppApproval>;
  const view = render(<Harness onReady={(value) => (approval = value)} />);
  let first!: Promise<boolean>;
  act(() => {
    first = approval.request(action, new AbortController().signal);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));
  });
  await expect(first).resolves.toBe(false);
  for (let i = 0; i < 100; i++) {
    await expect(approval.request(action, new AbortController().signal)).resolves.toBe(false);
  }
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  view.unmount();
  let reopened!: ReturnType<typeof useMCPAppApproval>;
  const next = render(<Harness onReady={(value) => (reopened = value)} />);
  let fresh!: Promise<boolean>;
  act(() => {
    fresh = reopened.request(action, new AbortController().signal);
  });
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  act(() => {
    reopened.cancel();
  });
  await expect(fresh).resolves.toBe(false);
  next.unmount();
});

test('the host Stop app control denies the current action and closes its View', async () => {
  let approval!: ReturnType<typeof useMCPAppApproval>;
  const onClose = jest.fn();
  const view = render(<Harness onReady={(value) => (approval = value)} onClose={onClose} />);
  let pending!: Promise<boolean>;
  act(() => {
    pending = approval.request(action, new AbortController().signal);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_mcp_app_stop' }));
  });
  await expect(pending).resolves.toBe(false);
  expect(onClose).toHaveBeenCalledTimes(1);
  await expect(approval.request(action, new AbortController().signal)).resolves.toBe(false);
  view.unmount();
});

test('closing or aborting an App clears its pending authority', async () => {
  let approval!: ReturnType<typeof useMCPAppApproval>;
  const view = render(<Harness onReady={(value) => (approval = value)} />);
  const controller = new AbortController();
  let first!: Promise<boolean>;
  act(() => {
    first = approval.request(action, controller.signal);
  });
  act(() => controller.abort());
  await expect(first).resolves.toBe(false);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  let second!: Promise<boolean>;
  act(() => {
    second = approval.request(action, new AbortController().signal);
  });
  view.unmount();
  await expect(second).resolves.toBe(false);
});
