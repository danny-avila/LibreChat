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

import type {Snapshot} from '../../core/Recoil_Snapshot';

const {
  useGotoRecoilSnapshot,
  useRecoilSnapshot,
} = require('../../hooks/Recoil_SnapshotHooks');
const React = require('react');
const {useEffect, useRef} = require('react');

type Props = $ReadOnly<{
  name?: string,
  persistenceLimit?: number,
  initialSnapshot?: ?Snapshot,
  devMode?: ?boolean,
  maxDepth?: number,
  maxItems?: number,
  serializeFn?: (mixed, string) => mixed,
}>;

type ConnectProps = $ReadOnly<{
  ...Props,
  goToSnapshot: Snapshot => void,
}>;

function connect(props: ConnectProps): ?{
  track: (transactionId: number, snapshot: Snapshot) => void,
  disconnect: () => void,
} {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__RECOIL_DEVTOOLS_EXTENSION__?.connect?.(props);
}

let CONNECTION_INDEX = 0;

/**
 * @explorer-desc
 * Recoil Dev Tools Connector
 */
function Connector({
  name = `Recoil Connection ${CONNECTION_INDEX++}`,
  persistenceLimit = 50,
  maxDepth,
  maxItems,
  serializeFn,
  devMode = true,
}: Props): React.Node {
  const transactionIdRef = useRef(0);
  const connectionRef = useRef<?{
    disconnect: () => void,
    track: (transactionId: number, snapshot: Snapshot) => void,
  }>(null);
  const goToSnapshot = useGotoRecoilSnapshot();
  const snapshot = useRecoilSnapshot();
  const release = snapshot.retain();

  useEffect(() => {
    if (connectionRef.current == null) {
      connectionRef.current = connect({
        name,
        persistenceLimit,
        devMode,
        goToSnapshot,
        maxDepth,
        maxItems,
        serializeFn,
      });
    }

    return () => {
      connectionRef.current?.disconnect();
      connectionRef.current = null;
    };
  }, [
    devMode,
    goToSnapshot,
    maxDepth,
    maxItems,
    name,
    persistenceLimit,
    serializeFn,
  ]);

  useEffect(() => {
    try {
      const transactionID = transactionIdRef.current++;
      connectionRef.current?.track?.(transactionID, snapshot);
    } finally {
      release();
    }
  }, [snapshot, release]);

  return null;
}

module.exports = Connector;
