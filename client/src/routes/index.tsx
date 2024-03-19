import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import ChatRoute from './ChatRoute';
import Search from './Search';
import { Login, Registration } from '~/components/Auth';
import { AuthContextProvider, useAuthContext } from '~/hooks/AuthContext';
import { ClerkProvider, OrganizationProfile } from '@clerk/clerk-react';
import { SubscriptionProvider, useSubscription } from '~/hooks/useStripeSubscription';
import { Loader } from 'lucide-react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import MarketplaceView from '~/components/Marketplace/MarketplaceView';
import CreateOrgView from '~/components/CreateOrgView';

const ClerkLayout = () => {
  const { data: startupConfig } = useGetStartupConfig();
  if (!startupConfig) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader className="animate-spin stroke-slate-500" />
      </div>
    );
  }
  return (
    <ClerkProvider publishableKey={startupConfig.clerkPublishableKey}>
      <Outlet />
    </ClerkProvider>
  );
};

const AuthLayout = () => {
  return (
    <AuthContextProvider>
      <Outlet />
    </AuthContextProvider>
  );
};

const SubscriptionLayout = () => {
  const { token } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  if (!startupConfig || !token) {
    return null;
  }
  return (
    <SubscriptionProvider stripePublishableKey={startupConfig.stripePublishableKey}>
      <Outlet />
    </SubscriptionProvider>
  );
};

const PaywallRoot = () => {
  const { token } = useAuthContext();
  const { isLoaded: isLoadedStripe, subscription, redirectToCheckout } = useSubscription();
  const { data: startupConfig } = useGetStartupConfig();

  if (!isLoadedStripe || !startupConfig || !token) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader className="animate-spin stroke-slate-500" />
      </div>
    );
  }

  if (isLoadedStripe && !subscription) {
    redirectToCheckout({ price: startupConfig.stripePriceId });
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="grid place-items-center gap-4">
          <Loader className="animate-spin stroke-slate-500" />
          <div className="text-slate-900 dark:text-white">
            You are redirecting for payment. Please Wait...
          </div>
        </div>
      </div>
    );
  } else {
    return <Root />;
  }
};

export const router = createBrowserRouter([
  {
    element: <ClerkLayout />,
    children: [
      {
        path: 'register',
        element: <Registration />,
      },
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            element: <Login />,
          },
          {
            path: 'create-org',
            element: <CreateOrgView />,
          },
          {
            element: <SubscriptionLayout />,
            children: [
              {
                path: '/',
                element: <PaywallRoot />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="/c/new" replace={true} />,
                  },
                  {
                    path: 'c/:conversationId?',
                    element: <ChatRoute />,
                  },
                  {
                    path: 'chat/:conversationId?',
                    element: <Chat />,
                  },
                  {
                    path: 'search/:query?',
                    element: <Search />,
                  },
                  {
                    path: '/marketplace',
                    element: <MarketplaceView />,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
