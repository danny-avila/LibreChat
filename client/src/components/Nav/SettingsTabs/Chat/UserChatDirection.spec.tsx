import React from 'react';
import 'test/localStorage.mock';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import UserChatDirection from './UserChatDirection';

describe('UserChatDirection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders with the default direction', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <UserChatDirection />
      </RecoilRoot>,
    );

    expect(getByTestId('userChatDirection')).toHaveTextContent('rtl');
  });

  it('toggles the direction and persists the setting', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <UserChatDirection />
      </RecoilRoot>,
    );

    const button = getByTestId('userChatDirection');
    fireEvent.click(button);

    expect(button).toHaveTextContent('ltr');
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'userChatDirection',
      JSON.stringify('LTR'),
    );
  });
});
