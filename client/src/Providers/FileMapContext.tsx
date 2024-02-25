import { createContext, useContext } from 'react';
import { useFileMap } from '~/hooks/Files';
type FileMapContextType = ReturnType<typeof useFileMap>;

export const FileMapContext = createContext<FileMapContextType>({} as FileMapContextType);
export const useFileMapContext = () => useContext(FileMapContext);
