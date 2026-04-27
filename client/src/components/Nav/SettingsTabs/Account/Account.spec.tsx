import React from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TUser } from 'librechat-data-provider';
import Account from './Account';

jest.mock('./DisplayUsernameMessages', () => () => <div data-testid="display-username" />);
jest.mock('./Avatar', () => () => <div data-testid="avatar" />);
jest.mock('./TwoFactorAuthentication', () => () => <div data-testid="two-factor" />);
jest.mock('./BackupCodesItem', () => () => <div data-testid="backup-codes" />);
jest.mock('./DeleteAccount', () => () => <div data-testid="delete-account" />);

const mockUseAuthContext = jest.fn();
const mockUseGetStartupConfig = jest.fn();

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

const baseUser: TUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: SystemRoles.USER,
  provider: 'local',
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockUseAuthContext.mockReturnValue({ user: baseUser });
  mockUseGetStartupConfig.mockReturnValue({ data: { allowAccountDeletion: true } });
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('Account', () => {
  describe('DeleteAccount visibility', () => {
    it('renders DeleteAccount when allowAccountDeletion is true', () => {
      render(<Account />);
      expect(screen.getByTestId('delete-account')).toBeInTheDocument();
    });

    it('hides DeleteAccount when allowAccountDeletion is false', () => {
      mockUseGetStartupConfig.mockReturnValue({ data: { allowAccountDeletion: false } });
      render(<Account />);
      expect(screen.queryByTestId('delete-account')).not.toBeInTheDocument();
    });

    it('shows DeleteAccount when startup config is still loading', () => {
      mockUseGetStartupConfig.mockReturnValue({ data: undefined });
      render(<Account />);
      expect(screen.getByTestId('delete-account')).toBeInTheDocument();
    });
  });
});
