import { hasConfiguredFooter } from './footer';

describe('hasConfiguredFooter', () => {
  it('is true for a footer the deployment configured itself', () => {
    expect(hasConfiguredFooter({ customFooter: 'Operator policy' })).toBe(true);
    /** Whitespace is content the bar renders, so it is a bar. */
    expect(hasConfiguredFooter({ customFooter: ' ' })).toBe(true);
  });

  it('is false for a deployment that configured none of it', () => {
    expect(hasConfiguredFooter()).toBe(false);
    expect(hasConfiguredFooter(null)).toBe(false);
    expect(hasConfiguredFooter({})).toBe(false);
    /** An operator who set the footer to nothing suppressed the welcome
     *  screen's disclaimer; a conversation renders nothing for it, so it must
     *  not reserve the band a bar would need. */
    expect(hasConfiguredFooter({ customFooter: '' })).toBe(false);
  });
});
