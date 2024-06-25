import { createContext, useContext } from 'react';
import useAddedResponse from '~/hooks/Chat/useAddedResponse';
type TAddedChatContext = ReturnType<typeof useAddedResponse>;

export const AddedChatContext = createContext<TAddedChatContext>({} as TAddedChatContext);
export const useAddedChatContext = () => useContext(AddedChatContext);
