import { render, screen, fireEvent } from '@testing-library/react';
import { atom, RecoilRoot, RecoilState, useRecoilState } from 'recoil';
import { constRecoilState, constRecoilStateOpts } from '~/nj/utils/constRecoilState';
import store from '~/store';

function TestRecoilState<T>({
  recoilState,
  clickState,
}: {
  recoilState: RecoilState<T>;
  clickState: T;
}) {
  const [constValue, setConstValue] = useRecoilState<T>(recoilState);

  const value = typeof constValue === 'object' ? JSON.stringify(constValue) : constValue;

  return (
    <button
      data-testid="changeRecoilState"
      title={`Recoil Value=${value}`}
      onClick={() => setConstValue(clickState)}
    />
  );
}

describe('constRecoilState Tests', () => {
  test('verify TestRecoilState works w/ normal recoil states', () => {
    const testRecoilState = atom({ key: 'normalRecoilState', default: 21 });

    render(
      <RecoilRoot>
        <TestRecoilState recoilState={testRecoilState} clickState={-1} />
      </RecoilRoot>,
    );

    const button = screen.getByTestId('changeRecoilState');
    expect(button).toHaveAttribute('title', 'Recoil Value=21');

    // Click button, verify that it updates the recoil state
    // (Without this, we wouldn't be sure if the *other* tests are actually valid.)
    fireEvent.click(button);
    expect(button).toHaveAttribute('title', 'Recoil Value=-1');
  });

  test('constRecoilState() returns constant value', () => {
    const testRecoilState = constRecoilState('constantRecoilState', 42);

    render(
      <RecoilRoot>
        <TestRecoilState recoilState={testRecoilState} clickState={-1} />
      </RecoilRoot>,
    );

    const button = screen.getByTestId('changeRecoilState');
    expect(button).toHaveAttribute('title', 'Recoil Value=42');

    // Click button (which attempts to change the recoil state), but it should remain unchanged
    fireEvent.click(button);
    expect(button).toHaveAttribute('title', 'Recoil Value=42');
  });

  test('constRecoilStateOpts() returns constant value', () => {
    const testRecoilState = constRecoilStateOpts({ key: 'constantRecoilState2', default: 67 });

    render(
      <RecoilRoot>
        <TestRecoilState recoilState={testRecoilState} clickState={-1} />
      </RecoilRoot>,
    );

    const button = screen.getByTestId('changeRecoilState');
    expect(button).toHaveAttribute('title', 'Recoil Value=67');

    // Click button (which attempts to change the recoil state), but it should remain unchanged
    fireEvent.click(button);
    expect(button).toHaveAttribute('title', 'Recoil Value=67');
  });

  describe('Locked states', () => {
    test('isTemporary is locked to true', () => {
      render(
        <RecoilRoot>
          <TestRecoilState recoilState={store.isTemporary} clickState={false} />
        </RecoilRoot>,
      );

      const button = screen.getByTestId('changeRecoilState');
      expect(button).toHaveAttribute('title', 'Recoil Value=true');

      // Click button (which attempts to change the recoil state), but it should remain unchanged
      fireEvent.click(button);
      expect(button).toHaveAttribute('title', 'Recoil Value=true');
    });

    test('search is locked to disabled', () => {
      const defaultState = {
        enabled: null,
        query: '',
        debouncedQuery: '',
        isSearching: false,
        isTyping: false,
      };

      const clickState = {
        enabled: true,
        query: 'hello',
        debouncedQuery: 'hello',
        isSearching: true,
        isTyping: true,
      };

      render(
        <RecoilRoot>
          <TestRecoilState recoilState={store.search} clickState={clickState} />
        </RecoilRoot>,
      );

      const button = screen.getByTestId('changeRecoilState');
      expect(button).toHaveAttribute('title', `Recoil Value=${JSON.stringify(defaultState)}`);

      // Click button (which attempts to change the recoil state), but it should remain unchanged
      fireEvent.click(button);
      expect(button).toHaveAttribute('title', `Recoil Value=${JSON.stringify(defaultState)}`);
    });
  });
});
