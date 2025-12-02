import { render, screen, fireEvent } from '@testing-library/react';
import { atom, RecoilRoot, RecoilState, useRecoilState } from 'recoil';
import { constRecoilState, constRecoilStateOpts } from '~/nj/utils/constRecoilState';

function TestRecoilState({ recoilState }: { recoilState: RecoilState<number> }) {
  const [constValue, setConstValue] = useRecoilState<number>(recoilState);

  return (
    <button
      data-testid="changeRecoilState"
      title={`Recoil Value=${constValue}`}
      onClick={() => setConstValue(-1)}
    />
  );
}

describe('constRecoilState Tests', () => {
  test('verify TestRecoilState works w/ normal recoil states', () => {
    const testRecoilState = atom({ key: 'normalRecoilState', default: 21 });

    render(
      <RecoilRoot>
        <TestRecoilState recoilState={testRecoilState} />
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
        <TestRecoilState recoilState={testRecoilState} />
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
        <TestRecoilState recoilState={testRecoilState} />
      </RecoilRoot>,
    );

    const button = screen.getByTestId('changeRecoilState');
    expect(button).toHaveAttribute('title', 'Recoil Value=67');

    // Click button (which attempts to change the recoil state), but it should remain unchanged
    fireEvent.click(button);
    expect(button).toHaveAttribute('title', 'Recoil Value=67');
  });
});
