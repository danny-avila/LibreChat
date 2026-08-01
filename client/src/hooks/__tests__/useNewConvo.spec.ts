import type { NavigateFunction } from 'react-router-dom';
import { navigateToNewConversation } from '../useNewConvo.utils';

describe('navigateToNewConversation', () => {
  it('pushes a new history entry by default', () => {
    const navigate = jest.fn() as jest.MockedFunction<NavigateFunction>;

    navigateToNewConversation(navigate, '/c/new');

    expect(navigate).toHaveBeenCalledWith('/c/new');
  });

  it('replaces the current history entry when requested', () => {
    const navigate = jest.fn() as jest.MockedFunction<NavigateFunction>;

    navigateToNewConversation(navigate, '/c/new', true);

    expect(navigate).toHaveBeenCalledWith('/c/new', { replace: true });
  });
});
