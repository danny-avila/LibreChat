import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import ChatRoute from './ChatRoute';
import Search from './Search';
import { Login, Registration } from '~/components/Auth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import { ClerkProvider } from '@clerk/clerk-react';
import { SubscriptionProvider, useSubscription } from '~/hooks/useStripeSubscription';
import { Loader } from 'lucide-react';

//@ts-ignore
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
//@ts-ignore
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
//@ts-ignore
const VITE_STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID;

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
  </AuthContextProvider>
);

const StripeClerkLayout = () => (
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
    <SubscriptionProvider stripePublishableKey={STRIPE_PUBLISHABLE_KEY}>
      <Outlet />
    </SubscriptionProvider>
  </ClerkProvider>
);

const PaywallRoot = () => {
  const { isLoaded: isLoadedStripe, subscription, redirectToCheckout } = useSubscription();

  if (!isLoadedStripe) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader className="animate-spin stroke-slate-500" />
      </div>
    );
  }
  if (isLoadedStripe && !subscription) {
    redirectToCheckout({ price: VITE_STRIPE_PRICE_ID });
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
    element: <StripeClerkLayout />,
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
            ],
          },
        ],
      },
    ],
  },
]);
