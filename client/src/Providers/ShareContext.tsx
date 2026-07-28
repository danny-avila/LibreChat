import { createContext, useContext } from 'react';
type TShareContext = { isSharedConvo?: boolean; shareId?: string };

export const ShareContext = createContext<TShareContext>({} as TShareContext);
export const useShareContext = () => useContext(ShareContext);
