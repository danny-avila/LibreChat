import useSWR, { SWRConfig } from 'swr';
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useAuthContext } from './AuthContext';
import EventEmitter from 'eventemitter3';

const StripeContext = createContext<{
  clientPromise: Promise<Stripe | null>;
  endpoint: string;
} | null>(null);

export const SubscriptionProvider = ({
  children,
  endpoint,
  stripePublishableKey,
}: {
  stripePublishableKey: string;
  children: ReactNode;
  endpoint?: string;
}) => {
  const { token } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const stripeClient = useMemo(() => loadStripe(stripePublishableKey), [stripePublishableKey]);

  endpoint = (endpoint || startupConfig?.serverDomain || '') + '/api/subscription';

  const configLoadEmitter = new EventEmitter();

  useEffect(() => {
    if (startupConfig) {
      configLoadEmitter.emit('recieved');
    }
  }, [startupConfig]);

  return (
    <StripeContext.Provider value={{ clientPromise: stripeClient, endpoint: endpoint }}>
      <SWRConfig
        value={{
          errorRetryInterval: 500,
          fetcher: async (args) => {
            if (!startupConfig) {
              await new Promise((resolve) => configLoadEmitter.once('recieved', resolve));
            }
            const data = await fetch(args, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return await data.json();
          },
        }}
      >
        {children}
      </SWRConfig>
    </StripeContext.Provider>
  );
};

export interface redirectToCheckoutArgs {
  price: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface redirectToCustomerPortalArgs {
  returnUrl?: string;
}

export function useSubscription() {
  const { token } = useAuthContext();
  // @ts-ignore
  const { clientPromise, endpoint } = useContext(StripeContext);
  const { data, error } = useSWR(`${endpoint}?action=useSubscription`);

  // Also wait for customer to load
  if (!data) {
    return {
      isLoaded: false,
    } as {
      isLoaded: false;
      subscription: undefined;
      products: undefined;
      redirectToCheckout: undefined;
      redirectToCustomerPortal: undefined;
    };
  }

  const { products, subscription } = data;

  const redirectToCheckout = async (args: redirectToCheckoutArgs) => {
    if (!args.successUrl) {
      args.successUrl = window.location.href;
    }
    if (!args.cancelUrl) {
      args.cancelUrl = window.location.href;
    }
    const sessionResponse = await fetch(`${endpoint}?action=redirectToCheckout`, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    });
    const session = await sessionResponse.json();
    window.location.href = session.url;
  };

  const redirectToCustomerPortal = async (args: redirectToCustomerPortalArgs) => {
    args = args || {};
    if (!args.returnUrl) {
      args.returnUrl = window.location.href;
    }
    const sessionResponse = await fetch(`${endpoint}?action=redirectToCustomerPortal`, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    });
    const session = await sessionResponse.json();
    window.location.href = session.url;
  };

  return {
    isLoaded: true,
    products,
    subscription,
    redirectToCheckout,
    redirectToCustomerPortal,
  };
}

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: {
    [key: string]: string;
  };
  images: string[];
  price: number;
  currency: string;
  tax_code: string;
  type: string;
}

interface GateProps {
  product?: StripeProduct;
  unsubscribed?: boolean;
  feature?: string;
  negate?: boolean;
  children?: ReactNode;
}
export const Gate = ({ product, negate, feature, unsubscribed, children }: GateProps) => {
  const { isLoaded, products, subscription } = useSubscription();

  if ([!!unsubscribed, !!product, !!feature].filter((x) => x).length !== 1) {
    throw new Error('Please pass exactly one of unsubscribed, product, or feature to Gate');
  }

  if (!isLoaded) {
    return null;
  }

  let condition = false;
  if (unsubscribed) {
    condition = subscription === null;
  }

  if (product || feature) {
    if (subscription === null) {
      return null;
    }
    condition = false;
    for (const item of subscription.items.data) {
      if (product && item.price.product === product.id) {
        condition = true;
      } else if (feature) {
        const productFeatures =
          products
            .find((x) => x.product.id === item.price.product)
            .product.metadata.features?.split(',') || [];
        for (const productFeature of productFeatures) {
          if (productFeature === feature) {
            condition = true;
          }
        }
      }
    }
  }

  return (!negate && condition) || (negate && !condition) ? <>{children}</> : null;
};
