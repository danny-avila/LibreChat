import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import useLazyCollapseBody from '../useLazyCollapseBody';

const TOGGLE_LABEL = 'toggle';

function Disclosure({ initialExpanded }: { initialExpanded: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(initialExpanded);
  const { shouldRenderBody, mountBody, handleTransitionEnd } = useLazyCollapseBody(isExpanded);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          mountBody();
          setIsExpanded((prev) => !prev);
        }}
      >
        {TOGGLE_LABEL}
      </button>
      <div data-testid="panel" onTransitionEnd={handleTransitionEnd}>
        {shouldRenderBody && <div data-testid="body" />}
      </div>
    </div>
  );
}

describe('useLazyCollapseBody', () => {
  it('leaves a collapsed-by-default body unmounted', () => {
    render(<Disclosure initialExpanded={false} />);
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('mounts an expanded-by-default body immediately', () => {
    render(<Disclosure initialExpanded={true} />);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('mounts in the same commit as a user expand', () => {
    render(<Disclosure initialExpanded={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('keeps the body through the collapse transition, then releases it', () => {
    render(<Disclosure initialExpanded={false} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByTestId('body')).toBeInTheDocument();

    fireEvent.transitionEnd(screen.getByTestId('panel'));
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('ignores transition events bubbling from descendants', () => {
    render(<Disclosure initialExpanded={false} />);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    fireEvent.transitionEnd(screen.getByTestId('body'));
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('does not release the body when a transition ends while expanded', () => {
    render(<Disclosure initialExpanded={true} />);
    fireEvent.transitionEnd(screen.getByTestId('panel'));
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });
});
