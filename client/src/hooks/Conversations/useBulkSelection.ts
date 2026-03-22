import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { isBulkSelectModeAtom, selectedConvoIdsAtom } from '~/store/bulkSelection';

export default function useBulkSelection(allConvoIds: string[]) {
  const [isSelectMode, setIsSelectMode] = useAtom(isBulkSelectModeAtom);
  const [selectedIds, setSelectedIds] = useAtom(selectedConvoIdsAtom);

  const enterSelectMode = useCallback(() => setIsSelectMode(true), [setIsSelectMode]);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, [setIsSelectMode, setSelectedIds]);

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [setSelectedIds],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allConvoIds));
  }, [allConvoIds, setSelectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  return {
    isSelectMode,
    selectedIds,
    enterSelectMode,
    exitSelectMode,
    toggleSelect,
    selectAll,
    deselectAll,
  };
}
