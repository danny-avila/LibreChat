import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import Mandatory2FAModal from './Mandatory2FAModal';

const mockShowToast = jest.fn();
const mockEnableMutate = jest.fn();
const mockVerifyMutate = jest.fn();
const mockConfirmMutate = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useEnableTwoFactorMutation: () => ({ mutate: mockEnableMutate, isLoading: false }),
  useVerifyTwoFactorMutation: () => ({ mutate: mockVerifyMutate, isLoading: false }),
  useConfirmTwoFactorMutation: () => ({ mutate: mockConfirmMutate, isLoading: false }),
}));

function renderModal() {
  return render(
    <RecoilRoot>
      <Mandatory2FAModal />
    </RecoilRoot>,
  );
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('Mandatory2FAModal', () => {
  it('renders the blocking setup phase with no way to dismiss', () => {
    renderModal();

    expect(screen.getByText('Two-factor authentication required')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This instance requires two-factor authentication for every account. Set it up now with your authenticator app to continue.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('requests a QR code and advances to the QR phase on success', async () => {
    mockEnableMutate.mockImplementation((_payload, { onSuccess }) => {
      onSuccess({
        otpauthUrl: 'otpauth://totp/test?secret=ABCDEF&issuer=Test',
        backupCodes: ['a', 'b'],
      });
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Generate QR Code' }));

    await waitFor(() => expect(mockEnableMutate).toHaveBeenCalled());
  });

  it('shows an error toast when QR generation fails', async () => {
    mockEnableMutate.mockImplementation((_payload, { onError }) => {
      onError();
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Generate QR Code' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'There was an error generating two-factor authentication settings',
        status: 'error',
      }),
    );
  });
});
