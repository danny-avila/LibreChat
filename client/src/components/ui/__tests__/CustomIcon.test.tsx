import { render, screen } from '@testing-library/react';
import CustomIcon from '../CustomIcon';

describe('CustomIcon', () => {
  it('renders a raster image with its source and accessible label', () => {
    render(<CustomIcon src="/assets/logo.png" alt="My Server" className="size-8" />);

    const img = screen.getByRole('img', { name: 'My Server' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/assets/logo.png');
  });

  it('hides decorative raster images from assistive technology', () => {
    const { container } = render(<CustomIcon src="/assets/logo.png" alt="" />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('src', '/assets/logo.png');
  });
});
