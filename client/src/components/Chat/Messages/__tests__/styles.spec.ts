import { hoverButtonClasses } from '../styles';

const FADE = '[@media(hover:hover)]:opacity-0';

describe('hoverButtonClasses', () => {
  it('fades an idle action out until the row is hovered', () => {
    expect(hoverButtonClasses()).toContain(FADE);
    expect(hoverButtonClasses()).toContain('group-hover:opacity-100');
  });

  it('marks an active action so the toolbar can key off it', () => {
    expect(hoverButtonClasses({ isActive: true })).toContain('hover-button-active');
    expect(hoverButtonClasses({ isActive: true })).toContain('active');
  });

  it('keeps every action opaque while any of them is active', () => {
    expect(hoverButtonClasses()).toContain('group-has-[.hover-button-active]:opacity-100');
    expect(hoverButtonClasses({ isActive: true })).toContain(
      'group-has-[.hover-button-active]:opacity-100',
    );
    expect(hoverButtonClasses({ isLast: true })).toContain(
      'group-has-[.hover-button-active]:opacity-100',
    );
  });

  it('does not use the legacy active class as the marker', () => {
    expect(hoverButtonClasses()).not.toContain('group-has-[.active]');
  });

  it('never fades the actions on the last row', () => {
    expect(hoverButtonClasses({ isLast: true })).not.toContain(FADE);
  });

  it('appends caller classes', () => {
    expect(hoverButtonClasses({ className: 'ml-0' })).toContain('ml-0');
  });
});
