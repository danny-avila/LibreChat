import { render, fireEvent } from 'test/layout-test-utils';
import Regenerate from '../Regenerate';

describe('Regenerate', () => {
  it('should render the Regenerate button', () => {
    const { getByText } = render(
      <Regenerate
        onClick={() => {
          ('');
        }}
      />,
    );
    expect(getByText('Regenerate')).toBeInTheDocument();
  });

  it('should call onClick when the button is clicked', () => {
    const handleClick = jest.fn();
    const { getByText } = render(<Regenerate onClick={handleClick} />);
    fireEvent.click(getByText('Regenerate'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
