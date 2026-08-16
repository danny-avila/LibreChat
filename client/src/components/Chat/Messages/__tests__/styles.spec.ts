import { hoverButtonClasses, messageFooterClasses, revealOnRowHoverClasses } from '../styles';

const FADE = '[@media(hover:hover)]:opacity-0';

describe('revealOnRowHoverClasses', () => {
  it('reveals on row hover and on keyboard focus', () => {
    expect(revealOnRowHoverClasses).toContain(FADE);
    expect(revealOnRowHoverClasses).toContain('group-hover:opacity-100');
    expect(revealOnRowHoverClasses).toContain('group-has-[:focus-visible]:opacity-100');
  });

  /* Clicking a tool card in the message body parks focus there. `:focus-within`
     would hold the footer open with the pointer nowhere near the row. */
  it('does not reveal on plain focus-within', () => {
    expect(revealOnRowHoverClasses).not.toContain('group-focus-within:');
  });

  it('fades on the shared motion role rather than snapping', () => {
    expect(revealOnRowHoverClasses).toContain('duration-theme-normal');
    expect(revealOnRowHoverClasses).toContain('ease-out');
    expect(revealOnRowHoverClasses).toContain('motion-reduce:transition-none');
  });

  /* `cn` merges the whole `transition-*` group, so a bare `transition-opacity`
     would replace the `transition-colors` a `Button` contributes and the hover
     tint would snap. The colour properties have to ride along explicitly. */
  it('names the colour properties alongside opacity', () => {
    expect(revealOnRowHoverClasses).toContain('transition-[opacity,color,background-color]');
    expect(revealOnRowHoverClasses).not.toContain('transition-opacity');
  });
});

describe('hoverButtonClasses', () => {
  it('fades an idle action out until the row is hovered', () => {
    expect(hoverButtonClasses()).toContain(FADE);
    expect(hoverButtonClasses()).toContain('group-hover:opacity-100');
  });

  it('reveals an idle action on keyboard focus, not on a click parking focus in the row', () => {
    expect(hoverButtonClasses()).toContain('group-has-[:focus-visible]:opacity-100');
    expect(hoverButtonClasses()).not.toContain('group-focus-within:');
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

describe('messageFooterClasses', () => {
  /** A hover button is a 19px icon with p-1.5 either side, so the row it forms is
   *  31px. The footer holds that height even while it has nothing to show. */
  it('reserves the height of the action row', () => {
    expect(messageFooterClasses).toContain('min-h-[31px]');
  });
});
