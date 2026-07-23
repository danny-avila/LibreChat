import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

interface UploadModalContextValue {
  isVisible: boolean;
  files: File[];
  /** `onFallback` runs if the modal is dismissed without routing the files, letting callers
   *  restore whatever the pending upload replaced (e.g. a long text paste) */
  openModal: (files: File[], onFallback?: () => void) => void;
  /** Pass `routed: true` when the files were handed off, so the fallback is skipped */
  closeModal: (routed?: boolean) => void;
  /** Returns the pending fallback (if any) so routing callers can invoke it on failure */
  getFallback: () => (() => void) | undefined;
}

const defaultValue: UploadModalContextValue = {
  isVisible: false,
  files: [],
  openModal: () => undefined,
  closeModal: () => undefined,
  getFallback: () => undefined,
};

const UploadModalContext = createContext<UploadModalContextValue>(defaultValue);

export function UploadModalProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const onFallbackRef = useRef<(() => void) | undefined>(undefined);

  const openModal = useCallback((nextFiles: File[], onFallback?: () => void) => {
    onFallbackRef.current = onFallback;
    setFiles(nextFiles);
    setIsVisible(true);
  }, []);

  const closeModal = useCallback((routed = false) => {
    setIsVisible(false);
    setFiles([]);
    const fallback = onFallbackRef.current;
    onFallbackRef.current = undefined;
    if (!routed) {
      fallback?.();
    }
  }, []);

  const getFallback = useCallback(() => onFallbackRef.current, []);

  const value = useMemo<UploadModalContextValue>(
    () => ({ isVisible, files, openModal, closeModal, getFallback }),
    [isVisible, files, openModal, closeModal, getFallback],
  );

  return <UploadModalContext.Provider value={value}>{children}</UploadModalContext.Provider>;
}

export function useUploadModalContext() {
  return useContext(UploadModalContext);
}
