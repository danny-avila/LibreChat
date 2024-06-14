import { SharedLinkListData, SharedLinkListResponse, TSharedLink } from 'librechat-data-provider';
import { addData, deleteData, updateData } from './collection';
import { InfiniteData } from '@tanstack/react-query';

export const addSharedLink = (
  data: InfiniteData<SharedLinkListResponse>,
  newSharedLink: TSharedLink,
): SharedLinkListData => {
  return addData<SharedLinkListResponse, TSharedLink>(data, 'sharedLinks', newSharedLink, (page) =>
    page.sharedLinks.findIndex((c) => c.shareId === newSharedLink.shareId),
  );
};

export const updateSharedLink = (
  data: InfiniteData<SharedLinkListResponse>,
  newSharedLink: TSharedLink,
): SharedLinkListData => {
  return updateData<SharedLinkListResponse, TSharedLink>(
    data,
    'sharedLinks',
    newSharedLink,
    (page) => page.sharedLinks.findIndex((c) => c.shareId === newSharedLink.shareId),
  );
};

export const deleteSharedLink = (data: SharedLinkListData, shareId: string): SharedLinkListData => {
  return deleteData<SharedLinkListResponse, SharedLinkListData>(data, 'sharedLinks', (page) =>
    page.sharedLinks.findIndex((c) => c.shareId === shareId),
  );
};
