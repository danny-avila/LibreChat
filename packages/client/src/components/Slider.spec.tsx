import { DirectionProvider } from '@radix-ui/react-direction';
import { render, screen, waitFor } from '@testing-library/react';
import { Slider } from './Slider';

function tree(islandDir?: 'ltr' | 'rtl') {
  return (
    <DirectionProvider dir="rtl">
      <div dir={islandDir}>
        <Slider aria-label="Temperature" defaultValue={[30]} max={100} step={1} />
      </div>
    </DirectionProvider>
  );
}

function sliderRoot() {
  return screen.getByRole('slider', { name: 'Temperature' }).closest('[dir]');
}

function renderSlider(islandDir?: 'ltr' | 'rtl') {
  render(tree(islandDir));
  return sliderRoot();
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

  it('follows an island whose direction changes while the app direction does not', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    const { rerender } = render(tree('ltr'));
    expect(sliderRoot()).toHaveAttribute('dir', 'ltr');

    rerender(tree('rtl'));
    await waitFor(() => expect(sliderRoot()).toHaveAttribute('dir', 'rtl'));
  });
});
