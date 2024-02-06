import { render, fireEvent } from 'test/layout-test-utils';
import Stop from '../Stop';

describe('Stop', () => {
  it('should render the Stop button', () => {
    const { getByText } = render(
      <Stop
        onClick={() => {
          ('');
        }}
      />,
    );
    expect(getByText('Stop')).toBeInTheDocument();
  });

  it('should call onClick when the button is clicked', () => {
    const handleClick = jest.fn();
    const { getByText } = render(<Stop onClick={handleClick} />);
    fireEvent.click(getByText('Stop'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
