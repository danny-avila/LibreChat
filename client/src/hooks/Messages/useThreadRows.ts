import { useEffect, useMemo, useRef } from 'react';
import { selectorFamily, useRecoilCallback, useRecoilValue } from 'recoil';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { ThreadIndex, ThreadRow } from '~/utils/thread';
import {
  ROOT_KEY,
  buildThreadIndex,
  changedParentKeys,
  reconcileSiblingIdx,
  resolveThreadRows,
} from '~/utils/thread';
import store from '~/store';

const EMPTY_KEYS: string[] = [];

/** One subscription covering the branch points' sibling atoms, keyed by the
 *  parent list so a thread with no branches subscribes to nothing. */
const branchSiblingIndexesSelector = selectorFamily<Record<string, number>, readonly string[]>({
  key: 'threadBranchSiblingIndexes',
  get:
    (parentKeys) =>
    ({ get }) => {
      const indexes: Record<string, number> = {};
      for (const parentKey of parentKeys) {
        indexes[parentKey] = get(store.messagesSiblingIdxFamily(parentKey));
      }
      return indexes;
    },
});

/**
 * The visible thread as a flat list of rows, derived from the messages cache
 * plus the sibling selection of the branch points only. A streaming delta
 * changes one message object, so every other row is reused by reference and
 * the memoized row components bail without a field diff.
 *
 * Selection reconciliation (follow an appended sibling, keep the viewed one
 * through churn) runs once per index change over the parents whose children
 * list actually changed, instead of once per rendered level.
 */
export default function useThreadRows(
  messages: TMessage[] | null | undefined,
  rootKey: string | null | undefined,
  fileMap?: Record<string, TFile>,
): ThreadRow[] | null {
  const atomRootKey = rootKey ?? '';
  const index = useMemo(
    () => (messages ? buildThreadIndex(messages, fileMap) : null),
    [messages, fileMap],
  );
  const branchKeys = useMemo(
    () =>
      index
        ? index.branchParentKeys.map((key) => (key === ROOT_KEY ? atomRootKey : key))
        : EMPTY_KEYS,
    [index, atomRootKey],
  );
  const siblingIndexes = useRecoilValue(branchSiblingIndexesSelector(branchKeys));

  const previousRowsRef = useRef<ThreadRow[] | null>(null);
  const rows = useMemo(() => {
    if (!index) {
      return null;
    }
    const next = resolveThreadRows(
      index,
      atomRootKey,
      (key) => siblingIndexes[key] ?? 0,
      previousRowsRef.current,
    );
    previousRowsRef.current = next;
    return next;
  }, [index, atomRootKey, siblingIndexes]);

  const reconcile = useRecoilCallback(
    ({ snapshot, set }) =>
      (previous: ThreadIndex | null, next: ThreadIndex) => {
        for (const key of changedParentKeys(previous, next)) {
          const atomKey = key === ROOT_KEY ? atomRootKey : key;
          const atom = store.messagesSiblingIdxFamily(atomKey);
          const currentIdx = snapshot.getLoadable(atom).getValue();
          const nextIdx = reconcileSiblingIdx(
            previous?.children.get(key),
            next.children.get(key) ?? [],
            currentIdx,
          );
          if (nextIdx != null) {
            set(atom, nextIdx);
          }
        }
      },
    [atomRootKey],
  );

  const previousIndexRef = useRef<{ rootKey: string; index: ThreadIndex } | null>(null);
  useEffect(() => {
    if (!index) {
      previousIndexRef.current = null;
      return;
    }
    const previous = previousIndexRef.current;
    previousIndexRef.current = { rootKey: atomRootKey, index };
    reconcile(previous && previous.rootKey === atomRootKey ? previous.index : null, index);
  }, [index, atomRootKey, reconcile]);

  return rows;
}
