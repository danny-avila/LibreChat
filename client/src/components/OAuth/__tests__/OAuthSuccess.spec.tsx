import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OAuthSuccess from '../OAuthSuccess';

const mockAnnounce = jest.fn();

jest.mock('~/data-provider', () => ({
  announceOAuthSettled: () => mockAnnounce(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('OAuthSuccess', () => {
  it('announces the settled sign-in once, for a window the provider severed from this one', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/oauth/success?serverName=GitHub']}>
        <OAuthSuccess />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter initialEntries={['/oauth/success?serverName=GitHub']}>
        <OAuthSuccess />
      </MemoryRouter>,
    );
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });
});
