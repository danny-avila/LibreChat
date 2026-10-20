import { render, screen } from '@testing-library/react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { Slider } from './Slider';

function renderSlider(islandDir?: 'ltr' | 'rtl') {
  render(
    <DirectionProvider dir="rtl">
      <div dir={islandDir}>
        <Slider aria-label="Temperature" defaultValue={[30]} max={100} step={1} />
      </div>
    </DirectionProvider>,
  );
  return screen.getByRole('slider', { name: 'Temperature' }).closest('[dir]');
}

describe('Slider direction', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dir');
  });

  it('follows the RTL app direction', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    expect(renderSlider()).toHaveAttribute('dir', 'rtl');
  });

  it('keeps an LTR island inside an RTL app left to right', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    expect(renderSlider('ltr')).toHaveAttribute('dir', 'ltr');
  });
});
