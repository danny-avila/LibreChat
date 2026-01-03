import { createContext, useContext } from 'react';

type TShareContext = {
  /** True if viewing a public shared link */
  isSharedConvo?: boolean;
  /** True if this is a conversation shared with the current user (read-only) */
  isSharedWithUser?: boolean;
  /** The ID of the user who shared this conversation */
  sharedByUserId?: string;
  /** The name of the user who shared this conversation */
  sharedByUserName?: string;
};

export const ShareContext = createContext<TShareContext>({} as TShareContext);
export const useShareContext = () => useContext(ShareContext);
