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

import type {RecoilState} from '../../core/Recoil_RecoilValue';

const {useRecoilValue} = require('../../hooks/Recoil_Hooks');
const atom = require('../Recoil_atom');
const readOnlySelector = require('../Recoil_readOnlySelector');
const {
  noWait,
  waitForAll,
  waitForAllSettled,
  waitForNone,
} = require('../Recoil_WaitFor');

const numberAtom: RecoilState<number> = atom({key: 'number', default: 0});
const stringAtom: RecoilState<string> = atom({key: 'string', default: ''});

let num: number;

let str: string;

//////////////
// waitForAll
//////////////

// Test tuple unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const arrayResults = useRecoilValue(
  // $FlowIssue[invalid-tuple-map]
  waitForAll([readOnlySelector(numberAtom), readOnlySelector(stringAtom)]),
);
num = arrayResults[0];
str = arrayResults[1];
// $FlowExpectedError
num = arrayResults[1];
// $FlowExpectedError
str = arrayResults[0];

// Test object unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const objResults = useRecoilValue(
  // $FlowIssue[invalid-tuple-map]
  // $FlowIssue[incompatible-call]
  waitForAll({num: numberAtom, str: stringAtom}),
);
num = objResults.num;
str = objResults.str;
// $FlowExpectedError
num = objResults.str;
// $FlowExpectedError
str = objResults.num;

//////////////
// waitForNone
//////////////

// Test tuple unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const arrayResultsNone = useRecoilValue(
  // $FlowIssue[invalid-tuple-map]
  waitForNone([readOnlySelector(numberAtom), readOnlySelector(stringAtom)]),
);
num = arrayResultsNone[0].valueOrThrow();
str = arrayResultsNone[1].valueOrThrow();
// $FlowExpectedError
num = arrayResultsNone[1].valueOrThrow();
// $FlowExpectedError
str = arrayResultsNone[0].valueOrThrow();

// Test object unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const objResultsNone = useRecoilValue(
  // $FlowIssue[incompatible-call]
  waitForNone({num: numberAtom, str: stringAtom}),
);
num = objResultsNone.num.valueOrThrow();
str = objResultsNone.str.valueOrThrow();
// $FlowExpectedError
num = objResultsNone.str.valueOrThrow();
// $FlowExpectedError
str = objResultsNone.num.valueOrThrow();

//////////////
// waitForAllSettled
//////////////

// Test tuple unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const arrayResultsAllSettled = useRecoilValue(
  waitForAllSettled([
    // $FlowIssue[invalid-tuple-map]
    readOnlySelector(numberAtom),
    // $FlowIssue[invalid-tuple-map]
    readOnlySelector(stringAtom),
  ]),
);
num = arrayResultsAllSettled[0].valueOrThrow();
str = arrayResultsAllSettled[1].valueOrThrow();
// $FlowExpectedError
num = arrayResultsAllSettled[1].valueOrThrow();
// $FlowExpectedError
str = arrayResultsAllSettled[0].valueOrThrow();

// Test object unwrapping of types
// eslint-disable-next-line fb-www/react-hooks
const objResultsAllSettled = useRecoilValue(
  // $FlowIssue[invalid-tuple-map]
  // $FlowIssue[incompatible-call]
  waitForAllSettled({num: numberAtom, str: stringAtom}),
);
num = objResultsAllSettled.num.valueOrThrow();
str = objResultsAllSettled.str.valueOrThrow();
// $FlowExpectedError
num = objResultsAllSettled.str.valueOrThrow();
// $FlowExpectedError
str = objResultsAllSettled.num.valueOrThrow();

//////////////
// noWait
//////////////

num = useRecoilValue(noWait(numberAtom)).valueOrThrow(); // eslint-disable-line fb-www/react-hooks
// $FlowExpectedError
str = useRecoilValue(noWait(numberAtom)).valueOrThrow(); // eslint-disable-line fb-www/react-hooks
