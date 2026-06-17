import { consumeStripeReturnParam } from '../stripe';

describe('consumeStripeReturnParam', () => {
  it('returns a success toast and removes the stripe param', () => {
    const params = new URLSearchParams('stripe=success&projectId=123');

    const result = consumeStripeReturnParam(params);

    expect(result.toast).toEqual({
      messageKey: 'com_nav_balance_top_up_success',
      status: 'success',
    });
    expect(result.nextParams.get('stripe')).toBeNull();
    expect(result.nextParams.get('projectId')).toBe('123');
  });

  it('returns a cancel toast and removes the stripe param', () => {
    const params = new URLSearchParams('stripe=cancel');

    const result = consumeStripeReturnParam(params);

    expect(result.toast).toEqual({
      messageKey: 'com_nav_balance_top_up_cancel',
      status: 'info',
    });
    expect(result.nextParams.toString()).toBe('');
  });

  it('ignores unknown stripe values', () => {
    const params = new URLSearchParams('stripe=other&foo=bar');

    const result = consumeStripeReturnParam(params);

    expect(result.toast).toBeNull();
    expect(result.nextParams.get('foo')).toBe('bar');
    expect(result.nextParams.get('stripe')).toBeNull();
  });
});