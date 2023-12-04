import { render, fireEvent } from 'test/layout-test-utils';
import Continue from '../Continue';

describe('Continue', () => {
  it('should render the Continue button', () => {
    const { getByText } = render(
      <Continue
        onClick={() => {
          ('');
        }}
      />,
    );
    expect(getByText('Continue')).toBeInTheDocument();
  });

  it('should call onClick when the button is clicked', () => {
    const handleClick = jest.fn();
    const { getByText } = render(<Continue onClick={handleClick} />);
    fireEvent.click(getByText('Continue'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
