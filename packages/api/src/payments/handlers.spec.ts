import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type Stripe from 'stripe';
import type { ServerRequest } from '~/types/http';
import { createStripePaymentHandlers, type StripePaymentDeps } from './handlers';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createResponse(): MockResponse {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as MockResponse;

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function createUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: { toString: () => 'user-123' },
    id: 'user-123',
    email: 'user@example.com',
    emailVerified: true,
    provider: 'local',
    role: 'USER',
    tenantId: 'tenant-123',
    ...overrides,
  } as unknown as IUser;
}

function createAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    config: {},
    fileStrategy: 'local',
    imageOutputType: 'png',
    balance: { enabled: true },
    transactions: { enabled: true },
    payments: {
      stripe: {
        enabled: true,
        allowCustomAmount: true,
        minUsd: 2,
        maxUsd: 25,
        creditsPerUsd: 1000000,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      },
    },
    ...overrides,
  } as AppConfig;
}

function createDeps(overrides: Partial<StripePaymentDeps> = {}): StripePaymentDeps {
  const checkoutCreate = jest.fn();
  const constructEvent = jest.fn();

  return {
    getAppConfig: jest.fn().mockResolvedValue(createAppConfig()),
    createTransaction: jest.fn().mockResolvedValue({ balance: 1234 }),
    createPayment: jest.fn().mockResolvedValue({ status: 'pending', checkoutSessionId: 'cs_123' }),
    getPaymentByCheckoutSessionId: jest.fn().mockResolvedValue(null),
    getPaymentByProviderEventId: jest.fn().mockResolvedValue(null),
    claimPayment: jest.fn().mockResolvedValue({ status: 'processing', checkoutSessionId: 'cs_123' }),
    updatePaymentByCheckoutSessionId: jest.fn().mockResolvedValue({
      status: 'credited',
      checkoutSessionId: 'cs_123',
    }),
    createStripeClient: jest.fn(
      () =>
        ({
          checkout: {
            sessions: {
              create: checkoutCreate,
            },
          },
          webhooks: {
            constructEvent,
          },
        }) as unknown as Stripe,
    ),
    ...overrides,
  };
}

describe('createStripePaymentHandlers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('creates a checkout session and records a pending payment', async () => {
    const checkoutCreate = jest.fn().mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/session',
    });
    const deps = createDeps({
      createStripeClient: jest.fn(
        () =>
          ({
            checkout: { sessions: { create: checkoutCreate } },
            webhooks: { constructEvent: jest.fn() },
          }) as unknown as Stripe,
      ),
    });
    const handlers = createStripePaymentHandlers(deps);
    const req = {
      user: createUser(),
      body: { amountUsd: 5 },
    } as unknown as ServerRequest;
    const res = createResponse();

    await handlers.createCheckoutSession(req, res);

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: expect.objectContaining({
          userId: 'user-123',
          credits: '5000000',
          requestedUsd: '5.00',
        }),
      }),
    );
    expect(deps.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        requestedUsd: 5,
        credits: 5000000,
        checkoutSessionId: 'cs_123',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'cs_123',
        url: 'https://checkout.stripe.test/session',
        amountUsd: 5,
        credits: 5000000,
        currency: 'usd',
      }),
    );
  });

  test('credits balance from a paid checkout.session.completed webhook', async () => {
    const constructEvent = jest.fn().mockReturnValue({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_123',
          currency: 'usd',
          amount_total: 500,
          metadata: {
            userId: 'user-123',
            requestedUsd: '5.00',
            credits: '5000000',
          },
        },
      },
    });
    const deps = createDeps({
      createStripeClient: jest.fn(
        () =>
          ({
            checkout: { sessions: { create: jest.fn() } },
            webhooks: { constructEvent },
          }) as unknown as Stripe,
      ),
    });
    const handlers = createStripePaymentHandlers(deps);
    const req = {
      headers: { 'stripe-signature': 'sig_123' },
      rawBody: Buffer.from('body'),
      body: {},
    } as unknown as ServerRequest;
    const res = createResponse();

    await handlers.handleWebhook(req as never, res);

    expect(constructEvent).toHaveBeenCalledWith(Buffer.from('body'), 'sig_123', 'whsec_123');
    expect(deps.claimPayment).toHaveBeenCalledWith({
      checkoutSessionId: 'cs_123',
      providerEventId: 'evt_123',
      paymentIntentId: 'pi_123',
    });
    expect(deps.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-123',
        tokenType: 'credits',
        context: 'stripe',
        rawAmount: 5000000,
      }),
    );
    expect(deps.updatePaymentByCheckoutSessionId).toHaveBeenCalledWith(
      'cs_123',
      expect.objectContaining({
        status: 'credited',
        providerEventId: 'evt_123',
        paymentIntentId: 'pi_123',
        usdAmount: 5,
        credits: 5000000,
        amountTotalCents: 500,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test('returns duplicate when the webhook event was already processed', async () => {
    const deps = createDeps({
      getPaymentByProviderEventId: jest.fn().mockResolvedValue({
        status: 'credited',
        providerEventId: 'evt_123',
      }),
      createStripeClient: jest.fn(
        () =>
          ({
            checkout: { sessions: { create: jest.fn() } },
            webhooks: { constructEvent: jest.fn().mockReturnValue({ id: 'evt_123' }) },
          }) as unknown as Stripe,
      ),
    });
    const handlers = createStripePaymentHandlers(deps);
    const req = {
      headers: { 'stripe-signature': 'sig_123' },
      rawBody: Buffer.from('body'),
      body: {},
    } as unknown as ServerRequest;
    const res = createResponse();

    await handlers.handleWebhook(req as never, res);

    expect(deps.createTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
  });
});