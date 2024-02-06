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

import type {RecoilValue} from '../core/Recoil_RecoilValue';

const {useStoreRef} = require('../core/Recoil_RecoilRoot');
const {SUSPENSE_TIMEOUT_MS} = require('../core/Recoil_Retention');
const {updateRetainCount} = require('../core/Recoil_Retention');
const {RetentionZone} = require('../core/Recoil_RetentionZone');
const {useEffect, useRef} = require('react');
const {isSSR} = require('recoil-shared/util/Recoil_Environment');
const gkx = require('recoil-shared/util/Recoil_gkx');
const shallowArrayEqual = require('recoil-shared/util/Recoil_shallowArrayEqual');
const usePrevious = require('recoil-shared/util/Recoil_usePrevious');

// I don't see a way to avoid the any type here because we want to accept readable
// and writable values with any type parameter, but normally with writable ones
// RecoilState<SomeT> is not a subtype of RecoilState<mixed>.
type ToRetain =
  | RecoilValue<any> // flowlint-line unclear-type:off
  | RetentionZone
  | $ReadOnlyArray<RecoilValue<any> | RetentionZone>; // flowlint-line unclear-type:off

function useRetain(toRetain: ToRetain): void {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  // eslint-disable-next-line fb-www/react-hooks
  return useRetain_ACTUAL(toRetain);
}

function useRetain_ACTUAL(toRetain: ToRetain): void {
  const array = Array.isArray(toRetain) ? toRetain : [toRetain];
  const retainables = array.map(a => (a instanceof RetentionZone ? a : a.key));
  const storeRef = useStoreRef();
  useEffect(() => {
    if (!gkx('recoil_memory_managament_2020')) {
      return;
    }
    const store = storeRef.current;
    if (timeoutID.current && !isSSR) {
      // Already performed a temporary retain on render, simply cancel the release
      // of that temporary retain.
      window.clearTimeout(timeoutID.current);
      timeoutID.current = null;
    } else {
      for (const r of retainables) {
        updateRetainCount(store, r, 1);
      }
    }
    return () => {
      for (const r of retainables) {
        updateRetainCount(store, r, -1);
      }
    };
    // eslint-disable-next-line fb-www/react-hooks-deps
  }, [storeRef, ...retainables]);

  // We want to retain if the component suspends. This is terrible but the Suspense
  // API affords us no better option. If we suspend and never commit after some
  // seconds, then release. The 'actual' retain/release in the effect above
  // cancels this.
  const timeoutID = useRef<?TimeoutID>();
  const previousRetainables = usePrevious(retainables);
  if (
    !isSSR &&
    (previousRetainables === undefined ||
      !shallowArrayEqual(previousRetainables, retainables))
  ) {
    const store = storeRef.current;
    for (const r of retainables) {
      updateRetainCount(store, r, 1);
    }
    if (previousRetainables) {
      for (const r of previousRetainables) {
        updateRetainCount(store, r, -1);
      }
    }
    if (timeoutID.current) {
      window.clearTimeout(timeoutID.current);
    }
    timeoutID.current = window.setTimeout(() => {
      timeoutID.current = null;
      for (const r of retainables) {
        updateRetainCount(store, r, -1);
      }
    }, SUSPENSE_TIMEOUT_MS);
  }
}

module.exports = useRetain;
