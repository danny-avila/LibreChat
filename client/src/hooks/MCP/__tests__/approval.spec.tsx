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
}: {
  onReady: (approval: ReturnType<typeof useMCPAppApproval>) => void;
}) {
  const approval = useMCPAppApproval();
  onReady(approval);
  return (
    <MCPAppApproval action={approval.pending} approve={approval.approve} cancel={approval.cancel} />
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
