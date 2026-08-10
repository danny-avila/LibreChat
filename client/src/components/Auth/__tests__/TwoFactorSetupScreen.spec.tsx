/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TwoFactorSetupScreen from '../TwoFactorSetupScreen';

const mockEnableMutate = jest.fn();
const mockConfirmMutate = jest.fn();

jest.mock('~/data-provider', () => ({
  useEnableTwoFactorSetupMutation: () => ({ mutate: mockEnableMutate, isLoading: false }),
  useConfirmTwoFactorSetupMutation: () => ({ mutate: mockConfirmMutate, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Nav/SettingsTabs/Account/TwoFactorPhases', () => ({
  SetupPhase: ({ onGenerate }: { onGenerate: () => void }) => (
    <button data-testid="generate" onClick={onGenerate} />
  ),
  QRPhase: ({ onNext }: { onNext: () => void }) => (
    <button data-testid="qr-next" onClick={onNext} />
  ),
  VerifyPhase: ({
    onTokenChange,
    onNext,
  }: {
    onTokenChange: (value: string) => void;
    onNext: () => void;
  }) => (
    <>
      <button data-testid="enter-code" onClick={() => onTokenChange('123456')} />
      <button data-testid="verify" onClick={onNext} />
    </>
  ),
  BackupPhase: ({
    onDownload,
    onNext,
    downloaded,
  }: {
    onDownload: () => void;
    onNext: () => void;
    downloaded: boolean;
  }) => (
    <>
      <button data-testid="download" onClick={onDownload} />
      <button data-testid="complete" onClick={onNext} disabled={!downloaded} />
    </>
  ),
}));

function renderScreen(initialEntry = '/login/2fa/setup?tempToken=setup-token') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TwoFactorSetupScreen />
    </MemoryRouter>,
  );
}

describe('TwoFactorSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:backup-codes');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects direct visits without a temporary setup token', () => {
    renderScreen('/login/2fa/setup');

    expect(screen.getByRole('alert')).toHaveTextContent('com_auth_two_factor_setup_expired');
    expect(screen.queryByTestId('generate')).not.toBeInTheDocument();
  });

  it('enrolls, confirms, and requires backup-code download before completion', () => {
    renderScreen();

    fireEvent.click(screen.getByTestId('generate'));
    expect(mockEnableMutate).toHaveBeenCalledWith(
      { tempToken: 'setup-token' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    act(() => {
      mockEnableMutate.mock.calls[0][1].onSuccess({
        otpauthUrl: 'otpauth://totp/LibreChat:user@example.com?secret=ABC123&issuer=LibreChat',
        backupCodes: ['backup01'],
      });
    });
    fireEvent.click(screen.getByTestId('qr-next'));
    fireEvent.click(screen.getByTestId('enter-code'));
    fireEvent.click(screen.getByTestId('verify'));

    expect(mockConfirmMutate).toHaveBeenCalledWith(
      { tempToken: 'setup-token', token: '123456' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    act(() => {
      mockConfirmMutate.mock.calls[0][1].onSuccess({ token: 'auth-token', user: {} });
    });
    expect(screen.getByTestId('complete')).toBeDisabled();

    fireEvent.click(screen.getByTestId('download'));
    expect(screen.getByTestId('complete')).toBeEnabled();
  });
});
