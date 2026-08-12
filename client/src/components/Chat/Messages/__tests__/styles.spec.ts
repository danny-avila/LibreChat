import { hoverButtonClasses } from '../styles';

const FADE = '[@media(hover:hover)]:opacity-0';

describe('hoverButtonClasses', () => {
  it('fades an idle action out until the row is hovered', () => {
    expect(hoverButtonClasses()).toContain(FADE);
    expect(hoverButtonClasses()).toContain('group-hover:opacity-100');
  });

  it('keeps an active action opaque so an opened surface keeps its trigger', () => {
    expect(hoverButtonClasses({ isActive: true })).not.toContain(FADE);
    expect(hoverButtonClasses({ isActive: true })).toContain('active');
  });

  it('never fades the actions on the last row', () => {
    expect(hoverButtonClasses({ isLast: true })).not.toContain(FADE);
  });

  it('appends caller classes', () => {
    expect(hoverButtonClasses({ className: 'ml-0' })).toContain('ml-0');
  });
});
