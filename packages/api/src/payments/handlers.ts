import { logger } from '@librechat/data-schemas';
import { getTenantId } from '@librechat/data-schemas';
import type { AppConfig, IUser, PaymentStatus } from '@librechat/data-schemas';
import type { Response } from 'express';
import Stripe from 'stripe';
import type { ServerRequest } from '~/types/http';
import { getBalanceConfig, getTransactionsConfig } from '~/app/config';
import { calculateCredits, getStripeServerConfig, normalizeUsdAmount } from './config';

type StripeCheckoutBody = {
  amountUsd?: number;
};

type StripeWebhookRequest = ServerRequest & {
  body: unknown;
  rawBody?: Buffer;
  headers: ServerRequest['headers'] & {
    'stripe-signature'?: string | string[];
  };
};

export interface PaymentRecord {
  status: PaymentStatus;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  providerEventId?: string;
}

export interface PaymentCreateFields {
  user: string;
  provider: 'stripe';
  status: PaymentStatus;
  currency: string;
  requestedUsd: number;
  usdAmount?: number;
  credits?: number;
  amountTotalCents?: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  providerEventId?: string;
  error?: string;
  tenantId?: string;
}

export interface PaymentUpdateFields {
  status?: PaymentStatus;
  usdAmount?: number;
  credits?: number;
  amountTotalCents?: number;
  paymentIntentId?: string;
  providerEventId?: string;
  error?: string;
}

export interface StripePaymentDeps {
  getAppConfig: (options?: {
    role?: string;
    userId?: string;
    tenantId?: string;
    refresh?: boolean;
    baseOnly?: boolean;
  }) => Promise<AppConfig>;
  createTransaction: (data: {
    user: string;
    tokenType: 'credits';
    context: 'stripe';
    rawAmount: number;
    balance?: { enabled?: boolean };
    transactions?: { enabled?: boolean };
  }) => Promise<{ balance: number } | undefined>;
  createPayment: (fields: PaymentCreateFields) => Promise<PaymentRecord | null>;
  getPaymentByCheckoutSessionId: (checkoutSessionId: string) => Promise<PaymentRecord | null>;
  getPaymentByProviderEventId: (providerEventId: string) => Promise<PaymentRecord | null>;
  claimPayment: (params: {
    checkoutSessionId: string;
    providerEventId: string;
    paymentIntentId?: string;
  }) => Promise<PaymentRecord | null>;
  updatePaymentByCheckoutSessionId: (
    checkoutSessionId: string,
    fields: PaymentUpdateFields,
  ) => Promise<PaymentRecord | null>;
  createStripeClient?: (secretKey: string) => Stripe;
}

function getStripeClient(secretKey: string, deps: StripePaymentDeps): Stripe {
  return deps.createStripeClient ? deps.createStripeClient(secretKey) : new Stripe(secretKey);
}

function getUserId(user?: IUser): string | null {
  if (!user) {
    return null;
  }

  return user._id?.toString() ?? user.id ?? null;
}

function parseAmountUsd(body: unknown): number | null {
  if (typeof body !== 'object' || body == null || !('amountUsd' in body)) {
    return null;
  }

  const amountUsd = (body as StripeCheckoutBody).amountUsd;
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd)) {
    return null;
  }

  return normalizeUsdAmount(amountUsd);
}

function resolveStripeConfigError(appConfig?: AppConfig): string {
  const config = getStripeServerConfig(appConfig);
  if (config) {
    return '';
  }
  return 'Stripe payments are not fully configured.';
}

async function resolveAppConfig(
  deps: StripePaymentDeps,
  user?: IUser,
  tenantId?: string,
): Promise<AppConfig> {
  if (user) {
    const userId = getUserId(user);
    return deps.getAppConfig({
      role: user.role,
      userId: userId ?? undefined,
      tenantId: user.tenantId ?? tenantId,
    });
  }

  if (tenantId) {
    return deps.getAppConfig({ tenantId });
  }

  return deps.getAppConfig({ baseOnly: true });
}

function getStripeSignature(req: StripeWebhookRequest): string | null {
  const signature = req.headers['stripe-signature'];
  if (Array.isArray(signature)) {
    return signature[0] ?? null;
  }
  return signature ?? null;
}

export function createStripePaymentHandlers(deps: StripePaymentDeps): {
  createCheckoutSession: (req: ServerRequest, res: Response) => Promise<Response>;
  handleWebhook: (req: StripeWebhookRequest, res: Response) => Promise<Response>;
} {
  return {
    createCheckoutSession: async (req: ServerRequest, res: Response): Promise<Response> => {
      const userId = getUserId(req.user);
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const appConfig = await resolveAppConfig(deps, req.user, getTenantId());
      const stripeConfig = getStripeServerConfig(appConfig);
      if (!stripeConfig) {
        return res.status(503).json({ message: resolveStripeConfigError(appConfig) });
      }

      const balanceConfig = getBalanceConfig(appConfig);
      if (!balanceConfig?.enabled) {
        return res.status(409).json({ message: 'Balance must be enabled for Stripe top-ups.' });
      }

      const amountUsd = parseAmountUsd(req.body);
      if (amountUsd == null) {
        return res.status(400).json({ message: 'amountUsd must be a valid number.' });
      }

      if (amountUsd < stripeConfig.minUsd || amountUsd > stripeConfig.maxUsd) {
        return res.status(400).json({
          message: `amountUsd must be between ${stripeConfig.minUsd} and ${stripeConfig.maxUsd}.`,
        });
      }

      const amountTotalCents = Math.round(amountUsd * 100);
      const credits = calculateCredits(amountUsd, stripeConfig.creditsPerUsd);
      const stripe = getStripeClient(stripeConfig.secretKey, deps);

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          success_url: stripeConfig.successUrl,
          cancel_url: stripeConfig.cancelUrl,
          client_reference_id: userId,
          customer_email: req.user?.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: stripeConfig.currency,
                unit_amount: amountTotalCents,
                product_data: {
                  name: 'LibreChat token credits',
                  description: `${credits.toLocaleString()} credits`,
                },
              },
            },
          ],
          metadata: {
            userId,
            tenantId: req.user?.tenantId ?? '',
            requestedUsd: amountUsd.toFixed(2),
            credits: String(credits),
            creditsPerUsd: String(stripeConfig.creditsPerUsd),
          },
        });

        await deps.createPayment({
          user: userId,
          provider: 'stripe',
          status: 'pending',
          currency: stripeConfig.currency,
          requestedUsd: amountUsd,
          credits,
          amountTotalCents,
          checkoutSessionId: session.id,
          tenantId: req.user?.tenantId,
        });

        return res.status(200).json({
          sessionId: session.id,
          url: session.url,
          amountUsd,
          credits,
          currency: stripeConfig.currency,
        });
      } catch (error) {
        logger.error('[payments.stripe] Failed to create checkout session', error);
        return res.status(500).json({ message: 'Failed to create Stripe checkout session.' });
      }
    },

    handleWebhook: async (req: StripeWebhookRequest, res: Response): Promise<Response> => {
      const tenantId = getTenantId();
      const appConfig = await resolveAppConfig(deps, undefined, tenantId);
      const stripeConfig = getStripeServerConfig(appConfig);
      if (!stripeConfig) {
        return res.status(503).json({ message: resolveStripeConfigError(appConfig) });
      }
      if (!stripeConfig.webhookSecret) {
        return res.status(503).json({ message: 'Stripe webhook secret is not configured.' });
      }

      const signature = getStripeSignature(req);
      if (!signature || !req.rawBody) {
        return res.status(400).json({ message: 'Missing Stripe webhook signature or raw body.' });
      }

      const stripe = getStripeClient(stripeConfig.secretKey, deps);
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, stripeConfig.webhookSecret);
      } catch (error) {
        logger.warn('[payments.stripe] Invalid webhook signature', error);
        return res.status(400).json({ message: 'Invalid Stripe webhook signature.' });
      }

      const processedEvent = await deps.getPaymentByProviderEventId(event.id);
      if (processedEvent) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      if (event.type !== 'checkout.session.completed') {
        return res.status(200).json({ received: true, ignored: true });
      }

      const session = event.data.object as Stripe.Checkout.Session;
      const checkoutSessionId = session.id;
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : undefined;

      if (session.mode !== 'payment' || session.payment_status !== 'paid') {
        await deps.updatePaymentByCheckoutSessionId(checkoutSessionId, {
          status: 'failed',
          providerEventId: event.id,
          paymentIntentId,
          error: 'Checkout session was not completed with a paid payment.',
        });
        return res.status(200).json({ received: true, ignored: true });
      }

      if (session.currency !== stripeConfig.currency) {
        await deps.updatePaymentByCheckoutSessionId(checkoutSessionId, {
          status: 'failed',
          providerEventId: event.id,
          paymentIntentId,
          error: `Unsupported currency: ${session.currency}`,
        });
        return res.status(200).json({ received: true, ignored: true });
      }

      const claimedPayment = await deps.claimPayment({
        checkoutSessionId,
        providerEventId: event.id,
        paymentIntentId,
      });

      if (!claimedPayment) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      const metadata = session.metadata ?? {};
      const userId = metadata.userId;
      const credits = Number.parseInt(metadata.credits ?? '', 10);
      const usdAmount = Number.parseFloat(metadata.requestedUsd ?? '');
      const amountTotalCents = session.amount_total ?? undefined;

      if (!userId || !Number.isFinite(credits) || !Number.isFinite(usdAmount)) {
        await deps.updatePaymentByCheckoutSessionId(checkoutSessionId, {
          status: 'failed',
          providerEventId: event.id,
          paymentIntentId,
          error: 'Stripe session metadata is incomplete.',
        });
        return res.status(200).json({ received: true, ignored: true });
      }

      try {
        await deps.createTransaction({
          user: userId,
          tokenType: 'credits',
          context: 'stripe',
          rawAmount: credits,
          balance: getBalanceConfig(appConfig),
          transactions: getTransactionsConfig(appConfig),
        });

        await deps.updatePaymentByCheckoutSessionId(checkoutSessionId, {
          status: 'credited',
          providerEventId: event.id,
          paymentIntentId,
          usdAmount,
          credits,
          amountTotalCents,
          error: undefined,
        });

        return res.status(200).json({ received: true });
      } catch (error) {
        logger.error('[payments.stripe] Failed to credit Stripe payment', error);
        await deps.updatePaymentByCheckoutSessionId(checkoutSessionId, {
          status: 'failed',
          providerEventId: event.id,
          paymentIntentId,
          usdAmount,
          credits,
          amountTotalCents,
          error: error instanceof Error ? error.message : 'Unknown Stripe payment error.',
        });
        return res.status(500).json({ message: 'Failed to credit Stripe payment.' });
      }
    },
  };
}