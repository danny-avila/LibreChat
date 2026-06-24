import {
  consumeStripeReturnParam,
  persistStripeReturnToSession,
  STRIPE_RETURN_SESSION_KEY,
} from '../stripe';

describe('consumeStripeReturnParam', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns a success toast and removes the stripe param', () => {
    const params = new URLSearchParams('stripe=success&projectId=123');

    const result = consumeStripeReturnParam(params);

    expect(result.toast).toEqual({
      messageKey: 'com_nav_balance_top_up_success',
      status: 'success',
    });
    expect(result.nextParams.get('stripe')).toBeNull();
    expect(result.nextParams.get('projectId')).toBe('123');
    expect(sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY)).toBeNull();
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

  it('returns a stored success toast when the URL param is missing', () => {
    persistStripeReturnToSession('/c/new?stripe=success');

    const result = consumeStripeReturnParam(new URLSearchParams('projectId=123'));

    expect(result.toast).toEqual({
      messageKey: 'com_nav_balance_top_up_success',
      status: 'success',
    });
    expect(result.nextParams.get('projectId')).toBe('123');
    expect(sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY)).toBeNull();
  });
});

describe('persistStripeReturnToSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores a valid stripe return status from a redirect target', () => {
    persistStripeReturnToSession('/c/new?stripe=cancel');

    expect(sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY)).toBe('cancel');
  });

  it('ignores redirect targets without a valid stripe status', () => {
    persistStripeReturnToSession('/c/new?stripe=other');

    expect(sessionStorage.getItem(STRIPE_RETURN_SESSION_KEY)).toBeNull();
  });
});