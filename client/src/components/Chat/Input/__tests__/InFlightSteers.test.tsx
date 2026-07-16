import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PendingSteer } from '~/store/families';
import InFlightSteers from '../InFlightSteers';
import store from '~/store';

const mockCancelMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSteerCancel: jest.requireActual('~/hooks/Chat/useSteerCancel').default,
}));

jest.mock('~/data-provider', () => ({
  useCancelSteerMutation: () => ({ mutate: mockCancelMutate }),
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file }: { file: { filename?: string } }) => (
    <div data-testid="steer-file">{file.filename}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText: string }) => <img alt={altText} data-testid="steer-image" />,
}));

const CONVO_ID = 'convo-in-flight';

function renderSteers(steers: PendingSteer[]) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), steers);
      }}
    >
      <InFlightSteers conversationId={CONVO_ID} />
    </RecoilRoot>,
  );
}

describe('InFlightSteers', () => {
  it('renders nothing when no steer is in flight', () => {
    renderSteers([]);
    expect(screen.queryByTestId('in-flight-steers')).toBeNull();
  });

  it('anchors sending and pending steers above the composer, not in-thread', () => {
    renderSteers([
      { steerId: 's1', text: 'first correction', status: 'sending', createdAt: 1 },
      { steerId: 's2', text: 'second correction', status: 'pending', createdAt: 2 },
    ]);
    expect(screen.getAllByTestId('in-flight-steer')).toHaveLength(2);
    expect(screen.getByText('first correction')).toBeInTheDocument();
    expect(screen.getByText('second correction')).toBeInTheDocument();
    // The in-thread SteerPart is reserved for server-applied steers.
    expect(screen.queryByTestId('steer-part')).toBeNull();
  });

  it('leaves failed steers to the composer recovery rows', () => {
    renderSteers([{ steerId: 's3', text: 'never sent', status: 'failed', createdAt: 1 }]);
    expect(screen.queryByTestId('in-flight-steers')).toBeNull();
  });

  it('only offers cancel once the steer is acknowledged', () => {
    renderSteers([
      { steerId: 'local-1', text: 'still posting', status: 'sending', createdAt: 1 },
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 2 },
    ]);
    // A 'sending' entry has no server id yet, so there is nothing to cancel.
    expect(screen.getAllByTestId('steer-cancel')).toHaveLength(1);
  });

  it('cancels a pending steer server-side and drops the bubble', () => {
    renderSteers([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
    ]);
    fireEvent.click(screen.getByTestId('steer-cancel'));

    expect(mockCancelMutate).toHaveBeenCalledWith(
      { conversationId: CONVO_ID, steerId: 's-ack' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(screen.queryByText('waiting on boundary')).toBeNull();
  });

  it('restores the bubble when the cancel POST fails', () => {
    renderSteers([{ steerId: 's-err', text: 'network flake', status: 'pending', createdAt: 1 }]);
    fireEvent.click(screen.getByTestId('steer-cancel'));
    expect(screen.queryByText('network flake')).toBeNull();

    const options = mockCancelMutate.mock.calls[0][1] as { onError: () => void };
    act(() => options.onError());
    expect(screen.getByText('network flake')).toBeInTheDocument();
  });

  it('previews image attachments and lists other files', () => {
    renderSteers([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [
          { file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' },
          { file_id: 'f2', filename: 'shot.png', type: 'image/png', filepath: '/images/shot.png' },
        ],
      },
    ]);
    expect(screen.getByTestId('steer-file')).toHaveTextContent('notes.pdf');
    expect(screen.getByTestId('steer-image')).toBeInTheDocument();
  });
});
