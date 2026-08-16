import React from 'react';
import { render } from '@testing-library/react';
import EmptyText from '../EmptyText';

const dotWrapper = (container: HTMLElement) =>
  container.querySelector('.result-thinking')?.closest('div');

describe('EmptyText', () => {
  it('keeps the dot flush with the content edge by default', () => {
    const { container } = render(<EmptyText />);
    const wrapper = dotWrapper(container);
    expect(wrapper).toHaveClass('absolute');
    expect(wrapper).not.toHaveClass('pl-1.5');
  });

  it('centers the dot on the header icon axis when it sits directly beneath one', () => {
    const { container } = render(<EmptyText underHeaderIcon />);
    const wrapper = dotWrapper(container);
    expect(wrapper).toHaveClass('absolute');
    expect(wrapper).toHaveClass('pl-1.5');
  });
});
