import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface UploadModalContextValue {
  isVisible: boolean;
  files: File[];
  openModal: (files: File[]) => void;
  closeModal: () => void;
}

const defaultValue: UploadModalContextValue = {
  isVisible: false,
  files: [],
  openModal: () => undefined,
  closeModal: () => undefined,
};

const UploadModalContext = createContext<UploadModalContextValue>(defaultValue);

export function UploadModalProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const openModal = useCallback((nextFiles: File[]) => {
    setFiles(nextFiles);
    setIsVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsVisible(false);
    setFiles([]);
  }, []);

  const value = useMemo<UploadModalContextValue>(
    () => ({ isVisible, files, openModal, closeModal }),
    [isVisible, files, openModal, closeModal],
  );

  return <UploadModalContext.Provider value={value}>{children}</UploadModalContext.Provider>;
}

export function useUploadModalContext() {
  return useContext(UploadModalContext);
}
