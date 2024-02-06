/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

const React = require('react');
const gkx = require('recoil-shared/util/Recoil_gkx');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

export opaque type MutableSource = {};

const createMutableSource: <StoreState, Version>(
  {current: StoreState},
  () => Version,
) => MutableSource =
  // flowlint-next-line unclear-type:off
  (React: any).createMutableSource ?? (React: any).unstable_createMutableSource;

const useMutableSource: <StoreState, T>(
  MutableSource,
  () => T,
  (StoreState, () => void) => () => void,
) => T =
  // flowlint-next-line unclear-type:off
  (React: any).useMutableSource ?? (React: any).unstable_useMutableSource;

// https://github.com/reactwg/react-18/discussions/86
const useSyncExternalStore: <T>(
  subscribe: (() => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
) => T =
  // flowlint-next-line unclear-type:off
  (React: any).useSyncExternalStore ??
  // flowlint-next-line unclear-type:off
  (React: any).unstable_useSyncExternalStore;

let ReactRendererVersionMismatchWarnOnce = false;

// Check if the current renderer supports `useSyncExternalStore()`.
// Since React goes through a proxy dispatcher and the current renderer can
// change we can't simply check if `React.useSyncExternalStore()` is defined.
function currentRendererSupportsUseSyncExternalStore(): boolean {
  // $FlowFixMe[incompatible-use]
  const {ReactCurrentDispatcher, ReactCurrentOwner} =
    /* $FlowFixMe[prop-missing] This workaround was approved as a safer mechanism
     * to detect if the current renderer supports useSyncExternalStore()
     * https://fb.workplace.com/groups/reactjs/posts/9558682330846963/ */
    React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const dispatcher =
    ReactCurrentDispatcher?.current ?? ReactCurrentOwner.currentDispatcher;
  const isUseSyncExternalStoreSupported =
    dispatcher.useSyncExternalStore != null;
  if (
    useSyncExternalStore &&
    !isUseSyncExternalStoreSupported &&
    !ReactRendererVersionMismatchWarnOnce
  ) {
    ReactRendererVersionMismatchWarnOnce = true;
    recoverableViolation(
      'A React renderer without React 18+ API support is being used with React 18+.',
      'recoil',
    );
  }
  return isUseSyncExternalStoreSupported;
}

type ReactMode =
  | 'TRANSITION_SUPPORT'
  | 'SYNC_EXTERNAL_STORE'
  | 'MUTABLE_SOURCE'
  | 'LEGACY';

/**
 * mode: The React API and approach to use for syncing state with React
 * early: Re-renders from Recoil updates occur:
 *    1) earlier
 *    2) in sync with React updates in the same batch
 *    3) before transaction observers instead of after.
 * concurrent: Is the current mode compatible with Concurrent Mode and useTransition()
 */
function reactMode(): {mode: ReactMode, early: boolean, concurrent: boolean} {
  // NOTE: This mode is currently broken with some Suspense cases
  // see Recoil_selector-test.js
  if (gkx('recoil_transition_support')) {
    return {mode: 'TRANSITION_SUPPORT', early: true, concurrent: true};
  }

  if (gkx('recoil_sync_external_store') && useSyncExternalStore != null) {
    return {mode: 'SYNC_EXTERNAL_STORE', early: true, concurrent: false};
  }

  if (
    gkx('recoil_mutable_source') &&
    useMutableSource != null &&
    typeof window !== 'undefined' &&
    !window.$disableRecoilValueMutableSource_TEMP_HACK_DO_NOT_USE
  ) {
    return gkx('recoil_suppress_rerender_in_callback')
      ? {mode: 'MUTABLE_SOURCE', early: true, concurrent: true}
      : {mode: 'MUTABLE_SOURCE', early: false, concurrent: false};
  }

  return gkx('recoil_suppress_rerender_in_callback')
    ? {mode: 'LEGACY', early: true, concurrent: false}
    : {mode: 'LEGACY', early: false, concurrent: false};
}

// TODO Need to figure out if there is a standard/open-source equivalent to see if hot module replacement is happening:
function isFastRefreshEnabled(): boolean {
  // @fb-only: const {isAcceptingUpdate} = require('__debug');
  // @fb-only: return typeof isAcceptingUpdate === 'function' && isAcceptingUpdate();
  return false; // @oss-only
}

module.exports = {
  createMutableSource,
  useMutableSource,
  useSyncExternalStore,
  currentRendererSupportsUseSyncExternalStore,
  reactMode,
  isFastRefreshEnabled,
};
