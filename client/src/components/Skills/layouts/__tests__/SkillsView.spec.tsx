import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import SkillsView from '../SkillsView';

const mockUseHasAccess = jest.fn(() => true);

jest.mock(
  'librechat-data-provider',
  () => ({
    PermissionTypes: { SKILLS: 'skills' },
    Permissions: { USE: 'use', CREATE: 'create' },
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/client',
  () => ({
    Spinner: () => <div data-testid="spinner" />,
  }),
  { virtual: true },
);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: (...args: unknown[]) => mockUseHasAccess(...args),
  useAuthContext: () => ({
    user: { role: 'admin' },
    roles: { admin: {} },
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetSkillByIdQuery: jest.fn(() => ({
    isLoading: false,
    isError: false,
    data: null,
  })),
}));

jest.mock('~/components/Skills/forms', () => ({
  CreateSkillForm: () => <div data-testid="create-skill-form" />,
  SkillForm: () => <div data-testid="skill-form" />,
}));

jest.mock('~/components/Skills/display/SkillFileViewer', () => () => (
  <div data-testid="skill-file-viewer" />
));
jest.mock('~/components/Skills/display/SkillDetail', () => () => (
  <div data-testid="skill-detail" />
));
jest.mock('~/components/Skills/display/SkillState', () => ({ title }: { title: string }) => (
  <div>{title}</div>
));

describe('SkillsView', () => {
  beforeEach(() => {
    mockUseHasAccess.mockReset();
    mockUseHasAccess.mockReturnValue(true);
  });

  it('renders the create skill form for /skills/new', () => {
    const router = createMemoryRouter([{ path: '/skills/new', element: <SkillsView /> }], {
      initialEntries: ['/skills/new'],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('create-skill-form')).toBeInTheDocument();
  });
});
