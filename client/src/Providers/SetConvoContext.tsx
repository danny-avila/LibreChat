import { createContext, useContext, useRef } from 'react';
import type { MutableRefObject } from 'react';

type SetConvoContext = MutableRefObject<boolean>;

export const SetConvoContext = createContext<SetConvoContext>({} as SetConvoContext);

export const SetConvoProvider = ({ children }: { children: React.ReactNode }) => {
  const hasSetConversation = useRef<boolean>(false);

  return <SetConvoContext.Provider value={hasSetConversation}>{children}</SetConvoContext.Provider>;
};

export const useSetConvoContext = () => useContext(SetConvoContext);
