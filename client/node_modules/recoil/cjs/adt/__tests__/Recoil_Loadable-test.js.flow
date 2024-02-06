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

const {
  RecoilLoadable,
  loadableWithError,
  loadableWithPromise,
  loadableWithValue,
} = require('../Recoil_Loadable');

const ERROR = new Error('ERROR');

test('Value Loadable', async () => {
  const loadable = loadableWithValue('VALUE');
  expect(loadable.state).toBe('hasValue');
  expect(loadable.contents).toBe('VALUE');
  expect(loadable.getValue()).toBe('VALUE');
  await expect(loadable.toPromise()).resolves.toBe('VALUE');
  expect(loadable.valueMaybe()).toBe('VALUE');
  expect(loadable.valueOrThrow()).toBe('VALUE');
  expect(loadable.errorMaybe()).toBe(undefined);
  expect(() => loadable.errorOrThrow()).toThrow();
  expect(loadable.promiseMaybe()).toBe(undefined);
  expect(() => loadable.promiseOrThrow()).toThrow();
});

test('Error Loadable', async () => {
  const loadable = loadableWithError<$FlowFixMe>(ERROR);
  expect(loadable.state).toBe('hasError');
  expect(loadable.contents).toBe(ERROR);
  expect(() => loadable.getValue()).toThrow(ERROR);
  await expect(loadable.toPromise()).rejects.toBe(ERROR);
  expect(loadable.valueMaybe()).toBe(undefined);
  expect(() => loadable.valueOrThrow()).toThrow();
  expect(loadable.errorMaybe()).toBe(ERROR);
  expect(loadable.errorOrThrow()).toBe(ERROR);
  expect(loadable.promiseMaybe()).toBe(undefined);
  expect(() => loadable.promiseOrThrow()).toThrow();
});

test('Pending Value Loadable', async () => {
  const promise = Promise.resolve('VALUE');
  const loadable = loadableWithPromise(promise);
  expect(loadable.state).toBe('loading');
  expect(loadable.contents).toBe(promise);
  expect(() => loadable.getValue()).toThrow();
  await expect(loadable.toPromise()).resolves.toBe('VALUE');
  expect(loadable.valueMaybe()).toBe(undefined);
  expect(() => loadable.valueOrThrow()).toThrow();
  expect(loadable.errorMaybe()).toBe(undefined);
  expect(() => loadable.errorOrThrow()).toThrow();
  await expect(loadable.promiseMaybe()).resolves.toBe('VALUE');
  await expect(loadable.promiseOrThrow()).resolves.toBe('VALUE');
});

describe('Loadable mapping', () => {
  test('Loadable mapping value', () => {
    const loadable = loadableWithValue('VALUE').map(x => 'MAPPED ' + x);
    expect(loadable.state).toBe('hasValue');
    expect(loadable.contents).toBe('MAPPED VALUE');
  });

  test('Loadable mapping value to error', () => {
    const loadable = loadableWithValue('VALUE').map<$FlowFixMe>(() => {
      throw ERROR;
    });
    expect(loadable.state).toBe('hasError');
    expect(loadable.contents).toBe(ERROR);
  });

  test('Loadable mapping value to Promise', async () => {
    const loadable = loadableWithValue('VALUE').map(value =>
      Promise.resolve('MAPPED ' + value),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).resolves.toBe('MAPPED VALUE');
  });

  test('Loadable mapping value to reject', async () => {
    const loadable = loadableWithValue('VALUE').map(() =>
      Promise.reject(ERROR),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).rejects.toBe(ERROR);
  });

  test('Loadable mapping error', () => {
    const loadable = loadableWithError<mixed>(ERROR).map(() => 'NOT_USED');
    expect(loadable.state).toBe('hasError');
    expect(loadable.contents).toBe(ERROR);
  });

  test('Loadable mapping promise value', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map(
      x => 'MAPPED ' + x,
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).resolves.toBe('MAPPED VALUE');
  });

  test('Loadable mapping promise value to reject', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map(() =>
      Promise.reject(ERROR),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).rejects.toBe(ERROR);
  });
  test('Loadable mapping promise value to error', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map<mixed>(
      () => {
        throw ERROR;
      },
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).rejects.toBe(ERROR);
  });

  test('Loadable mapping promise error', async () => {
    const loadable = loadableWithPromise(Promise.reject(ERROR)).map(
      () => 'NOT_USED',
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).rejects.toBe(ERROR);
  });

  test('Loadable mapping to loadable', () => {
    const loadable = loadableWithValue('VALUE').map(value =>
      loadableWithValue(value),
    );
    expect(loadable.state).toBe('hasValue');
    expect(loadable.contents).toBe('VALUE');
  });

  test('Loadable mapping promise to loadable value', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map(value =>
      loadableWithValue('MAPPED ' + value),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).resolves.toBe('MAPPED VALUE');
  });

  test('Loadable mapping promise to loadable error', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map(() =>
      // $FlowFixMe[underconstrained-implicit-instantiation]
      loadableWithError(ERROR),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).rejects.toBe(ERROR);
  });

  test('Loadable mapping promise to loadable promise', async () => {
    const loadable = loadableWithPromise(Promise.resolve('VALUE')).map(value =>
      loadableWithPromise(Promise.resolve('MAPPED ' + value)),
    );
    expect(loadable.state).toBe('loading');
    await expect(loadable.toPromise()).resolves.toBe('MAPPED VALUE');
  });
});

test('Loadable Factory Interface', async () => {
  const valueLoadable = RecoilLoadable.of('VALUE');
  expect(valueLoadable.state).toBe('hasValue');
  expect(valueLoadable.contents).toBe('VALUE');
  const valueLoadable2 = RecoilLoadable.of(RecoilLoadable.of('VALUE'));
  expect(valueLoadable2.state).toBe('hasValue');
  expect(valueLoadable2.contents).toBe('VALUE');

  const promiseLoadable = RecoilLoadable.of(Promise.resolve('ASYNC'));
  expect(promiseLoadable.state).toBe('loading');
  await expect(promiseLoadable.contents).resolves.toBe('ASYNC');
  const promiseLoadable2 = RecoilLoadable.of(
    RecoilLoadable.of(Promise.resolve('ASYNC')),
  );
  expect(promiseLoadable2.state).toBe('loading');
  await expect(promiseLoadable2.contents).resolves.toBe('ASYNC');

  const errorLoadable = RecoilLoadable.error<mixed>('ERROR');
  expect(errorLoadable.state).toBe('hasError');
  expect(errorLoadable.contents).toBe('ERROR');
  // $FlowFixMe[underconstrained-implicit-instantiation]
  const errorLoadable2 = RecoilLoadable.of(RecoilLoadable.error('ERROR'));
  expect(errorLoadable2.state).toBe('hasError');
  expect(errorLoadable2.contents).toBe('ERROR');

  const loadingLoadable = RecoilLoadable.loading<mixed>();
  expect(loadingLoadable.state).toBe('loading');
});

describe('Loadable All', () => {
  test('Array', async () => {
    expect(
      RecoilLoadable.all([RecoilLoadable.of('x'), RecoilLoadable.of(123)])
        .contents,
    ).toEqual(['x', 123]);
    await expect(
      RecoilLoadable.all([
        RecoilLoadable.of(Promise.resolve('x')),
        RecoilLoadable.of(123),
      ]).contents,
    ).resolves.toEqual(['x', 123]);
    expect(
      RecoilLoadable.all([
        RecoilLoadable.of('x'),
        RecoilLoadable.of(123),
        // $FlowFixMe[underconstrained-implicit-instantiation]
        RecoilLoadable.error('ERROR'),
      ]).contents,
    ).toEqual('ERROR');

    expect(
      RecoilLoadable.all([
        RecoilLoadable.of('x'),
        RecoilLoadable.all([RecoilLoadable.of(1), RecoilLoadable.of(2)]),
      ]).contents,
    ).toEqual(['x', [1, 2]]);
  });

  test('Object', async () => {
    expect(
      RecoilLoadable.all({
        str: RecoilLoadable.of('x'),
        num: RecoilLoadable.of(123),
      }).contents,
    ).toEqual({
      str: 'x',
      num: 123,
    });
    await expect(
      RecoilLoadable.all({
        str: RecoilLoadable.of(Promise.resolve('x')),
        num: RecoilLoadable.of(123),
      }).contents,
    ).resolves.toEqual({
      str: 'x',
      num: 123,
    });
    expect(
      RecoilLoadable.all({
        str: RecoilLoadable.of('x'),
        num: RecoilLoadable.of(123),
        // $FlowFixMe[underconstrained-implicit-instantiation]
        err: RecoilLoadable.error('ERROR'),
      }).contents,
    ).toEqual('ERROR');
  });

  test('mixed values', async () => {
    expect(RecoilLoadable.all([RecoilLoadable.of('A'), 'B']).contents).toEqual([
      'A',
      'B',
    ]);

    await expect(
      RecoilLoadable.all([RecoilLoadable.of('A'), Promise.resolve('B')])
        .contents,
    ).resolves.toEqual(['A', 'B']);

    await expect(
      RecoilLoadable.all([RecoilLoadable.of('A'), Promise.reject('B')])
        .contents,
    ).rejects.toEqual('B');

    await expect(
      RecoilLoadable.all({
        a: 'A',
        b: RecoilLoadable.of('B'),
        c: Promise.resolve('C'),
      }).contents,
    ).resolves.toEqual({a: 'A', b: 'B', c: 'C'});
  });
});
