import { hasConfiguredFooter } from './footer';

describe('hasConfiguredFooter', () => {
  it('is true for a footer the deployment configured itself', () => {
    expect(hasConfiguredFooter({ customFooter: 'Operator policy' })).toBe(true);
    /** An operator who set the footer to nothing still set it. */
    expect(hasConfiguredFooter({ customFooter: '' })).toBe(true);
  });

  it('is false for a deployment that configured none of it', () => {
    expect(hasConfiguredFooter()).toBe(false);
    expect(hasConfiguredFooter(null)).toBe(false);
    expect(hasConfiguredFooter({})).toBe(false);
  });
});
