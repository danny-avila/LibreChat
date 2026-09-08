import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import type { BookmarkMenuProps } from '~/hooks/Chat/useBookmarkItems';
import Header from '../Header';

let mockMountCount = 0;
function MockMenu({ conversation, onTagsUpdated }: BookmarkMenuProps) {
  const [instance] = useState(() => ++mockMountCount);
  return (
    <button
      data-testid="bookmark-host"
      data-instance={instance}
      onClick={() => onTagsUpdated([], ['id'])}
    >
      {conversation?.conversationId}
    </button>
  );
}
jest.mock('recoil', () => ({ useRecoilValue: () => false }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ conversationId: 'original' }) }));
jest.mock('~/store', () => ({ __esModule: true, default: { sidebarExpanded: {} } }));
jest.mock('~/hooks', () => ({ useHasAccess: () => true }));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: { interface: {} } }) }));
jest.mock('../Menus', () => ({
  OpenSidebar: () => null,
  PresetsMenu: () => null,
  NewChat: () => null,
  HeaderMenu: (props: BookmarkMenuProps) => <MockMenu {...props} />,
}));
jest.mock('../Menus/BookmarkMenu', () => ({
  __esModule: true,
  default: (props: BookmarkMenuProps) => <MockMenu {...props} />,
}));
jest.mock('../TemporaryChat', () => ({
  TemporaryChat: () => null,
  TemporaryChatIndicator: () => null,
}));
jest.mock('../Menus/Endpoints/ModelSelector', () => () => null);
jest.mock('../ExportAndShareMenu', () => () => null);
jest.mock('../SubagentThreadLink', () => () => null);
jest.mock('../AddMultiConvo', () => () => null);
jest.mock('~/utils', () => ({ cn: () => '' }));

it('passes host inputs and remounts both bookmark surfaces when the conversation changes', () => {
  const onTagsUpdated = jest.fn();
  const original = { conversationId: 'original' } as BookmarkMenuProps['conversation'];
  const { rerender } = render(<Header conversation={original} onTagsUpdated={onTagsUpdated} />);
  const before = screen.getAllByTestId('bookmark-host');
  expect(before).toHaveLength(2);
  const instances = before.map((element) => element.dataset.instance);
  before.forEach((element) => element.click());
  expect(onTagsUpdated).toHaveBeenCalledTimes(2);
  expect(onTagsUpdated).toHaveBeenCalledWith([], ['id']);
  rerender(
    <Header
      conversation={{ ...original, conversationId: 'next' } as BookmarkMenuProps['conversation']}
      onTagsUpdated={onTagsUpdated}
    />,
  );
  const after = screen.getAllByTestId('bookmark-host');
  expect(after.every((element) => element.textContent === 'next')).toBe(true);
  expect(after.every((element) => !instances.includes(element.dataset.instance))).toBe(true);
});
