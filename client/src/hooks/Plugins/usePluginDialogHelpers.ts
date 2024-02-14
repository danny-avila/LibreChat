import { useState, useCallback } from 'react';
import type { TPlugin } from 'librechat-data-provider';

function usePluginDialogHelpers() {
  const [maxPage, setMaxPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(1);
  const [searchChanged, setSearchChanged] = useState(false);

  const [searchValue, setSearchValue] = useState('');
  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showPluginAuthForm, setShowPluginAuthForm] = useState<boolean>(false);
  const [selectedPlugin, setSelectedPlugin] = useState<TPlugin | undefined>(undefined);

  const calculateColumns = (node: HTMLElement) => {
    const width = node.offsetWidth;
    let columns: number;
    if (width < 501) {
      setItemsPerPage(8);
      return;
    } else if (width < 640) {
      columns = 2;
    } else if (width < 1024) {
      columns = 3;
    } else {
      columns = 4;
    }
    setItemsPerPage(columns * 2); // 2 rows
  };

  const gridRef: (instance: HTMLDivElement | null) => void = useCallback(
    (node) => {
      if (node !== null) {
        if (itemsPerPage === 1) {
          calculateColumns(node);
        }
        const resizeObserver = new ResizeObserver(() => calculateColumns(node));
        resizeObserver.observe(node);
      }
    },
    [itemsPerPage],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    setSearchChanged(true);
  };

  const handleChangePage = (page: number) => {
    setCurrentPage(page);
  };

  return {
    maxPage,
    setMaxPage,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    searchChanged,
    setSearchChanged,
    searchValue,
    setSearchValue,
    gridRef,
    handleSearch,
    handleChangePage,
    error,
    setError,
    errorMessage,
    setErrorMessage,
    showPluginAuthForm,
    setShowPluginAuthForm,
    selectedPlugin,
    setSelectedPlugin,
  };
}

export default usePluginDialogHelpers;
