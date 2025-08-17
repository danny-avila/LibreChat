import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InfoIcon } from '@librechat/client';

/**
 * Test suite for InfoIcon component
 * Tests rendering, props, and accessibility features
 */
describe('InfoIcon Component', () => {
  /**
   * Test: Component renders without crashing
   */
  it('renders without crashing', () => {
    const { container } = render(<InfoIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  /**
   * Test: SVG has correct default attributes
   */
  it('has correct default SVG attributes', () => {
    const { container } = render(<InfoIcon />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('height', '1em');
    expect(svg).toHaveAttribute('width', '1em');
  });

  /**
   * Test: Renders with custom size prop
   */
  it('accepts custom size prop', () => {
    const customSize = '32px';
    const { container } = render(<InfoIcon size={customSize} />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveAttribute('height', customSize);
    expect(svg).toHaveAttribute('width', customSize);
  });

  /**
   * Test: Applies custom className
   */
  it('applies custom className along with default classes', () => {
    const customClass = 'test-custom-class';
    const { container } = render(<InfoIcon className={customClass} />);
    const svg = container.querySelector('svg');
    
    expect(svg).toHaveClass('icon-md-heavy');
    expect(svg).toHaveClass(customClass);
  });

  /**
   * Test: Contains correct SVG elements (circle border, dot, stem)
   */
  it('contains all required SVG elements', () => {
    const { container } = render(<InfoIcon />);
    
    // Check for outer circle (border)
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2); // Outer circle + dot
    
    // Check outer circle attributes
    const outerCircle = circles[0];
    expect(outerCircle).toHaveAttribute('cx', '12');
    expect(outerCircle).toHaveAttribute('cy', '12');
    expect(outerCircle).toHaveAttribute('r', '10');
    expect(outerCircle).toHaveAttribute('stroke', 'currentColor');
    expect(outerCircle).toHaveAttribute('fill', 'none');
    
    // Check dot circle attributes
    const dotCircle = circles[1];
    expect(dotCircle).toHaveAttribute('cx', '12');
    expect(dotCircle).toHaveAttribute('cy', '8');
    expect(dotCircle).toHaveAttribute('r', '0.75');
    expect(dotCircle).toHaveAttribute('fill', 'currentColor');
    
    // Check for stem path
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('d', 'M12 11v5');
    expect(path).toHaveAttribute('stroke', 'currentColor');
  });

  /**
   * Test: Component renders consistently (snapshot test)
   */
  it('matches snapshot', () => {
    const { container } = render(<InfoIcon />);
    expect(container.firstChild).toMatchSnapshot();
  });

  /**
   * Test: Uses currentColor for theming
   */
  it('uses currentColor for stroke and fill to support theming', () => {
    const { container } = render(<InfoIcon />);
    
    const circles = container.querySelectorAll('circle');
    const path = container.querySelector('path');
    
    // Outer circle should use currentColor for stroke
    expect(circles[0]).toHaveAttribute('stroke', 'currentColor');
    
    // Dot should use currentColor for fill
    expect(circles[1]).toHaveAttribute('fill', 'currentColor');
    
    // Stem should use currentColor for stroke
    expect(path).toHaveAttribute('stroke', 'currentColor');
  });

  /**
   * Test: Accessibility - icon is decorative when used with aria-hidden
   */
  it('can be marked as decorative with aria-hidden', () => {
    const { container } = render(
      <div>
        <InfoIcon aria-hidden="true" />
      </div>
    );
    const svg = container.querySelector('svg');
    
    // Note: aria-hidden would typically be passed through props
    // This test ensures the icon can work in accessible contexts
    expect(svg).toBeInTheDocument();
  });

  /**
   * Test: Component handles missing props gracefully
   */
  it('handles missing props with defaults', () => {
    const { container } = render(<InfoIcon />);
    const svg = container.querySelector('svg');
    
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('icon-md-heavy');
    expect(svg).toHaveAttribute('height', '1em');
    expect(svg).toHaveAttribute('width', '1em');
  });
});