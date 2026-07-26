import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PendingSteer } from '~/store/families';
import PendingSteers from '../PendingSteers';
import store from '~/store';

const mockRetry = jest.fn();
const mockSendAsNew = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/Chat/useSteerRecovery', () => ({
  __esModule: true,
  default: () => ({ retry: mockRetry, sendAsNew: mockSendAsNew }),
}));

jest.mock('../SteerPart', () => ({
  __esModule: true,
  default: ({ steer }: { steer: string }) => <div data-testid="steer-part">{steer}</div>,
}));

const CONVO_ID = 'convo-1';

const pending = (over: Partial<PendingSteer> = {}): PendingSteer => ({
  steerId: 's1',
  text: 'change of plan',
  status: 'sending',
  createdAt: 1,
  ...over,
});

function renderPending(steers: PendingSteer[]) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.pendingSteersByConvoId(CONVO_ID), steers)}>
      <PendingSteers conversationId={CONVO_ID} />
    </RecoilRoot>,
  );
}

describe('PendingSteers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing with no pending steers', () => {
    const { container } = renderPending([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a dimmed steer part with sending status', () => {
    renderPending([pending()]);
    expect(screen.getByTestId('steer-part')).toHaveTextContent('change of plan');
    expect(screen.getByText('com_ui_sending')).toBeInTheDocument();
  });

  it('offers retry and send-as-new on failure', () => {
    renderPending([pending({ status: 'failed' })]);
    expect(screen.getByText('com_ui_steer_failed_inline')).toBeInTheDocument();
    expect(screen.getByText('com_ui_retry')).toBeInTheDocument();
    expect(screen.getByText('com_ui_send_as_new')).toBeInTheDocument();
  });

  it('retries the failed steer by id', () => {
    renderPending([pending({ status: 'failed', steerId: 's-failed' })]);
    fireEvent.click(screen.getByText('com_ui_retry'));
    expect(mockRetry).toHaveBeenCalledWith('s-failed');
    expect(mockSendAsNew).not.toHaveBeenCalled();
  });

  it('sends the failed steer as new by id', () => {
    renderPending([pending({ status: 'failed', steerId: 's-failed' })]);
    fireEvent.click(screen.getByText('com_ui_send_as_new'));
    expect(mockSendAsNew).toHaveBeenCalledWith('s-failed');
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
