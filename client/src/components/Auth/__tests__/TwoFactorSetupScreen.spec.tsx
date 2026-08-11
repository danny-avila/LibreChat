/**
 * @jest-environment @happy-dom/jest-environment
 */
import React, { useCallback, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import type { TUser } from 'librechat-data-provider';
import TwoFactorSetupScreen from '../TwoFactorSetupScreen';
import StartupLayout from '~/routes/Layouts/Startup';
import { getPostLoginRedirect } from '~/utils';

const mockEnableMutate = jest.fn();
const mockConfirmMutate = jest.fn();
const mockAcknowledgeMutate = jest.fn();
const mockFinalizeMutate = jest.fn();
const mockCompleteAuthentication = jest.fn();
let mockCompleteAuthenticationImpl: (token: string, user: TUser) => void =
  mockCompleteAuthentication;

jest.mock('~/data-provider', () => ({
  useEnableTwoFactorSetupMutation: () => ({ mutate: mockEnableMutate, isLoading: false }),
  useConfirmTwoFactorSetupMutation: () => ({ mutate: mockConfirmMutate, isLoading: false }),
  useAcknowledgeTwoFactorSetupMutation: () => ({
    mutate: mockAcknowledgeMutate,
    isLoading: false,
  }),
  useFinalizeTwoFactorSetupMutation: () => ({ mutate: mockFinalizeMutate, isLoading: false }),
  useGetStartupConfig: () => ({ data: null, isFetching: false, error: null }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ completeAuthentication: mockCompleteAuthenticationImpl }),
}));

jest.mock('~/components/Auth/AuthLayout', () => ({ children }: { children: React.ReactNode }) => (
  <div data-testid="auth-layout">{children}</div>
));

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

/** Mirrors the auth context: resolve the destination once, flip state, and navigate there. */
function StartupAuthRoute() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  mockCompleteAuthenticationImpl = useCallback(
    (token: string, user: TUser) => {
      mockCompleteAuthentication(token, user);
      const destination =
        getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? '/c/new';
      setIsAuthenticated(true);
      navigate(destination, { replace: true });
    },
    [navigate],
  );

  return <StartupLayout isAuthenticated={isAuthenticated} />;
}

describe('TwoFactorSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockCompleteAuthenticationImpl = mockCompleteAuthentication;
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

    expect(screen.getByText('com_auth_two_factor_setup_required_description')).toHaveClass(
      'text-text-primary',
    );

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
    expect(screen.getByTestId('two-factor-setup-phase')).toHaveFocus();
    fireEvent.click(screen.getByTestId('qr-next'));
    fireEvent.click(screen.getByTestId('enter-code'));
    fireEvent.click(screen.getByTestId('verify'));

    expect(mockConfirmMutate).toHaveBeenCalledWith(
      { tempToken: 'setup-token', token: '123456' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    act(() => {
      mockConfirmMutate.mock.calls[0][1].onSuccess({
        backupCodes: ['confirmed-backup01'],
        acknowledgementToken: 'acknowledgement-token',
      });
    });
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();
    expect(screen.getByTestId('complete')).toBeDisabled();

    fireEvent.click(screen.getByTestId('download'));
    expect(screen.getByTestId('complete')).toBeEnabled();
    fireEvent.click(screen.getByTestId('complete'));
    expect(mockAcknowledgeMutate).toHaveBeenCalledWith(
      { acknowledgementToken: 'acknowledgement-token' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(mockFinalizeMutate).not.toHaveBeenCalled();

    act(() => {
      mockAcknowledgeMutate.mock.calls[0][1].onSuccess({ finalizationToken: 'finalization-token' });
    });
    expect(mockFinalizeMutate).toHaveBeenCalledWith(
      { finalizationToken: 'finalization-token' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();

    act(() => {
      mockFinalizeMutate.mock.calls[0][1].onSuccess({
        token: 'auth-token',
        user: { id: 'user-1' },
      });
    });
    expect(mockCompleteAuthentication).toHaveBeenCalledWith('auth-token', { id: 'user-1' });
  });

  it('keeps startup unauthenticated until backup acknowledgement, then reaches the safe destination', () => {
    sessionStorage.setItem('post_login_redirect_to', '/c/requested?model=test');
    const createRouter = () =>
      createMemoryRouter(
        [
          {
            path: '/',
            element: <StartupAuthRoute />,
            children: [{ path: 'login/2fa/setup', element: <TwoFactorSetupScreen /> }],
          },
          { path: '/c/requested', element: <div data-testid="requested-destination" /> },
        ],
        {
          basename: '/chat',
          initialEntries: ['/chat/login/2fa/setup?tempToken=setup-token'],
        },
      );
    const initialRouter = createRouter();
    const initialRender = render(<RouterProvider router={initialRouter} />);
    expect(sessionStorage.getItem('post_login_redirect_to')).toBe('/c/requested?model=test');
    initialRender.unmount();

    const router = createRouter();
    render(<RouterProvider router={router} />);
    expect(sessionStorage.getItem('post_login_redirect_to')).toBe('/c/requested?model=test');

    fireEvent.click(screen.getByTestId('generate'));
    act(() => {
      mockEnableMutate.mock.calls[0][1].onSuccess({
        otpauthUrl: 'otpauth://totp/LibreChat:user?secret=ABC123',
        backupCodes: ['backup01'],
      });
    });
    fireEvent.click(screen.getByTestId('qr-next'));
    fireEvent.click(screen.getByTestId('enter-code'));
    fireEvent.click(screen.getByTestId('verify'));
    act(() => {
      mockConfirmMutate.mock.calls[0][1].onSuccess({
        backupCodes: ['confirmed-backup01'],
        acknowledgementToken: 'acknowledgement-token',
      });
    });

    expect(screen.getByTestId('complete')).toBeDisabled();
    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/chat/login/2fa/setup');

    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('complete'));

    expect(router.state.location.pathname).toBe('/chat/login/2fa/setup');
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();
    act(() => {
      mockAcknowledgeMutate.mock.calls[0][1].onSuccess({ finalizationToken: 'finalization-token' });
    });
    act(() => {
      mockFinalizeMutate.mock.calls[0][1].onSuccess({
        token: 'auth-token',
        user: { id: 'user-1' },
      });
    });

    expect(mockCompleteAuthentication).toHaveBeenCalledWith('auth-token', { id: 'user-1' });
    expect(router.state.location.pathname).toBe('/chat/c/requested');
    expect(router.state.location.search).toBe('?model=test');
    expect(screen.getByTestId('requested-destination')).toBeInTheDocument();
    expect(sessionStorage.getItem('post_login_redirect_to')).toBeNull();
  });

  it('keeps the backup phase mounted and shows an actionable error when finalization fails', () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('generate'));
    act(() => {
      mockEnableMutate.mock.calls[0][1].onSuccess({
        otpauthUrl: 'otpauth://totp/LibreChat:user?secret=ABC123',
        backupCodes: ['backup01'],
      });
    });
    fireEvent.click(screen.getByTestId('qr-next'));
    fireEvent.click(screen.getByTestId('enter-code'));
    fireEvent.click(screen.getByTestId('verify'));
    act(() => {
      mockConfirmMutate.mock.calls[0][1].onSuccess({
        backupCodes: ['confirmed-backup01'],
        acknowledgementToken: 'acknowledgement-token',
      });
    });
    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('complete'));
    act(() => {
      mockAcknowledgeMutate.mock.calls[0][1].onSuccess({ finalizationToken: 'finalization-token' });
    });
    act(() => mockFinalizeMutate.mock.calls[0][1].onError(new Error('network error')));

    expect(screen.getByTestId('complete')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('com_auth_two_factor_setup_finalize_error');
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();
  });

  function reachBackupPhase(acknowledgementToken = 'acknowledgement-token') {
    fireEvent.click(screen.getByTestId('generate'));
    act(() => {
      mockEnableMutate.mock.calls.at(-1)?.[1].onSuccess({
        otpauthUrl: 'otpauth://totp/LibreChat:user?secret=ABC123',
        backupCodes: ['backup01'],
      });
    });
    fireEvent.click(screen.getByTestId('qr-next'));
    fireEvent.click(screen.getByTestId('enter-code'));
    fireEvent.click(screen.getByTestId('verify'));
    act(() => {
      mockConfirmMutate.mock.calls.at(-1)?.[1].onSuccess({
        backupCodes: ['confirmed-backup01'],
        acknowledgementToken,
      });
    });
  }

  it('retries a failed finalization with the issued credential instead of replaying acknowledgement', () => {
    renderScreen();
    reachBackupPhase();
    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('complete'));
    act(() => {
      mockAcknowledgeMutate.mock.calls[0][1].onSuccess({ finalizationToken: 'finalization-token' });
    });
    act(() => mockFinalizeMutate.mock.calls[0][1].onError(new Error('network error')));

    fireEvent.click(screen.getByTestId('complete'));

    expect(mockAcknowledgeMutate).toHaveBeenCalledTimes(1);
    expect(mockFinalizeMutate).toHaveBeenCalledTimes(2);
    expect(mockFinalizeMutate.mock.calls[1][0]).toEqual({
      finalizationToken: 'finalization-token',
    });

    act(() => {
      mockFinalizeMutate.mock.calls[1][1].onSuccess({
        token: 'auth-token',
        user: { id: 'user-1' },
      });
    });
    expect(mockCompleteAuthentication).toHaveBeenCalledWith('auth-token', { id: 'user-1' });
  });

  it('discards the stale finalization credential when confirmation is repeated', () => {
    renderScreen();
    reachBackupPhase();
    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('complete'));
    act(() => {
      mockAcknowledgeMutate.mock.calls[0][1].onSuccess({ finalizationToken: 'finalization-token' });
    });
    act(() => mockFinalizeMutate.mock.calls[0][1].onError(new Error('network error')));

    act(() => {
      mockConfirmMutate.mock.calls.at(-1)?.[1].onSuccess({
        backupCodes: ['rotated-backup01'],
        acknowledgementToken: 'rotated-acknowledgement-token',
      });
    });

    expect(screen.getByTestId('complete')).toBeDisabled();
    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('complete'));

    expect(mockAcknowledgeMutate).toHaveBeenCalledTimes(2);
    expect(mockAcknowledgeMutate.mock.calls[1][0]).toEqual({
      acknowledgementToken: 'rotated-acknowledgement-token',
    });
    expect(mockFinalizeMutate).toHaveBeenCalledTimes(1);
  });
});
